# Dissent

The emergency brake for autonomous decisions.

Dissent is an opt-in adversarial review market for AI agents. Before a high-impact
action is approved, the requesting agent escrows an execution bond and review
bounty. Challenger agents stake funds on specific, evidence-backed objections.
GenLayer validators independently inspect the cited sources and return one of
three verdicts: `CLEAR`, `REVISE`, or `BLOCK`. Dissent controls proposal escrow
and settled Dissent credits; it does not execute arbitrary textual actions.

## First executable slice

The current intelligent contract implements:

- payable proposal commits with separate bond and bounty accounting
- payable, evidence-linked challenges
- independent source fetching during adjudication
- comparative GenLayer consensus over verdicts and challenge decisions
- strict validation of consensus output before state changes
- forfeited rejected challenge stakes to the proposer
- rewards for accepted challengers
- a settled Dissent credit ledger with no unacknowledged external payout path
- fixed challenge windows from 60 seconds to 7 days
- one staked objection per challenger, exact duplicate-objection protection,
  and a five-challenge count cap
- contract-owned challenge ordering, so adjudicators cannot omit evidence
- deterministic no-challenge settlement that avoids unnecessary AI fees
- revision lineage with one direct replacement after `REVISE`
- reusable settled credits inside Dissent via explicit `credit_amount` funding
- permissionless `CANCELLED` recovery after a fixed seven-day settlement grace
  period; this is an exceptional liveness recovery mechanism, not a normal
  alternative to adjudication
- checked u256 accounting, minimum execution bonds, and bounded evidence prompts

The first scenario is the Agent Tank pitch example: a treasury agent proposes a
deposit into a 40% APY pool, and challenger agents investigate whether an
anonymous upgrade key can put principal at risk.

## Local setup

Requirements: Python 3.12+, Node.js 20+, and the GenLayer CLI for Studio work.

```shell
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
npm install
```

Run the fast contract tests without Studio:

```shell
PYTHONPATH=. pytest tests/direct/test_dissent.py -q
```

Run the local multi-agent scenario and inspect the exact transaction plan:

```shell
PYTHONPATH=. python -m agents.run_demo
```

Run static contract checks:

```shell
genvm-lint check contracts/dissent.py
```

Run the frontend:

```shell
npm run dev
```

## Contract flow

1. `commit`: an agent declares its action, objective, policy, evidence, and
   execution recipient while funding a bond and review bounty. Funding is
   `gl.message.value + credit_amount`; reused credit is debited atomically.
   IDs are trimmed before storage and remain case-sensitive.
2. `challenge`: reviewers stake on a specific objection and cite a public source.
   A challenge may be externally funded, credit-funded, or mixed.
3. `adjudicate`: validators independently fetch the proposal and challenge
   sources, assess materiality, record observation hashes/statuses, and agree on
   the verdict. `CLEAR` means no material objection was accepted; it does not
   mean every factual claim was independently proven.
4. Settlement credits the Dissent ledger. For `CLEAR`, the bounty and rejected
   stakes are settled while the execution bond remains outstanding. For `REVISE`
   or `BLOCK`, the bond, bounty, and every stake become zero outstanding; accepted
   challengers receive their stake plus an equal bounty share and rejected stakes
   are forfeited to the proposer. Any integer remainder goes to the proposer.
5. `execute`: only the proposer can move a `CLEAR` proposal to `EXECUTED`. The
   execution bond is atomically zeroed and credited to the stored recipient's
   settled Dissent balance. It does not perform the proposed textual action or
   send an unacknowledged external message.
6. `revise`: only the proposer can create one fresh, newly funded child proposal
   after `REVISE`; the parent records `superseded_by` and the child records its
   parent and revision number. `CANCELLED` proposals cannot be revised.
7. `cancel`: anyone can recover an unresolved `OPEN` proposal after the challenge
   deadline plus the fixed seven-day settlement grace period. This is an
   exceptional liveness recovery mechanism, not a normal alternative to
   adjudication; it makes unresolved escrow recoverable after prolonged
   provider or consensus failure. The proposal bounty and bond return to the
   proposer’s settled credit and every challenge stake returns to its original
   challenger’s settled credit.

## State machine and accounting

The legal state transitions are:

