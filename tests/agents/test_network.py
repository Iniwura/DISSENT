import json

import pytest

from agents.models import ChallengeIntent, Opportunity, ProposalIntent
from agents.network import LocalEvidenceReader, MarketSkeptic, ProxySentinel, ReviewNetwork, TreasuryAgent
from agents.run_demo import build_demo


@pytest.fixture
def opportunity():
    return Opportunity(
        name="Pool",
        action="Deposit 20,000 USDC",
        objective="Earn yield without unilateral principal risk",
        policy="Block unilateral upgrade control",
        evidence_url="https://pool.example",
        advertised_apy=40,
    )


def test_local_reader_rejects_path_escape(tmp_path):
    reader = LocalEvidenceReader(tmp_path)
    with pytest.raises(ValueError, match="escapes"):
        reader.read("../outside.json")


def test_proxy_sentinel_submits_only_for_unprotected_upgrade_key(tmp_path, opportunity):
    source = tmp_path / "proxy.json"
    source.write_text(
        json.dumps(
            {
                "canonical_url": "https://explorer.example/proxy",
                "upgradeable": True,
                "admin": {"owner_kind": "EOA", "owner": "0xA11CE", "timelock_seconds": 0},
            }
        ),
        encoding="utf-8",
    )
    proposal = TreasuryAgent().propose(opportunity)
    challenge = ProxySentinel(LocalEvidenceReader(tmp_path), source.name).review(proposal)

    assert challenge is not None
    assert challenge.challenge_id == "upgrade-key"
    assert challenge.predicted_materiality == "CRITICAL"
    assert challenge.contract_call()["value"] == 100
    assert proposal.contract_call()["args"][5] == proposal.execution_recipient
    assert proposal.contract_call()["value"] == 1_300
    assert proposal.bond >= 1_000


def test_agent_calls_subtract_reused_credit_from_native_value(opportunity):
    proposal = TreasuryAgent().propose(opportunity)
    credited_proposal = ProposalIntent(
        proposal_id=proposal.proposal_id,
        action=proposal.action,
        objective=proposal.objective,
        policy=proposal.policy,
        evidence_url=proposal.evidence_url,
        execution_recipient=proposal.execution_recipient,
        bounty=proposal.bounty,
        bond=proposal.bond,
        review_seconds=proposal.review_seconds,
        credit_amount=300,
    )
    challenge = ChallengeIntent(
        proposal_id=proposal.proposal_id,
        challenge_id="credit-challenge",
        agent="challenger",
        objection="Specific objection",
        evidence_url="https://example.com/challenge",
        stake=100,
        confidence=0.9,
        predicted_materiality="MATERIAL",
        credit_amount=100,
    )

    assert credited_proposal.contract_call()["value"] == 1_000
    assert challenge.contract_call()["value"] == 0


def test_proposal_model_rejects_below_minimum_execution_bond(opportunity):
    with pytest.raises(ValueError, match="below the contract minimum"):
        ProposalIntent(
            proposal_id="too-small",
            action=opportunity.action,
            objective=opportunity.objective,
            policy=opportunity.policy,
            evidence_url=opportunity.evidence_url,
            execution_recipient="0x1111111111111111111111111111111111111111",
            bounty=300,
            bond=999,
            review_seconds=60,
        )


def test_proxy_sentinel_abstains_when_timelock_protects_upgrade(tmp_path, opportunity):
    source = tmp_path / "proxy.json"
    source.write_text(
        json.dumps(
            {
                "canonical_url": "https://explorer.example/proxy",
                "upgradeable": True,
                "admin": {"owner_kind": "EOA", "owner": "0xA11CE", "timelock_seconds": 172800},
            }
        ),
        encoding="utf-8",
    )
    proposal = TreasuryAgent().propose(opportunity)
    assert ProxySentinel(LocalEvidenceReader(tmp_path), source.name).review(proposal) is None


def test_review_network_produces_separate_signed_calls(opportunity, tmp_path):
    (tmp_path / "proxy.json").write_text(
        json.dumps(
            {
                "canonical_url": "https://explorer.example/proxy",
                "upgradeable": True,
                "admin": {"owner_kind": "EOA", "owner": "0xA11CE", "timelock_seconds": 0},
            }
        ),
        encoding="utf-8",
    )
    (tmp_path / "opinion.json").write_text(
        json.dumps(
            {"canonical_url": "https://blog.example/risk", "category": "general_market_commentary"}
        ),
        encoding="utf-8",
    )
    reader = LocalEvidenceReader(tmp_path)
    review = ReviewNetwork(
        TreasuryAgent(),
        (ProxySentinel(reader, "proxy.json"), MarketSkeptic(reader, "opinion.json")),
    ).run(opportunity)
    plan = review.transaction_plan()

    assert [call["signer"] for call in plan] == [
        "treasury-agent",
        "proxy-sentinel",
        "market-skeptic",
        "settlement-keeper",
    ]
    assert plan[0]["function"] == "commit"
    assert plan[0]["args"][5] == review.proposal.execution_recipient
    assert plan[0]["args"][-1] == 0
    assert plan[0]["value"] == 1_300
    assert plan[-1]["function"] == "adjudicate"
    assert plan[-1]["not_before_seconds"] == 60


def test_canonical_demo_is_reproducible():
    demo = build_demo()
    assert demo["proposal"]["proposal_id"] == "treasury-pool-001"
    assert [item["challenge_id"] for item in demo["challenges"]] == [
        "upgrade-key",
        "generic-risk",
    ]
