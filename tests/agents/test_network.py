import json

import pytest

from agents.models import Opportunity
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
    assert plan[-1]["function"] == "adjudicate"
    assert plan[-1]["not_before_seconds"] == 60


def test_canonical_demo_is_reproducible():
    demo = build_demo()
    assert demo["proposal"]["proposal_id"] == "treasury-pool-001"
    assert [item["challenge_id"] for item in demo["challenges"]] == [
        "upgrade-key",
        "generic-risk",
    ]
