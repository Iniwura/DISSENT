from dataclasses import asdict, dataclass
from typing import Any, Literal


MINIMUM_EXECUTION_BOND = 1_000


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
    execution_recipient: str
    bounty: int
    bond: int
    review_seconds: int
    credit_amount: int = 0

    def __post_init__(self) -> None:
        if self.bond < MINIMUM_EXECUTION_BOND:
            raise ValueError("Execution bond is below the contract minimum")
        if self.credit_amount < 0 or self.credit_amount > self.bounty + self.bond:
            raise ValueError("Credit amount exceeds planned proposal funding")

    def contract_call(self) -> dict[str, Any]:
        return {
            "function": "commit",
            "args": [
                self.proposal_id,
                self.action,
                self.objective,
                self.policy,
                self.evidence_url,
                self.execution_recipient,
                self.bounty,
                self.review_seconds,
                self.credit_amount,
            ],
            "value": self.bond + self.bounty - self.credit_amount,
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
    credit_amount: int = 0

    def __post_init__(self) -> None:
        if self.credit_amount < 0 or self.credit_amount > self.stake:
            raise ValueError("Credit amount exceeds planned challenge stake")

    def contract_call(self) -> dict[str, Any]:
        return {
            "function": "challenge",
            "args": [
                self.proposal_id,
                self.challenge_id,
                self.objection,
                self.evidence_url,
                self.credit_amount,
            ],
            "value": self.stake - self.credit_amount,
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
