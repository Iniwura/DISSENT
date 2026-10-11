# Dissent Execution Gate

## Architecture decision

The accepted Studio Next deployment cannot be safely reused for external tool
authorization. Its `Proposal` stores free-text action data and an execution
recipient, while `execute(proposal_id)` only moves the execution bond into the
recipient's settled Dissent credit. It does not store an action digest, bind a
controlled executor, expose a consumed authorization, or call an external
agent/tool. Frontend checks would not provide an authoritative replay guard.

The smallest safe architecture supported by the installed GenLayer surface is
a new deployment of the existing Dissent contract source with an additive,
opt-in gate ABI. There is no cross-contract read or unsupported external
enforcement assumption.

The existing live marketplace and these records remain unchanged:

- `deployments/studio-next.json`
- `deployments/studio-dev.json`
- Studio Next contract `0x8BD79Ac285FBd87147B9A64BfF60436C050A684C`

No redeployment is authorized by this milestone work.

## Protocol flow

1. A proposer calls `commit_execution_gate(...)` with a specific action,
   recipient, and controlled executor address. The contract canonicalizes the
   stored fields and records `action_digest`.
2. Challengers use the existing `challenge(...)` path with staked,
   evidence-backed objections.
3. `adjudicate(...)` independently fetches evidence and records `CLEAR`,
   `REVISE`, or `BLOCK` under the existing consensus validation.
4. Only a `CLEAR` gate can be authorized. The executor address calls
   `authorize_execution(proposal_id, action_digest)`; the contract checks the
   exact stored digest and records the authorized digest.
5. The controlled executor independently reads `get_execution_gate` and
   `get_execution_payload`, recomputes the canonical Keccak digest, checks
   `CLEAR`, executor identity, authorization, non-consumption, revocation, and
   its bounded authorization TTL, then calls
   `consume_execution(proposal_id, action_digest)`.
6. `consume_execution` marks the authorization consumed before the executor
   runs the controlled tool and releases the existing Dissent bond as internal
   credit. A second consume or an altered payload fails.
7. The executor runs the safe controlled operation and records the result in
   its controlled log. Dissent itself does not execute arbitrary textual
   actions and cannot stop agents operating outside this opt-in integration.

The proposer can call `revoke_execution(proposal_id)` while a gate is CLEAR
and not consumed. This makes the proposal terminal `CANCELLED`, prevents future
authorization or consumption, and refunds the outstanding execution bond to
the proposer. Revocation is explicit because the installed GenLayer VM does
not provide a reliable authoritative clock for contract-enforced wall-clock
expiry. The controlled executor adds a fail-closed 900-second authorization TTL
using its controlled clock; missing, zero, future, or stale authorization
timestamps are denied. This is an operational bounded lifetime, not an
exactly-once guarantee.

`REVISE` requires `revise_execution_gate(...)` and a fresh challenge round.
`BLOCK`, unavailable chain state, missing evidence, digest mismatch, revoked
state, stale authorization, and any ambiguous post-consume read fail closed.
The controlled executor owns its wallet/provider callbacks and any tool
secrets; none are placed in the UI.

## Canonical payload

The digest is Keccak-256 over UTF-8 JSON with sorted keys, no insignificant
whitespace, and these exact fields:

```json
{"action":"...","chain_id":"61997","contract_address":"0x...","evidence_url":"...","execution_executor":"0x...","execution_recipient":"0x...","objective":"...","policy":"...","proposal_id":"...","proposer":"0x..."}
```

Addresses use lowercase 40-hex-digit encoding, matching GenLayer
`Address.as_hex`; the chain ID is a decimal string. The contract derives this
from the normalized values it stores. Python, TypeScript, and the contract use
the same UTF-8/no-ASCII-escaping encoding. The executor recomputes it
independently; it never trusts a frontend verdict or digest.

## Local verification

From the repository root:

```shell
./.venv/bin/python -m py_compile contracts/dissent.py agents/execution_gate.py
GENVM_PREBUILT_DIR=/tmp/dissent-prebuilt-vstudio PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 PYTHONPATH=. ./.venv/bin/pytest -p gltest.direct.pytest_plugin tests/direct -q
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 PYTHONPATH=. ./.venv/bin/pytest tests/agents/test_execution_gate.py -q
PATH="$PWD/.venv/bin:$PATH" GENVM_REPO=genlayerlabs/genvm GENVM_VERSION=vstudio-dev ./.venv/bin/genvm-lint check contracts/dissent.py
PATH="$PWD/.venv/bin:$PATH" GENVM_REPO=genlayerlabs/genvm GENVM_VERSION=vstudio-dev ./.venv/bin/genvm-lint validate contracts/dissent.py
PATH="$PWD/.venv/bin:$PATH" GENVM_REPO=genlayerlabs/genvm GENVM_VERSION=vstudio-dev ./.venv/bin/genvm-lint schema --json contracts/dissent.py
PATH="$PWD/.venv/bin:$PATH" GENVM_REPO=genlayerlabs/genvm GENVM_VERSION=vstudio-dev ./.venv/bin/genvm-lint typecheck contracts/dissent.py
cd frontend && npm run lint && npm run build
```

The execution-gate tests cover:

- exact `CLEAR` payload executes one real append-only controlled operation;
- `BLOCK` denies the tool;
- `REVISE` denies the tool and requires a fresh gate proposal;
- altered payload digest is denied;
- a consumed authorization is denied on replay;
- proposer revocation cancels an unused gate and refunds its bond;
- stale authorization timestamps are denied by the controlled executor;
- unavailable authoritative state fails closed;
- contract-side executor, state, digest, authorization, legacy-path, and
  terminal-state checks.

The current live contract is intentionally expected to report no execution
gate support. The browser UI renders gate metadata when a gate-enabled
deployment is configured and explicitly labels the current deployment as
legacy settlement-only. Public reads remain wallet-free.

## Deployment authorization boundary

Before any deployment, obtain explicit approval for GEN spending and the new
contract address. Then deploy the checked-in `contracts/dissent.py` through the
official GenLayer CLI/SDK, record the finalized transaction and source hash in
a new deployment record, and configure the UI to that new address only after
wallet-free schema/config and transaction-state checks pass. Do not overwrite
the existing live deployment record or silently repoint the current frontend.

The production proof still required after approval is a real controlled
executor run containing a CLEAR authorization/consume transaction, a BLOCK
denial, an altered-payload denial, a replay denial, and explorer transaction
links. This repository change does not claim that proof because deployment was
explicitly out of scope without authorization.
