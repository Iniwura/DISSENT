import threading
import time
from pathlib import Path

from agents.execution_gate import (
    MAX_AUTHORIZATION_AGE_SECONDS,
    AppendOnlyExecutionLog,
    ControlledExecutor,
    action_digest,
)


EXECUTOR = "0x00000000000000000000000000000000000000e1"
CHAIN_ID = 61997
CONTRACT_ADDRESS = "0x00000000000000000000000000000000000000c4"


def payload(action: str = "append approved test record") -> dict[str, str]:
    return {
        "action": action,
        "chain_id": str(CHAIN_ID),
        "contract_address": CONTRACT_ADDRESS,
        "evidence_url": "https://example.com/evidence",
        "execution_executor": EXECUTOR,
        "execution_recipient": "0x00000000000000000000000000000000000000e2",
        "objective": "exercise the controlled tool",
        "policy": "deny changes after CLEAR",
        "proposal_id": "gate-001",
        "proposer": "0x00000000000000000000000000000000000000e3",
    }


def state_for(payload_value: dict[str, str], **overrides):
    digest = action_digest(payload_value)
    state = {
        "enabled": True,
        "chain_id": CHAIN_ID,
        "contract_address": CONTRACT_ADDRESS,
        "proposal_id": payload_value["proposal_id"],
        "execution_executor": EXECUTOR,
        "action_digest": digest,
        "status": "CLEAR",
        "execution_authorized": False,
        "authorized_action_digest": "",
        "authorized_at": 0,
        "execution_consumed": False,
        "execution_revoked": False,
        "revoked_at": 0,
    }
    state.update(overrides)
    return state


def executor_for(state, authoritative_payload, finalized=True, finality_sequence=None, executor_address=EXECUTOR):
    reads = [state]
    finalities = list(finality_sequence or [])

    def read(_proposal_id):
        current = reads.pop(0) if reads else state
        return current, authoritative_payload, finalities.pop(0) if finalities else finalized

    def authorize(_proposal_id, digest):
        assert digest == state["action_digest"]
        reads.append({**state, "execution_authorized": True, "authorized_action_digest": digest, "authorized_at": int(time.time())})

    def consume(_proposal_id, digest):
        assert digest == state["action_digest"]
        reads.append({**state, "status": "EXECUTED", "execution_authorized": True, "authorized_action_digest": digest, "authorized_at": int(time.time()), "execution_consumed": True})

    return ControlledExecutor(executor_address, CHAIN_ID, CONTRACT_ADDRESS, read, authorize, consume)


def test_clear_exact_action_runs_real_controlled_tool(tmp_path: Path):
    action = payload()
    log = tmp_path / "controlled-execution.jsonl"
    result = executor_for(state_for(action), action).execute("gate-001", action, AppendOnlyExecutionLog(log))

    assert result.outcome == "EXECUTED"
    assert result.digest == action_digest(action)
    assert log.read_text(encoding="utf-8").count("gate-001") == 1


def test_block_prevents_tool_execution(tmp_path: Path):
    action = payload()
    log = tmp_path / "blocked.jsonl"
    blocked = state_for(action, status="BLOCK")
    result = executor_for(blocked, action).execute("gate-001", action, AppendOnlyExecutionLog(log))

    assert result.outcome == "DENIED"
    assert not log.exists()


def test_revise_prevents_tool_execution(tmp_path: Path):
    action = payload()
    log = tmp_path / "revise.jsonl"
    revised = state_for(action, status="REVISE")
    result = executor_for(revised, action).execute("gate-001", action, AppendOnlyExecutionLog(log))

    assert result.outcome == "DENIED"
    assert "REVISE" in result.reason
    assert not log.exists()


def test_altered_payload_is_denied(tmp_path: Path):
    approved = payload()
    altered = payload(action="append a different record")
    log = tmp_path / "altered.jsonl"
    result = executor_for(state_for(approved), approved).execute("gate-001", altered, AppendOnlyExecutionLog(log))

    assert result.outcome == "DENIED"
    assert "does not match" in result.reason
    assert not log.exists()


def test_cross_proposal_replay_is_denied(tmp_path: Path):
    action = payload()
    log = tmp_path / "cross-proposal.jsonl"
    result = executor_for(state_for(action), action).execute("gate-002", action, AppendOnlyExecutionLog(log))

    assert result.outcome == "DENIED"
    assert "proposal identity" in result.reason
    assert not log.exists()


def test_replayed_consumed_authorization_is_denied(tmp_path: Path):
    action = payload()
    consumed = state_for(action, status="EXECUTED", execution_authorized=True, authorized_action_digest=action_digest(action), authorized_at=int(time.time()), execution_consumed=True)
    log = tmp_path / "replay.jsonl"
    result = executor_for(consumed, action).execute("gate-001", action, AppendOnlyExecutionLog(log))

    assert result.outcome == "DENIED"
    assert "EXECUTED" in result.reason or "used" in result.reason
    assert not log.exists()


def test_wrong_executor_is_denied(tmp_path: Path):
    action = payload()
    log = tmp_path / "wrong-executor.jsonl"
    state = state_for(action, execution_executor="0x00000000000000000000000000000000000000e4")
    result = executor_for(state, action).execute("gate-001", action, AppendOnlyExecutionLog(log))

    assert result.outcome == "DENIED"
    assert "executor" in result.reason
    assert not log.exists()


