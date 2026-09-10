import json

from tests.direct.conftest import to_hex


CONTRACT = "contracts/dissent.py"
OPENED_AT = "2026-09-09T12:00:00Z"
AFTER_DEADLINE = "2026-09-09T12:02:00Z"


def _deploy(vm, deploy):
    vm.warp(OPENED_AT)
    return deploy(CONTRACT, 300, 100)


def _commit(contract, vm, proposer, bounty=300, total=1_300, review_seconds=60):
    vm.sender = proposer
    vm.value = total
    contract.commit(
        "treasury-pool-001",
        "Deposit 20,000 USDC into the HyperYield pool advertising 40% APY",
        "Earn yield without exposing principal to unilateral control",
        "Block if an anonymous party can upgrade or drain the pool",
        "https://proposal.example/pool",
        bounty,
        review_seconds,
    )
    vm.value = 0


def _challenge(contract, vm, challenger, challenge_id, objection, url, stake=100):
    vm.sender = challenger
    vm.value = stake
    contract.challenge("treasury-pool-001", challenge_id, objection, url)
    vm.value = 0


def _mock_sources(vm):
    vm.mock_web(
        r"proposal\.example/pool",
        {"status": 200, "body": "HyperYield pool. Advertised APY: 40%."},
    )
    vm.mock_web(
        r"explorer\.example/proxy",
        {
            "status": 200,
            "body": "Upgradeable proxy. ProxyAdmin owner: 0xA11CE. No timelock.",
        },
    )
    vm.mock_web(
        r"blog\.example/opinion",
        {"status": 200, "body": "Opinion: all cryptocurrency can be risky."},
    )


def test_config_is_exposed(direct_vm, direct_deploy):
    contract = _deploy(direct_vm, direct_deploy)
    assert contract.get_config() == {
        "minimum_bounty": 300,
        "minimum_stake": 100,
        "maximum_challenges": 5,
        "minimum_review_seconds": 60,
        "maximum_review_seconds": 604_800,
    }


def test_commit_opens_timed_round_and_splits_value(
    direct_vm, direct_deploy, direct_alice
):
    contract = _deploy(direct_vm, direct_deploy)
    _commit(contract, direct_vm, direct_alice)

    proposal = contract.get_proposal("treasury-pool-001")
    assert proposal.status == "OPEN"
    assert int(proposal.bond) == 1_000
    assert int(proposal.bounty) == 300
    assert int(proposal.challenge_deadline) - int(proposal.opened_at) == 60
    assert proposal.proposer.as_hex == to_hex(direct_alice)
    assert contract.can_execute("treasury-pool-001") is False


def test_commit_enforces_bounty_duration_and_https(
    direct_vm, direct_deploy, direct_alice
):
    contract = _deploy(direct_vm, direct_deploy)
    direct_vm.sender = direct_alice
    direct_vm.value = 1_300

    with direct_vm.expect_revert("Bounty is below the contract minimum"):
        contract.commit("p-1", "act", "goal", "policy", "https://source", 299, 60)
    with direct_vm.expect_revert("Review duration is outside allowed bounds"):
        contract.commit("p-2", "act", "goal", "policy", "https://source", 300, 59)
    with direct_vm.expect_revert("Evidence URL must use HTTPS"):
        contract.commit("p-3", "act", "goal", "policy", "http://source", 300, 60)


