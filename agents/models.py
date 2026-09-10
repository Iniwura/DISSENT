from dataclasses import asdict, dataclass
from typing import Any, Literal


@dataclass(frozen=True)
class Opportunity:
    name: str
    action: str
    objective: str
    policy: str
    evidence_url: str
    advertised_apy: float


@dataclass(frozen=True)
class ProposalIntent:
    proposal_id: str
    action: str
    objective: str
    policy: str
    evidence_url: str
    bounty: int
    bond: int
    review_seconds: int

    def contract_call(self) -> dict[str, Any]:
        return {
            "function": "commit",
            "args": [
                self.proposal_id,
                self.action,
                self.objective,
                self.policy,
                self.evidence_url,
                self.bounty,
                self.review_seconds,
            ],
            "value": self.bond + self.bounty,
        }


@dataclass(frozen=True)
class ChallengeIntent:
    proposal_id: str
    challenge_id: str
    agent: str
    objection: str
    evidence_url: str
    stake: int
    confidence: float
    predicted_materiality: Literal["CRITICAL", "MATERIAL", "WEAK"]

    def contract_call(self) -> dict[str, Any]:
        return {
            "function": "challenge",
            "args": [
                self.proposal_id,
                self.challenge_id,
                self.objection,
                self.evidence_url,
            ],
            "value": self.stake,
        }

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class ReviewRun:
    proposal: ProposalIntent
    challenges: tuple[ChallengeIntent, ...]

    def transaction_plan(self) -> list[dict[str, Any]]:
        return [
            {"signer": "treasury-agent", **self.proposal.contract_call()},
            *(
                {"signer": challenge.agent, **challenge.contract_call()}
                for challenge in self.challenges
            ),
            {
                "signer": "settlement-keeper",
                "function": "adjudicate",
                "args": [self.proposal.proposal_id],
                "value": 0,
                "not_before_seconds": self.proposal.review_seconds,
            },
        ]
