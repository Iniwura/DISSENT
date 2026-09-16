"""Local Studio fee-profile exercise for the current Dissent ABI."""

import json
from pathlib import Path

import pytest

from genlayer_py import create_account
from gltest import get_contract_factory, get_default_account
from gltest.clients import get_gl_client

CONTRACT = Path("dissent.py")
pytestmark = pytest.mark.integration
FEE_OPTIONS = {
    "leaderTimeunitsAllocation": 100,
    "validatorTimeunitsAllocation": 200,
    "totalMessageFees": 0,
    "rotations": [1],
}


def _fees():
    estimate = get_gl_client().estimate_transaction_fees(FEE_OPTIONS)
    return {"distribution": estimate["distribution"], "feeValue": estimate["feeValue"]}


def _context(timestamp, proposal_url, challenge_url=None, verdict="CLEAR", challenge_id=None):
    response = {
        "verdict": verdict,
        "summary": "Measured local fee-profile adjudication.",
        "decisions": ([{"id": challenge_id, "status": "ACCEPTED", "reasoning": "Measured evidence-backed objection."}] if challenge_id else []),
    }
    web = {proposal_url: {"method": "GET", "status": 200, "body": "Measured proposal evidence."}}
    if challenge_url:
        web[challenge_url] = {"method": "GET", "status": 200, "body": "Measured challenge evidence."}
    return {"genvm_datetime": timestamp, "validators": [{
        "stake": 8, "provider": "openai", "model": "gpt-4o",
        "config": {"temperature": 0.0, "max_tokens": 500}, "plugin": "openai-compatible",
        "plugin_config": {
            "mock_response": {"response": {".*": json.dumps(response)}},
            "mock_web_response": {"nondet_web_request": web},
        },
    }]}


def _commit(contract, account, proposal_id, url, timestamp, fees):
    return contract.commit(args=[proposal_id, "Publish a verified report", "Record a funded review", "Require the evidence source", url, account.address, 300, 60, 0]).transact(value=1300, fees=fees, wait_until="finalized", wait_interval=100, wait_retries=20, transaction_context={"genvm_datetime": timestamp})


def test_fee_profile_current_dissent_paths():
    proposer = get_default_account()
    challenger = create_account()
    factory = get_contract_factory(contract_file_path=CONTRACT)
    fees = _fees()
    contract = factory.deploy(args=[300, 100, 1000], account=proposer, fees=fees, wait_until="finalized", wait_interval=100, wait_retries=20)

    _commit(contract, proposer, "profile-clear", "https://docs.genlayer.com/developers/consensus-v06-migration", "2026-09-09T12:00:00Z", fees)
    contract.adjudicate(args=["profile-clear"]).transact(fees=fees, wait_until="finalized", wait_interval=100, wait_retries=20, transaction_context=_context("2026-09-09T12:01:00Z", "https://docs.genlayer.com/developers/consensus-v06-migration"))
    contract.execute(args=["profile-clear"]).transact(fees=fees, wait_until="finalized", wait_interval=100, wait_retries=20, transaction_context={"genvm_datetime": "2026-09-09T12:01:01Z"})

    _commit(contract, proposer, "profile-revise-parent", "https://docs.genlayer.com/developers/decentralized-applications/fee-profiling-and-estimation", "2026-09-09T13:00:00Z", fees)
    contract.connect(challenger).challenge(args=["profile-revise-parent", "profile-objection", "The source omits a material control.", "https://docs.genlayer.com/developers/decentralized-applications/fees-and-transaction-kit", 0]).transact(value=100, fees=fees, wait_until="finalized", wait_interval=100, wait_retries=20, transaction_context={"genvm_datetime": "2026-09-09T13:00:01Z"})
    contract.adjudicate(args=["profile-revise-parent"]).transact(fees=fees, wait_until="finalized", wait_interval=100, wait_retries=20, transaction_context=_context("2026-09-09T13:01:00Z", "https://docs.genlayer.com/developers/decentralized-applications/fee-profiling-and-estimation", "https://docs.genlayer.com/developers/decentralized-applications/fees-and-transaction-kit", "REVISE", "profile-objection"))
    contract.revise(args=["profile-revise-parent", "profile-revision", "Publish a corrected report", "Correct the recorded review", "Require the evidence source", "https://docs.genlayer.com/developers/intelligent-contracts/deploying", proposer.address, 300, 60, 0]).transact(value=1300, fees=fees, wait_until="finalized", wait_interval=100, wait_retries=20, transaction_context={"genvm_datetime": "2026-09-09T13:02:00Z"})

    _commit(contract, proposer, "profile-cancel", "https://docs.genlayer.com/developers/intelligent-contracts/deploying", "2026-09-09T14:00:00Z", fees)
    contract.cancel(args=["profile-cancel"]).transact(fees=fees, wait_until="finalized", wait_interval=100, wait_retries=20, transaction_context={"genvm_datetime": "2026-09-16T14:01:00Z"})
