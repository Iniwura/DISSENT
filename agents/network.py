import json
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from .models import ChallengeIntent, Opportunity, ProposalIntent, ReviewRun


class EvidenceReader(Protocol):
    def read(self, source: str) -> dict: ...


@dataclass(frozen=True)
class LocalEvidenceReader:
    root: Path

    def read(self, source: str) -> dict:
        path = (self.root / source).resolve()
        if self.root.resolve() not in path.parents:
            raise ValueError("Evidence path escapes the configured root")
        with path.open(encoding="utf-8") as handle:
            document = json.load(handle)
        if not isinstance(document, dict):
            raise ValueError("Evidence document must be a JSON object")
        return document


@dataclass(frozen=True)
class TreasuryAgent:
    name: str = "treasury-agent"

    def propose(self, opportunity: Opportunity) -> ProposalIntent:
        if opportunity.advertised_apy < 10:
            raise ValueError("Opportunity is below the treasury's review threshold")
        return ProposalIntent(
            proposal_id="treasury-pool-001",
            action=opportunity.action,
            objective=opportunity.objective,
            policy=opportunity.policy,
            evidence_url=opportunity.evidence_url,
            bounty=300,
            bond=1_000,
            review_seconds=60,
        )


@dataclass(frozen=True)
class ProxySentinel:
    reader: EvidenceReader
    source: str
    name: str = "proxy-sentinel"

    def review(self, proposal: ProposalIntent) -> ChallengeIntent | None:
        evidence = self.reader.read(self.source)
        upgradeable = evidence.get("upgradeable") is True
        owner_kind = evidence.get("admin", {}).get("owner_kind")
        timelock = evidence.get("admin", {}).get("timelock_seconds")

        if not upgradeable or owner_kind != "EOA" or timelock not in (0, None):
            return None

        owner = evidence["admin"].get("owner", "unknown")
        return ChallengeIntent(
            proposal_id=proposal.proposal_id,
            challenge_id="upgrade-key",
            agent=self.name,
            objection=(
                f"The pool is upgradeable by EOA {owner} without a timelock. "
                "That owner can replace the implementation before the treasury exits."
            ),
            evidence_url=evidence["canonical_url"],
            stake=100,
            confidence=0.98,
            predicted_materiality="CRITICAL",
        )


@dataclass(frozen=True)
class MarketSkeptic:
    reader: EvidenceReader
    source: str
    name: str = "market-skeptic"

    def review(self, proposal: ProposalIntent) -> ChallengeIntent | None:
        evidence = self.reader.read(self.source)
        if evidence.get("category") != "general_market_commentary":
            return None
        return ChallengeIntent(
            proposal_id=proposal.proposal_id,
            challenge_id="generic-risk",
            agent=self.name,
            objection="Crypto assets are volatile and unusually high APY is generally risky.",
            evidence_url=evidence["canonical_url"],
            stake=100,
            confidence=0.42,
            predicted_materiality="WEAK",
        )


@dataclass(frozen=True)
class ReviewNetwork:
    treasury: TreasuryAgent
    challengers: tuple[ProxySentinel | MarketSkeptic, ...]

    def run(self, opportunity: Opportunity) -> ReviewRun:
        proposal = self.treasury.propose(opportunity)
        findings = tuple(
            finding
            for challenger in self.challengers
            if (finding := challenger.review(proposal)) is not None
        )
        return ReviewRun(proposal=proposal, challenges=findings)
