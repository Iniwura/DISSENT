"""Fail-closed controlled executor for the Dissent Execution Gate.

This module is intentionally separate from the browser UI. The controlled
executor owns the wallet/provider callbacks and any tool credentials. It never
accepts a frontend-supplied verdict; it reads the authoritative gate state and
payload from the chain before authorizing, consuming, and running a tool.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Mapping, Protocol

from eth_hash.auto import keccak
from eth_utils import to_checksum_address


ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
MAX_AUTHORIZATION_AGE_SECONDS = 900
REQUIRED_PAYLOAD_FIELDS = (
    "action",
    "chain_id",
    "contract_address",
    "evidence_url",
    "execution_executor",
    "execution_recipient",
    "objective",
    "policy",
    "proposal_id",
    "proposer",
)


class GateDenied(Exception):
    """A missing or unsafe authoritative condition denies execution."""


class ControlledTool(Protocol):
    def run(self, payload: Mapping[str, str]) -> str: ...


@dataclass(frozen=True)
class GateState:
    enabled: bool
    chain_id: int
    contract_address: str
    proposal_id: str
    execution_executor: str
    action_digest: str
    status: str
    execution_authorized: bool
    authorized_action_digest: str
    authorized_at: int
    execution_consumed: bool
    execution_revoked: bool
    revoked_at: int

    @classmethod
    def from_mapping(cls, raw: Mapping[str, Any]) -> "GateState":
        required = (
            "enabled",
            "chain_id",
            "contract_address",
            "proposal_id",
            "execution_executor",
            "action_digest",
            "status",
            "execution_authorized",
            "authorized_action_digest",
            "authorized_at",
            "execution_consumed",
            "execution_revoked",
            "revoked_at",
        )
        if any(key not in raw for key in required):
            raise GateDenied("authoritative gate state is incomplete")
        if not isinstance(raw["enabled"], bool) or not raw["enabled"]:
            raise GateDenied("execution gate is not enabled")
        raw_chain_id = raw["chain_id"]
        if isinstance(raw_chain_id, bool) or not isinstance(raw_chain_id, (int, str)):
            raise GateDenied("authoritative chain ID is invalid")
        try:
            chain_id = int(raw_chain_id)
        except (TypeError, ValueError):
            raise GateDenied("authoritative chain ID is invalid")
        if chain_id <= 0 or (isinstance(raw_chain_id, str) and str(chain_id) != raw_chain_id):
            raise GateDenied("authoritative chain ID is invalid")
        if not all(isinstance(raw[key], str) for key in required if key not in {"enabled", "chain_id", "execution_authorized", "authorized_at", "execution_consumed", "execution_revoked", "revoked_at"}):
            raise GateDenied("authoritative gate state has invalid text")
        if not isinstance(raw["execution_authorized"], bool) or not isinstance(raw["execution_consumed"], bool):
            raise GateDenied("authoritative gate state has invalid flags")
        if not isinstance(raw["execution_revoked"], bool):
            raise GateDenied("authoritative revocation state has invalid flags")
        if not isinstance(raw["authorized_at"], int) or isinstance(raw["authorized_at"], bool) or raw["authorized_at"] < 0:
            raise GateDenied("authoritative authorization timestamp is invalid")
        if not isinstance(raw["revoked_at"], int) or isinstance(raw["revoked_at"], bool) or raw["revoked_at"] < 0:
            raise GateDenied("authoritative revocation timestamp is invalid")
        return cls(
            enabled=True,
            chain_id=chain_id,
            contract_address=raw["contract_address"],
            proposal_id=raw["proposal_id"],
            execution_executor=raw["execution_executor"],
            action_digest=raw["action_digest"],
            status=raw["status"],
            execution_authorized=raw["execution_authorized"],
            authorized_action_digest=raw["authorized_action_digest"],
            authorized_at=raw["authorized_at"],
            execution_consumed=raw["execution_consumed"],
            execution_revoked=raw["execution_revoked"],
            revoked_at=raw["revoked_at"],
        )


def canonical_payload(payload: Mapping[str, str]) -> str:
    if set(payload) != set(REQUIRED_PAYLOAD_FIELDS):
        raise GateDenied("action payload fields are not exact")
    if any(not isinstance(payload[key], str) or not payload[key].strip() for key in REQUIRED_PAYLOAD_FIELDS):
        raise GateDenied("action payload contains invalid text")
    canonical = dict(payload)
    for field in ("contract_address", "execution_executor", "execution_recipient", "proposer"):
        try:
            canonical[field] = to_checksum_address(canonical[field]).lower()
        except (TypeError, ValueError) as error:
            raise GateDenied(f"action payload contains an invalid {field}") from error
    if not canonical["chain_id"].isdigit() or str(int(canonical["chain_id"])) != canonical["chain_id"]:
        raise GateDenied("action payload contains an invalid chain_id")
    return json.dumps(canonical, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def action_digest(payload: Mapping[str, str]) -> str:
    return keccak(canonical_payload(payload).encode("utf-8")).hex()


def _same_address(left: str, right: str) -> bool:
    return isinstance(left, str) and isinstance(right, str) and left.lower() == right.lower()


@dataclass(frozen=True)
class GateExecutionResult:
    outcome: str
    proposal_id: str
    digest: str | None
    reason: str
    tool_result: str | None = None


class AppendOnlyExecutionLog:
    """A real, reversible local test tool with no financial side effect."""

    def __init__(self, path: Path):
        self.path = path

    def run(self, payload: Mapping[str, str]) -> str:
        record = {
            "action": payload["action"],
            "proposal_id": payload["proposal_id"],
            "recipient": payload["execution_recipient"],
        }
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, sort_keys=True) + "\n")
            handle.flush()
        return "append-only execution log updated"


class ControlledExecutor:
    """Verify, authorize, consume, then run one controlled operation."""

    def __init__(
        self,
        executor_address: str,
        expected_chain_id: int,
        expected_contract_address: str,
        read_state: Callable[[str], tuple[Mapping[str, Any], Mapping[str, Any], bool]],
        authorize: Callable[[str, str], None],
        consume: Callable[[str, str], None],
    ):
        self.executor_address = executor_address
        self.expected_chain_id = expected_chain_id
        self.expected_contract_address = expected_contract_address
        self.read_state = read_state
        self.authorize = authorize
        self.consume = consume

    def _verify(self, proposal_id: str, payload: Mapping[str, str]) -> tuple[GateState, str]:
        raw_gate, raw_payload = self._read_finalized(proposal_id)
        state = GateState.from_mapping(raw_gate)
        if state.chain_id != self.expected_chain_id:
            raise GateDenied("authoritative chain ID does not match executor configuration")
        if not _same_address(state.contract_address, self.expected_contract_address):
            raise GateDenied("authoritative contract does not match executor configuration")
        if state.proposal_id != proposal_id:
            raise GateDenied("proposal identity does not match authoritative state")
        if state.status != "CLEAR":
            raise GateDenied(f"authoritative decision is {state.status}, not CLEAR")
        if state.execution_consumed:
            raise GateDenied("authorization is already used or in progress")
        if state.execution_revoked:
            raise GateDenied("authorization was revoked")
        if not _same_address(state.execution_executor, self.executor_address):
            raise GateDenied("controlled executor address does not match")
        if not isinstance(raw_payload, Mapping):
            raise GateDenied("authoritative action payload is unavailable")
        stored_payload = {key: raw_payload.get(key) for key in REQUIRED_PAYLOAD_FIELDS}
        stored_digest = action_digest(stored_payload)  # type: ignore[arg-type]
        supplied_digest = action_digest(payload)
        if stored_digest != state.action_digest:
            raise GateDenied("authoritative payload digest is internally inconsistent")
        if supplied_digest != stored_digest:
            raise GateDenied("supplied action payload does not match authorization")
        return state, supplied_digest

    def execute(self, proposal_id: str, payload: Mapping[str, str], tool: ControlledTool) -> GateExecutionResult:
        try:
            initial_state, digest = self._verify(proposal_id, payload)
            if not initial_state.execution_authorized:
                self.authorize(proposal_id, digest)
            authorized_state, _ = self._verify_authorized(proposal_id, payload, digest)
            if authorized_state.execution_consumed:
                raise GateDenied("authorization was consumed before the tool boundary")
            self.consume(proposal_id, digest)
            consumed_gate, _ = self._read_finalized(proposal_id)
            consumed = GateState.from_mapping(consumed_gate)
            if consumed.status != "EXECUTED" or not consumed.execution_consumed:
                raise GateDenied("authoritative consume confirmation is unavailable")
        except GateDenied as error:
            return GateExecutionResult("DENIED", proposal_id, None, str(error))
        except Exception as error:
            return GateExecutionResult("DENIED", proposal_id, None, f"chain unavailable or write failed: {error}")

        try:
            result = tool.run(payload)
        except Exception as error:
            return GateExecutionResult("TOOL_FAILED", proposal_id, digest, f"authorization consumed; tool failed: {error}")
        return GateExecutionResult("EXECUTED", proposal_id, digest, "controlled action completed", result)

    def _verify_authorized(self, proposal_id: str, payload: Mapping[str, str], digest: str) -> tuple[GateState, str]:
        raw_gate, raw_payload = self._read_finalized(proposal_id)
        state = GateState.from_mapping(raw_gate)
        if state.chain_id != self.expected_chain_id:
            raise GateDenied("authoritative chain ID does not match executor configuration")
        if not _same_address(state.contract_address, self.expected_contract_address):
            raise GateDenied("authoritative contract does not match executor configuration")
        if state.proposal_id != proposal_id:
            raise GateDenied("proposal identity changed at authorization boundary")
        if state.status != "CLEAR" or not state.execution_authorized:
            raise GateDenied("authorization was not confirmed on chain")
        if state.execution_consumed:
            raise GateDenied("authorization was consumed before the tool boundary")
        if state.execution_revoked:
            raise GateDenied("authorization was revoked before the tool boundary")
        if not _same_address(state.execution_executor, self.executor_address):
            raise GateDenied("controlled executor changed at authorization boundary")
        if state.authorized_action_digest != digest:
            raise GateDenied("authorized digest does not match")
        now = int(time.time())
        if state.authorized_at <= 0 or now < state.authorized_at:
            raise GateDenied("authorization timestamp is unavailable or in the future")
        if now - state.authorized_at > MAX_AUTHORIZATION_AGE_SECONDS:
            raise GateDenied("authorization has expired in the controlled executor")
        if not isinstance(raw_payload, Mapping):
            raise GateDenied("authoritative action payload is unavailable")
        stored_payload = {key: raw_payload.get(key) for key in REQUIRED_PAYLOAD_FIELDS}
        if action_digest(stored_payload) != state.action_digest:  # type: ignore[arg-type]
            raise GateDenied("authoritative payload changed at authorization boundary")
        return state, action_digest(payload)

    def _read_finalized(self, proposal_id: str) -> tuple[Mapping[str, Any], Mapping[str, Any]]:
        try:
            result = self.read_state(proposal_id)
        except Exception as error:
            raise GateDenied(f"authoritative chain state unavailable: {error}") from error
        if not isinstance(result, tuple) or len(result) != 3:
            raise GateDenied("authoritative read did not include finality")
        raw_gate, raw_payload, finalized = result
        if finalized is not True:
            raise GateDenied("authoritative chain state is not finalized")
        return raw_gate, raw_payload