```text
OPEN --(deadline, no accepted challenge)--> CLEAR
OPEN --(deadline, accepted correctable challenge)--> REVISE
OPEN --(deadline, accepted blocking challenge)--> BLOCK
CLEAR --(proposer calls execute)--> EXECUTED
REVISE --(proposer calls revise once)--> [new proposal: OPEN]
OPEN --(permissionless, grace elapsed)--> CANCELLED
BLOCK, EXECUTED, CANCELLED -------------> terminal
```

For every proposal and challenge, `initial_*` never changes and
`outstanding_*` is the remaining escrow. For all deposits made by the contract:

```text
total external GEN deposits
= outstanding bonds + outstanding bounties + outstanding stakes
  + settled Dissent credits
```

`get_accounting` exposes `total_outstanding_escrow` and
`total_settled_credits`. The execution recipient is an on-chain address for
crediting, not a promise that the address is an EOA, Intelligent Contract, or
EVM contract. External payout is intentionally excluded from this MVP because
the v0.6 RC message surface does not provide an acknowledgement that Dissent
could safely record. There is no `DELIVERED` state, claim submission, or wallet
balance assertion. No wallet cashout exists in this RC. Settled credits are
reusable only inside Dissent, so “earn” means receiving a settled Dissent
balance, not receiving a wallet payout. The market is economically incomplete
without cashout, but commit/revise/challenge credit reuse is supported here.
No internal or external transfer message is emitted.

Credit reuse moves value between settled credits and new outstanding escrow; it
does not increase total external deposits. If adjudication cannot obtain proposal
evidence, it leaves the proposal `OPEN` and accounting unchanged. A later retry
may succeed; otherwise permissionless cancellation recovers the escrow without
another model call.

Evidence is fetched live and may be mutable. Proposal evidence is mandatory for
every adjudication, including no-challenge rounds; unavailable proposal evidence
prevents settlement. Each successful adjudication stores
an evidence epoch containing the observed status and content hash for the
proposal source and every challenge source. Unavailable challenge evidence
cannot be accepted; missing or forged observation records fail validation.
Observation hashes prove what each validator used for that execution, not that
a future fetch will be identical. HTTPS URLs reject credentials, fragments,
localhost, reserved IPv4 ranges, and IPv6 authorities fail closed because the
contract cannot prove their safety. Redirect and DNS-rebinding safety ultimately
depend on the GenLayer web module.

The aggregate cap permits all six maximum-size sources (the proposal plus five
challenges), with each source truncated before aggregation. This bounds prompt
growth but does not make mutable URLs immutable. Proposal and challenge indexes
grow with use; pagination bounds each read, while the aggregate accounting view
remains constant-time. Exact duplicate objections are blocked, but semantic
Sybil attacks and reward dilution across distinct addresses remain protocol
risks. Proposal and challenge storage grows permanently; pagination bounds reads
but does not reclaim storage.

Prompt instructions in action, objective, policy, objection text, URLs, JSON, or
web pages are untrusted data. The contract constrains the output shape,
challenge IDs, evidence URLs, statuses, hashes, and verdict rules, but
consensus reduces rather than mathematically eliminates semantic prompt
injection risk.

## Repository map

```text
contracts/dissent.py             Intelligent contract
tests/direct/test_dissent.py     Local lifecycle and settlement tests
agents/                          Proposer, challengers, and transaction planner
evidence/                        Independent local evidence fixtures
tests/agents/test_network.py     Agent behavior and isolation tests
deploy/deployScript.ts           Contract deployment
frontend/                        Next.js application
```

## Local demo

The review desk currently runs the canonical treasury case as a clearly labelled
local demonstration. It visualizes agent investigation, GenLayer deliberation,
the final verdict, and challenge outcomes. It does not present simulated activity
as an on-chain transaction.

The deployment script configures a minimum 300-unit bounty, 100-unit challenge
stake, and 1,000-unit execution bond. The isolated Studio browser harness waits
for finalization and verifies settled Dissent credits after execution and
challenged settlement. It does not submit or verify an external payout. Dissent
does not stop actions performed outside the opt-in gate and does not execute
arbitrary textual actions. Prompt-injection resistance is bounded validation,
not a proof that malicious prose can never influence an LLM.
