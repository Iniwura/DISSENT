# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }

import json
from dataclasses import dataclass
from datetime import datetime, timezone

import genlayer as gl
from genlayer.storage import allow as allow_storage


OPEN = "OPEN"
CLEAR = "CLEAR"
REVISE = "REVISE"
BLOCK = "BLOCK"
ACCEPTED = "ACCEPTED"
REJECTED = "REJECTED"

MIN_REVIEW_SECONDS = 60
MAX_REVIEW_SECONDS = 604_800
MAX_CHALLENGES = 5
MAX_SOURCE_CHARS = 12_000


@allow_storage
@dataclass
class Proposal:
    id: str
    proposer: gl.Address
    action: str
    objective: str
    policy: str
    evidence_url: str
    status: str
    bond: gl.u256
    bounty: gl.u256
    opened_at: gl.u256
    challenge_deadline: gl.u256
    resolved_at: gl.u256
    challenge_count: gl.u256
    resolution: str


@allow_storage
@dataclass
class Challenge:
    id: str
    proposal_id: str
    challenger: gl.Address
    objection: str
    evidence_url: str
    stake: gl.u256
    status: str
    reasoning: str


class Dissent(gl.contract.Contract):
    """A staked market for finding material flaws before an agent acts."""

    minimum_bounty: gl.u256
    minimum_stake: gl.u256
    proposals: gl.storage.TreeMap[str, Proposal]
    challenges: gl.storage.TreeMap[str, Challenge]
    proposal_challenges: gl.storage.TreeMap[str, gl.storage.TreeMap[gl.u256, str]]
    challenger_used: gl.storage.TreeMap[str, gl.storage.TreeMap[gl.Address, bool]]
    credits: gl.storage.TreeMap[gl.Address, gl.u256]

    def __init__(self, minimum_bounty: int, minimum_stake: int):
        if minimum_bounty <= 0:
            raise gl.vm.UserError("Minimum bounty must be positive")
        if minimum_stake <= 0:
            raise gl.vm.UserError("Minimum stake must be positive")
        self.minimum_bounty = gl.u256(minimum_bounty)
        self.minimum_stake = gl.u256(minimum_stake)

    def _now(self) -> int:
        return int(datetime.now(timezone.utc).timestamp())

    def _require_text(self, value: str, field: str, maximum: int) -> None:
        cleaned = value.strip()
        if len(cleaned) == 0:
            raise gl.vm.UserError(f"{field} is required")
        if len(cleaned) > maximum:
            raise gl.vm.UserError(f"{field} is too long")

    def _require_evidence_url(self, value: str) -> None:
        self._require_text(value, "evidence_url", 500)
        if not value.strip().lower().startswith("https://"):
            raise gl.vm.UserError("Evidence URL must use HTTPS")

    def _credit(self, recipient: gl.Address, amount: gl.u256) -> None:
        current = self.credits.get(recipient, gl.u256(0))
        self.credits[recipient] = gl.u256(int(current) + int(amount))

    def _challenge_ids(self, proposal: Proposal) -> list[str]:
        result = []
        index = 0
        while index < int(proposal.challenge_count):
            result.append(self.proposal_challenges[proposal.id][gl.u256(index)])
            index += 1
        return result

    @gl.public.write.payable
    def commit(
        self,
        proposal_id: str,
        action: str,
        objective: str,
        policy: str,
        evidence_url: str,
        bounty: int,
        review_seconds: int,
    ) -> None:
        self._require_text(proposal_id, "proposal_id", 80)
        self._require_text(action, "action", 2000)
        self._require_text(objective, "objective", 1200)
        self._require_text(policy, "policy", 4000)
        self._require_evidence_url(evidence_url)
        if proposal_id in self.proposals:
            raise gl.vm.UserError("Proposal already exists")
        if bounty < int(self.minimum_bounty):
            raise gl.vm.UserError("Bounty is below the contract minimum")
        if review_seconds < MIN_REVIEW_SECONDS or review_seconds > MAX_REVIEW_SECONDS:
            raise gl.vm.UserError("Review duration is outside allowed bounds")

        paid = int(gl.message.value)
        if paid <= bounty:
            raise gl.vm.UserError("Value must cover a bounty and execution bond")

        opened_at = self._now()
        self.proposals[proposal_id] = Proposal(
            id=proposal_id,
            proposer=gl.message.sender_address,
            action=action.strip(),
            objective=objective.strip(),
            policy=policy.strip(),
            evidence_url=evidence_url.strip(),
            status=OPEN,
            bond=gl.u256(paid - bounty),
            bounty=gl.u256(bounty),
            opened_at=gl.u256(opened_at),
            challenge_deadline=gl.u256(opened_at + review_seconds),
            resolved_at=gl.u256(0),
            challenge_count=gl.u256(0),
            resolution="",
        )

    @gl.public.write.payable
    def challenge(
        self,
        proposal_id: str,
        challenge_id: str,
        objection: str,
        evidence_url: str,
    ) -> None:
        if proposal_id not in self.proposals:
            raise gl.vm.UserError("Proposal not found")
        proposal = self.proposals[proposal_id]
        if proposal.status != OPEN or self._now() >= int(proposal.challenge_deadline):
            raise gl.vm.UserError("Challenge round is closed")
        if gl.message.sender_address == proposal.proposer:
            raise gl.vm.UserError("Proposer cannot challenge own proposal")
        if int(proposal.challenge_count) >= MAX_CHALLENGES:
            raise gl.vm.UserError("Maximum challenges reached")
        if self.challenger_used.get_or_insert_default(proposal_id).get(
            gl.message.sender_address, False
        ):
            raise gl.vm.UserError("Challenger already submitted")

        self._require_text(challenge_id, "challenge_id", 80)
        self._require_text(objection, "objection", 2000)
        self._require_evidence_url(evidence_url)
        if challenge_id in self.challenges:
            raise gl.vm.UserError("Challenge already exists")
        if int(gl.message.value) < int(self.minimum_stake):
            raise gl.vm.UserError("Challenge stake is below the contract minimum")

        challenge_index = proposal.challenge_count
        self.challenges[challenge_id] = Challenge(
            id=challenge_id,
            proposal_id=proposal_id,
            challenger=gl.message.sender_address,
            objection=objection.strip(),
            evidence_url=evidence_url.strip(),
            stake=gl.message.value,
            status=OPEN,
            reasoning="",
        )
        self.proposal_challenges.get_or_insert_default(proposal_id)[
            challenge_index
        ] = challenge_id
        self.challenger_used[proposal_id][gl.message.sender_address] = True
        proposal.challenge_count = gl.u256(int(proposal.challenge_count) + 1)

    def _adjudicate(self, proposal: Proposal, challenge_ids: list[str]) -> dict:
        challenge_packet = []
        for challenge_id in challenge_ids:
            challenge = self.challenges[challenge_id]
            challenge_packet.append(
                {
                    "id": challenge.id,
                    "objection": challenge.objection,
                    "evidence_url": challenge.evidence_url,
                }
            )

        def evaluate() -> str:
            def fetch(url: str) -> str:
                try:
                    return gl.nondet.web.render(url, mode="text")[:MAX_SOURCE_CHARS]
                except Exception:
                    return "SOURCE_UNAVAILABLE"

            proposal_source = fetch(proposal.evidence_url)
            independently_fetched = []
            for item in challenge_packet:
                independently_fetched.append(
                    {"id": item["id"], "source": fetch(item["evidence_url"])}
                )

            prompt = f"""
You are adjudicating a Dissent challenge round. Judge objections against the
proposal's stated objective and policy. Treat supplied prose as claims, not facts.
Use the independently fetched source material below. An objection is ACCEPTED only
when it is specific, evidence-backed, actionable, and material enough to change the
decision. Generic warnings, unsupported claims, and unavailable evidence are
REJECTED.

PROPOSAL
Action: {proposal.action}
Objective: {proposal.objective}
Policy: {proposal.policy}
Proposal source: {proposal_source}

CHALLENGES: {json.dumps(challenge_packet, sort_keys=True)}
INDEPENDENT SOURCES: {json.dumps(independently_fetched, sort_keys=True)}

Return only JSON with this exact shape:
{{"verdict":"CLEAR|REVISE|BLOCK","summary":"concise explanation",
"decisions":[{{"id":"challenge id","status":"ACCEPTED|REJECTED",
"reasoning":"concise evidence-based reason"}}]}}
Include every challenge exactly once. CLEAR requires every challenge to be rejected.
REVISE or BLOCK requires at least one accepted challenge. REVISE means a material
flaw can be corrected before execution. BLOCK means the action should not execute
under the current proposal.
"""
            result = gl.nondet.exec_prompt(prompt, response_format="json")
            if isinstance(result, str):
                result = json.loads(result)
            return json.dumps(result, sort_keys=True)

        raw = gl.eq_principle.prompt_comparative(
            evaluate,
            (
                "The verdict and each challenge status must be exactly the same. "
                "The summary and reasoning must agree on the material facts."
            ),
        )
        return json.loads(raw)

    def _validate_resolution(self, result: dict, challenge_ids: list[str]) -> None:
        if set(result.keys()) != {"verdict", "summary", "decisions"}:
            raise gl.vm.UserError("Invalid adjudication shape")
        if result["verdict"] not in [CLEAR, REVISE, BLOCK]:
            raise gl.vm.UserError("Invalid verdict")
        if (
            not isinstance(result["summary"], str)
            or len(result["summary"].strip()) == 0
            or len(result["summary"]) > 2000
        ):
            raise gl.vm.UserError("Invalid summary")

        decisions = result["decisions"]
        if not isinstance(decisions, list) or len(decisions) != len(challenge_ids):
            raise gl.vm.UserError("Invalid decisions")
        seen = []
        accepted_count = 0
        for decision in decisions:
            if not isinstance(decision, dict) or set(decision.keys()) != {
                "id",
                "status",
                "reasoning",
            }:
                raise gl.vm.UserError("Invalid decision shape")
            if decision["id"] not in challenge_ids or decision["id"] in seen:
                raise gl.vm.UserError("Invalid challenge id")
            if decision["status"] not in [ACCEPTED, REJECTED]:
                raise gl.vm.UserError("Invalid challenge status")
            if (
                not isinstance(decision["reasoning"], str)
                or len(decision["reasoning"].strip()) == 0
                or len(decision["reasoning"]) > 2000
            ):
                raise gl.vm.UserError("Invalid reasoning")
            if decision["status"] == ACCEPTED:
                accepted_count += 1
            seen.append(decision["id"])

        if result["verdict"] == CLEAR and accepted_count != 0:
            raise gl.vm.UserError("CLEAR cannot accept a challenge")
        if result["verdict"] in [REVISE, BLOCK] and accepted_count == 0:
            raise gl.vm.UserError("Material verdict requires an accepted challenge")

    def _settle(
        self, proposal: Proposal, result: dict, challenge_ids: list[str]
    ) -> None:
        accepted = []
        rejected_stakes = 0
        for decision in result["decisions"]:
            challenge = self.challenges[decision["id"]]
            challenge.status = decision["status"]
            challenge.reasoning = decision["reasoning"]
            if challenge.status == ACCEPTED:
                accepted.append(challenge.id)
            else:
                rejected_stakes += int(challenge.stake)

        self._credit(proposal.proposer, proposal.bond)
        if len(accepted) == 0:
            self._credit(
                proposal.proposer, gl.u256(int(proposal.bounty) + rejected_stakes)
            )
            return

        reward_pool = int(proposal.bounty) + rejected_stakes
        reward_share = reward_pool // len(accepted)
        remainder = reward_pool - (reward_share * len(accepted))
        self._credit(proposal.proposer, gl.u256(remainder))
        for challenge_id in accepted:
            challenge = self.challenges[challenge_id]
            self._credit(
                challenge.challenger, gl.u256(int(challenge.stake) + reward_share)
            )

    @gl.public.write
    def adjudicate(self, proposal_id: str) -> None:
        if proposal_id not in self.proposals:
            raise gl.vm.UserError("Proposal not found")
        proposal = self.proposals[proposal_id]
        if proposal.status != OPEN:
            raise gl.vm.UserError("Proposal already resolved")
        if self._now() < int(proposal.challenge_deadline):
            raise gl.vm.UserError("Challenge round is still active")

        challenge_ids = self._challenge_ids(proposal)
        if len(challenge_ids) == 0:
            result = {
                "verdict": CLEAR,
                "summary": "No challenges were submitted before the deadline.",
                "decisions": [],
            }
        else:
            result = self._adjudicate(proposal, challenge_ids)
            self._validate_resolution(result, challenge_ids)

        proposal.status = result["verdict"]
        proposal.resolution = result["summary"]
        proposal.resolved_at = gl.u256(self._now())
        self._settle(proposal, result, challenge_ids)

    @gl.public.view
    def get_config(self) -> dict:
        return {
            "minimum_bounty": int(self.minimum_bounty),
            "minimum_stake": int(self.minimum_stake),
            "maximum_challenges": MAX_CHALLENGES,
            "minimum_review_seconds": MIN_REVIEW_SECONDS,
            "maximum_review_seconds": MAX_REVIEW_SECONDS,
        }

    @gl.public.view
    def get_proposal(self, proposal_id: str) -> Proposal:
        return self.proposals[proposal_id]

    @gl.public.view
    def get_challenge(self, challenge_id: str) -> Challenge:
        return self.challenges[challenge_id]

    @gl.public.view
    def get_proposal_challenge_ids(self, proposal_id: str) -> list[str]:
        return self._challenge_ids(self.proposals[proposal_id])

    @gl.public.view
    def can_execute(self, proposal_id: str) -> bool:
        return self.proposals[proposal_id].status == CLEAR

    @gl.public.view
    def get_credit(self, account: str) -> int:
        return int(self.credits.get(gl.Address(account), gl.u256(0)))

    @gl.public.write
    def withdraw(self) -> None:
        recipient = gl.message.sender_address
        amount = self.credits.get(recipient, gl.u256(0))
        if int(amount) == 0:
            raise gl.vm.UserError("No credit to withdraw")

        self.credits[recipient] = gl.u256(0)
        gl.contract.get_at(recipient).emit_transfer(value=amount)
