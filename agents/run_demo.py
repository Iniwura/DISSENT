import json
from dataclasses import asdict
from pathlib import Path

from .models import Opportunity
from .network import LocalEvidenceReader, MarketSkeptic, ProxySentinel, ReviewNetwork, TreasuryAgent


def build_demo() -> dict:
    evidence_root = Path(__file__).resolve().parents[1] / "evidence"
    reader = LocalEvidenceReader(evidence_root)
    network = ReviewNetwork(
        treasury=TreasuryAgent(),
        challengers=(
            ProxySentinel(reader, "hyperyield-proxy.json"),
            MarketSkeptic(reader, "market-opinion.json"),
        ),
    )
    opportunity = Opportunity(
        name="HyperYield 40% pool",
        action="Deposit 20,000 USDC into the HyperYield liquidity pool",
        objective="Earn yield without exposing treasury principal to unilateral control",
        policy="Block if an anonymous party can upgrade or drain the pool",
        evidence_url="https://hyperyield.example/pool/0x71f3",
        advertised_apy=40.0,
    )
    review = network.run(opportunity)
    return {
        "proposal": asdict(review.proposal),
        "challenges": [challenge.to_dict() for challenge in review.challenges],
        "transaction_plan": review.transaction_plan(),
    }


if __name__ == "__main__":
    print(json.dumps(build_demo(), indent=2))
