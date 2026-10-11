import json

import pytest
from eth_hash.auto import keccak

from tests.direct.test_dissent import AFTER_DEADLINE, CONTRACT, _deploy, _mock_sources, to_hex


EXECUTOR = "0x00000000000000000000000000000000000000e1"
RECIPIENT = "0x00000000000000000000000000000000000000e2"
EXECUTOR_BYTES = bytes.fromhex(EXECUTOR[2:])


def _digest(payload: dict[str, str]) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return keccak(encoded.encode("utf-8")).hex()


def _commit_gate(contract, vm, proposer, proposal_id="gate-001", action="Append a line to the controlled execution log"):
    vm.sender = proposer
    vm.value = 1_300
    contract.commit_execution_gate(
        proposal_id,
        action,
        "Record an approved safe test operation",
        "Block if the action or recipient changes after review",
        "https://proposal.example/gate",
        RECIPIENT,
        EXECUTOR,
        300,
        60,
        0,
    )
    vm.value = 0


def _resolve_clear(contract, vm):
    vm.mock_web(
        r"proposal\.example/gate",
        {"status": 200, "body": "Controlled append-only test operation."},
    )
    _mock_sources(vm)
    vm.warp(AFTER_DEADLINE)
    contract.adjudicate("gate-001")


def test_gate_binds_exact_payload_and_executor(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_vm, direct_deploy)
    _commit_gate(contract, direct_vm, direct_alice)

    payload = contract.get_execution_payload("gate-001")
    expected = {
        "action": "Append a line to the controlled execution log",
        "chain_id": payload["chain_id"],
        "contract_address": payload["contract_address"],
        "evidence_url": "https://proposal.example/gate",
        "execution_executor": payload["execution_executor"],
        "execution_recipient": payload["execution_recipient"],
        "objective": "Record an approved safe test operation",
        "policy": "Block if the action or recipient changes after review",
        "proposal_id": "gate-001",
        "proposer": payload["proposer"],
    }
    assert {key: payload[key] for key in expected} == expected
    expected["chain_id"] = str(expected["chain_id"])
    assert payload["action_digest"] == _digest(expected)

    gate = contract.get_execution_gate("gate-001")
    assert gate["enabled"] is True
    assert gate["chain_id"] == payload["chain_id"]
    assert gate["execution_executor"] == EXECUTOR
    assert gate["execution_authorized"] is False
    assert gate["execution_consumed"] is False
    assert gate["execution_revoked"] is False


def test_gate_digest_preserves_utf8_payload_bytes(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_vm, direct_deploy)
    _commit_gate(contract, direct_vm, direct_alice, proposal_id="gate-unicode", action="Append café ✅")

    payload = contract.get_execution_payload("gate-unicode")
    expected = {
        "action": "Append café ✅",
        "chain_id": str(payload["chain_id"]),
        "contract_address": payload["contract_address"],
        "evidence_url": "https://proposal.example/gate",
        "execution_executor": payload["execution_executor"],
        "execution_recipient": payload["execution_recipient"],
        "objective": "Record an approved safe test operation",
        "policy": "Block if the action or recipient changes after review",
        "proposal_id": "gate-unicode",
        "proposer": payload["proposer"],
    }
    assert payload["action_digest"] == _digest(expected)