def test_challenge_records_stake_and_contract_owned_order(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = _deploy(direct_vm, direct_deploy)
    _commit(contract, direct_vm, direct_alice)
    _challenge(
        contract,
        direct_vm,
        direct_bob,
        "upgrade-key",
        "An anonymous owner can replace the implementation",
        "https://explorer.example/proxy",
    )

    challenge = contract.get_challenge("upgrade-key")
    assert challenge.status == "OPEN"
    assert int(challenge.stake) == 100
    assert contract.get_proposal_challenge_ids("treasury-pool-001") == [
        "upgrade-key"
    ]


def test_proposer_cannot_self_challenge(
    direct_vm, direct_deploy, direct_alice
):
    contract = _deploy(direct_vm, direct_deploy)
    _commit(contract, direct_vm, direct_alice)
    direct_vm.sender = direct_alice
    direct_vm.value = 100

    with direct_vm.expect_revert("Proposer cannot challenge own proposal"):
        contract.challenge(
            "treasury-pool-001",
            "self",
            "Attempt to reclaim bounty",
            "https://evidence.example/self",
        )


def test_one_challenge_per_address(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = _deploy(direct_vm, direct_deploy)
    _commit(contract, direct_vm, direct_alice)
    _challenge(
        contract,
        direct_vm,
        direct_bob,
        "first",
        "First objection",
        "https://evidence.example/first",
    )
    direct_vm.sender = direct_bob
    direct_vm.value = 100

    with direct_vm.expect_revert("Challenger already submitted"):
        contract.challenge(
            "treasury-pool-001",
            "second",
            "Second objection",
            "https://evidence.example/second",
        )


def test_round_rejects_early_adjudication_and_late_challenge(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = _deploy(direct_vm, direct_deploy)
    _commit(contract, direct_vm, direct_alice)

    with direct_vm.expect_revert("Challenge round is still active"):
        contract.adjudicate("treasury-pool-001")

    direct_vm.warp(AFTER_DEADLINE)
    direct_vm.sender = direct_bob
    direct_vm.value = 100
    with direct_vm.expect_revert("Challenge round is closed"):
        contract.challenge(
            "treasury-pool-001",
            "late",
            "Late objection",
            "https://evidence.example/late",
        )


def test_no_challenge_round_clears_without_llm_cost(
    direct_vm, direct_deploy, direct_alice
):
    contract = _deploy(direct_vm, direct_deploy)
    _commit(contract, direct_vm, direct_alice)
    direct_vm.warp(AFTER_DEADLINE)

    contract.adjudicate("treasury-pool-001")

    assert contract.get_proposal("treasury-pool-001").status == "CLEAR"
    assert contract.can_execute("treasury-pool-001") is True
    assert contract.get_credit(to_hex(direct_alice)) == 1_300


def test_block_rewards_material_challenger_and_slashes_noise(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = _deploy(direct_vm, direct_deploy)
    _commit(contract, direct_vm, direct_alice)
    _challenge(
        contract,
        direct_vm,
        direct_bob,
        "upgrade-key",
        "The anonymous owner can upgrade the pool implementation and move funds",
        "https://explorer.example/proxy",
    )
    _challenge(
        contract,
        direct_vm,
        direct_charlie,
        "crypto-risky",
        "Crypto is risky",
        "https://blog.example/opinion",
    )
    _mock_sources(direct_vm)
    direct_vm.mock_llm(
        r".*",
        json.dumps(
            {
                "verdict": "BLOCK",
                "summary": "An untimelocked upgrade key violates principal safety.",
                "decisions": [
                    {
                        "id": "upgrade-key",
                        "status": "ACCEPTED",
                        "reasoning": "Explorer evidence confirms unilateral upgrades.",
                    },
                    {
                        "id": "crypto-risky",
                        "status": "REJECTED",
                        "reasoning": "The warning is generic and not proposal-specific.",
                    },
                ],
            }
        ),
    )
    direct_vm.warp(AFTER_DEADLINE)

    contract.adjudicate("treasury-pool-001")

    assert contract.get_proposal("treasury-pool-001").status == "BLOCK"
    assert contract.can_execute("treasury-pool-001") is False
    assert contract.get_challenge("upgrade-key").status == "ACCEPTED"
    assert contract.get_challenge("crypto-risky").status == "REJECTED"
    assert contract.get_credit(to_hex(direct_alice)) == 1_000
    assert contract.get_credit(to_hex(direct_bob)) == 500
    assert contract.get_credit(to_hex(direct_charlie)) == 0


def test_clear_returns_bounty_and_rejected_stake_to_proposer(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = _deploy(direct_vm, direct_deploy)
    _commit(contract, direct_vm, direct_alice)
    _challenge(
        contract,
        direct_vm,
        direct_bob,
        "vague",
        "This seems unsafe",
        "https://blog.example/opinion",
    )
    _mock_sources(direct_vm)
    direct_vm.mock_llm(
        r".*",
        json.dumps(
            {
                "verdict": "CLEAR",
                "summary": "No material evidence-backed objection survives.",
                "decisions": [
                    {
                        "id": "vague",
                        "status": "REJECTED",
                        "reasoning": "The claim is neither specific nor supported.",
                    }
                ],
            }
        ),
    )
    direct_vm.warp(AFTER_DEADLINE)

    contract.adjudicate("treasury-pool-001")

    assert contract.get_proposal("treasury-pool-001").status == "CLEAR"
    assert contract.get_credit(to_hex(direct_alice)) == 1_400
    assert contract.get_credit(to_hex(direct_bob)) == 0


def test_rejects_clear_verdict_with_accepted_challenge(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = _deploy(direct_vm, direct_deploy)
    _commit(contract, direct_vm, direct_alice)
    _challenge(
        contract,
        direct_vm,
        direct_bob,
        "upgrade-key",
        "Owner can upgrade",
        "https://explorer.example/proxy",
    )
    _mock_sources(direct_vm)
    direct_vm.mock_llm(
        r".*",
        json.dumps(
            {
                "verdict": "CLEAR",
                "summary": "Inconsistent output.",
                "decisions": [
                    {
                        "id": "upgrade-key",
                        "status": "ACCEPTED",
                        "reasoning": "The upgrade key is material.",
                    }
                ],
            }
        ),
    )
    direct_vm.warp(AFTER_DEADLINE)

    with direct_vm.expect_revert("CLEAR cannot accept a challenge"):
        contract.adjudicate("treasury-pool-001")


def test_rejects_material_verdict_without_accepted_challenge(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = _deploy(direct_vm, direct_deploy)
    _commit(contract, direct_vm, direct_alice)
    _challenge(
        contract,
        direct_vm,
        direct_bob,
        "vague",
        "This seems unsafe",
        "https://blog.example/opinion",
    )
    _mock_sources(direct_vm)
    direct_vm.mock_llm(
        r".*",
        json.dumps(
            {
                "verdict": "BLOCK",
                "summary": "Inconsistent output.",
                "decisions": [
                    {
                        "id": "vague",
                        "status": "REJECTED",
                        "reasoning": "The claim is generic.",
                    }
                ],
            }
        ),
    )
    direct_vm.warp(AFTER_DEADLINE)

    with direct_vm.expect_revert("Material verdict requires an accepted challenge"):
        contract.adjudicate("treasury-pool-001")