def test_rpc_unavailability_fails_closed(tmp_path: Path):
    action = payload()

    def unavailable(_proposal_id):
        raise OSError("RPC unavailable")

    executor = ControlledExecutor(EXECUTOR, CHAIN_ID, CONTRACT_ADDRESS, unavailable, lambda *_: None, lambda *_: None)
    result = executor.execute("gate-001", action, AppendOnlyExecutionLog(tmp_path / "unavailable.jsonl"))

    assert result.outcome == "DENIED"
    assert "unavailable" in result.reason


def test_non_finalized_approval_is_denied(tmp_path: Path):
    action = payload()
    log = tmp_path / "non-final.jsonl"
    result = executor_for(
        state_for(action),
        action,
        finality_sequence=[True, False],
    ).execute("gate-001", action, AppendOnlyExecutionLog(log))

    assert result.outcome == "DENIED"
    assert "finalized" in result.reason
    assert not log.exists()


def test_executor_restart_cannot_bypass_consumption(tmp_path: Path):
    action = payload()
    consumed = state_for(
        action,
        status="EXECUTED",
        execution_authorized=True,
        authorized_action_digest=action_digest(action),
        authorized_at=int(time.time()),
        execution_consumed=True,
    )
    log = tmp_path / "restart.jsonl"
    restarted = executor_for(consumed, action)
    result = restarted.execute("gate-001", action, AppendOnlyExecutionLog(log))

    assert result.outcome == "DENIED"
    assert not log.exists()


def test_expired_authorization_is_denied(tmp_path: Path):
    action = payload()
    expired = state_for(
        action,
        execution_authorized=True,
        authorized_action_digest=action_digest(action),
        authorized_at=int(time.time()) - MAX_AUTHORIZATION_AGE_SECONDS - 1,
    )
    log = tmp_path / "expired.jsonl"
    result = executor_for(expired, action).execute("gate-001", action, AppendOnlyExecutionLog(log))

    assert result.outcome == "DENIED"
    assert "expired" in result.reason
    assert not log.exists()


def test_revoked_authorization_is_denied(tmp_path: Path):
    action = payload()
    revoked = state_for(
        action,
        status="CANCELLED",
        execution_authorized=True,
        authorized_action_digest=action_digest(action),
        authorized_at=int(time.time()),
        execution_revoked=True,
        revoked_at=int(time.time()),
    )
    log = tmp_path / "revoked.jsonl"
    result = executor_for(revoked, action).execute("gate-001", action, AppendOnlyExecutionLog(log))

    assert result.outcome == "DENIED"
    assert "CANCELLED" in result.reason
    assert not log.exists()


def test_restart_can_recover_unconsumed_authorization_within_ttl(tmp_path: Path):
    action = payload()
    authorized = state_for(
        action,
        execution_authorized=True,
        authorized_action_digest=action_digest(action),
        authorized_at=int(time.time()),
    )
    log = tmp_path / "restart-authorized.jsonl"
    result = executor_for(authorized, action).execute("gate-001", action, AppendOnlyExecutionLog(log))

    assert result.outcome == "EXECUTED"
    assert log.read_text(encoding="utf-8").count("gate-001") == 1


def test_concurrent_duplicate_attempts_execute_at_most_once(tmp_path: Path):
    action = payload()
    digest = action_digest(action)
    log = tmp_path / "concurrent.jsonl"
    lock = threading.Lock()
    current = {"authorized": False, "consumed": False, "status": "CLEAR"}
    tool_runs = 0

    def read(_proposal_id):
        with lock:
            state = state_for(
                action,
                status=current["status"],
                execution_authorized=current["authorized"],
                authorized_action_digest=digest if current["authorized"] else "",
                authorized_at=int(time.time()) if current["authorized"] else 0,
                execution_consumed=current["consumed"],
            )
            return state, action, True

    def authorize(_proposal_id, _digest):
        with lock:
            if current["authorized"] or current["consumed"]:
                raise RuntimeError("authorization already exists")
            current["authorized"] = True

    def consume(_proposal_id, _digest):
        with lock:
            if not current["authorized"] or current["consumed"]:
                raise RuntimeError("authorization already consumed")
            current["consumed"] = True
            current["status"] = "EXECUTED"

    class CountingTool(AppendOnlyExecutionLog):
        def run(self, payload_value):
            nonlocal tool_runs
            with lock:
                tool_runs += 1
            return super().run(payload_value)

    executor_a = ControlledExecutor(EXECUTOR, CHAIN_ID, CONTRACT_ADDRESS, read, authorize, consume)
    executor_b = ControlledExecutor(EXECUTOR, CHAIN_ID, CONTRACT_ADDRESS, read, authorize, consume)
    results = []

    def run(executor):
        results.append(executor.execute("gate-001", action, CountingTool(log)))

    threads = [threading.Thread(target=run, args=(executor_a,)), threading.Thread(target=run, args=(executor_b,))]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert sorted(result.outcome for result in results) == ["DENIED", "EXECUTED"]
    assert tool_runs == 1
    assert log.read_text(encoding="utf-8").count("gate-001") == 1