def test_gate_requires_clear_and_executor_authorization(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _deploy(direct_vm, direct_deploy)
    _commit_gate(contract, direct_vm, direct_alice)
    digest = contract.get_execution_gate("gate-001")["action_digest"]

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Only CLEAR proposals can be authorized"):
        contract.authorize_execution("gate-001", digest)

    direct_vm.sender = EXECUTOR_BYTES
    with direct_vm.expect_revert("Only CLEAR proposals can be authorized"):
        contract.authorize_execution("gate-001", digest)


def test_gate_rejects_altered_payload_digest(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_vm, direct_deploy)
    _commit_gate(contract, direct_vm, direct_alice)
    _resolve_clear(contract, direct_vm)

    direct_vm.sender = EXECUTOR_BYTES
    altered = "0" * 64
    with direct_vm.expect_revert("Action digest does not match proposal"):
        contract.authorize_execution("gate-001", altered)
    assert contract.get_execution_gate("gate-001")["execution_authorized"] is False


def test_gate_clear_authorize_consume_and_replay_fail(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _deploy(direct_vm, direct_deploy)
    _commit_gate(contract, direct_vm, direct_alice)
    _resolve_clear(contract, direct_vm)
    digest = contract.get_execution_gate("gate-001")["action_digest"]

    direct_vm.sender = EXECUTOR_BYTES
    contract.authorize_execution("gate-001", digest)
    gate = contract.get_execution_gate("gate-001")
    assert gate["execution_authorized"] is True
    assert gate["authorized_action_digest"] == digest
    assert gate["execution_consumed"] is False

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Only the controlled executor can consume"):
        contract.consume_execution("gate-001", digest)

    direct_vm.sender = EXECUTOR_BYTES
    contract.consume_execution("gate-001", digest)
    gate = contract.get_execution_gate("gate-001")
    proposal = contract.get_proposal("gate-001")
    assert proposal.status == "EXECUTED"
    assert gate["execution_consumed"] is True
    assert int(proposal.outstanding_bond) == 0
    assert contract.get_credit(RECIPIENT) == 1_000

    with direct_vm.expect_revert("Execution is not CLEAR"):
        contract.consume_execution("gate-001", digest)


def test_gate_rejects_wrong_executor_after_clear(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _deploy(direct_vm, direct_deploy)
    _commit_gate(contract, direct_vm, direct_alice)
    _resolve_clear(contract, direct_vm)
    digest = contract.get_execution_gate("gate-001")["action_digest"]

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Only the controlled executor can authorize"):
        contract.authorize_execution("gate-001", digest)


def test_gate_proposer_revocation_cancels_and_refunds_bond(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_vm, direct_deploy)
    _commit_gate(contract, direct_vm, direct_alice)
    _resolve_clear(contract, direct_vm)
    digest = contract.get_execution_gate("gate-001")["action_digest"]

    direct_vm.sender = EXECUTOR_BYTES
    contract.authorize_execution("gate-001", digest)
    direct_vm.sender = direct_alice
    contract.revoke_execution("gate-001")

    gate = contract.get_execution_gate("gate-001")
    assert gate["status"] == "CANCELLED"
    assert gate["execution_revoked"] is True
    assert gate["execution_consumed"] is False
    assert int(contract.get_proposal("gate-001").outstanding_bond) == 0
    assert contract.get_credit(direct_alice) == 1_300

    direct_vm.sender = EXECUTOR_BYTES
    with direct_vm.expect_revert("Execution is not CLEAR"):
        contract.consume_execution("gate-001", digest)


def test_gate_legacy_execute_path_is_blocked(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_vm, direct_deploy)
    _commit_gate(contract, direct_vm, direct_alice)
    _resolve_clear(contract, direct_vm)

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Gate proposal requires controlled executor"):
        contract.execute("gate-001")


def test_gate_cannot_authorize_blocked_proposal(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _deploy(direct_vm, direct_deploy)
    _commit_gate(contract, direct_vm, direct_alice)
    direct_vm.sender = direct_bob
    direct_vm.value = 100
    contract.challenge(
        "gate-001",
        "blocking-objection",
        "The approved recipient can be changed outside the gate",
        "https://explorer.example/proxy",
        0,
    )
    direct_vm.value = 0
    _mock_sources(direct_vm)
    direct_vm.mock_web(
        r"proposal\.example/gate",
        {"status": 200, "body": "Controlled append-only test operation."},
    )
    direct_vm.mock_llm(
        r".*",
        json.dumps(
            {
                "verdict": "BLOCK",
                "summary": "The recipient control is unsafe.",
                "decisions": [
                    {
                        "id": "blocking-objection",
                        "status": "ACCEPTED",
                        "reasoning": "The evidence is material.",
                    }
                ],
            }
        ).encode(),
    )
    direct_vm.warp(AFTER_DEADLINE)
    contract.adjudicate("gate-001")

    direct_vm.sender = EXECUTOR_BYTES
    with direct_vm.expect_revert("Only CLEAR proposals can be authorized"):
        contract.authorize_execution("gate-001", contract.get_execution_gate("gate-001")["action_digest"])


@pytest.mark.parametrize("method", ["authorize_execution", "consume_execution"])
def test_gate_rejects_unknown_proposal_without_side_effects(direct_vm, direct_deploy, direct_alice, method):
    contract = _deploy(direct_vm, direct_deploy)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Proposal not found"):
        getattr(contract, method)("missing", "0" * 64)
