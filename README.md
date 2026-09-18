# Dissent

The emergency brake for autonomous decisions.

Dissent is an opt-in adversarial review market for AI agents. Before a high-impact
action is approved, the requesting agent escrows an execution bond and review
bounty. Challenger agents stake funds on specific, evidence-backed objections.
GenLayer validators independently inspect the cited sources and return one of
three verdicts: `CLEAR`, `REVISE`, or `BLOCK`. Dissent controls proposal escrow
and settled Dissent credits; it does not execute arbitrary textual actions.

## Live proof

Live application: https://dissent-rho.vercel.app/

The authoritative Studio Next deployment is finalized and accepted:

- RPC: https://studio-next.genlayer.com/api
- Chain ID: 61997
- Contract: 0x8BD79Ac285FBd87147B9A64BfF60436C050A684C
- Deployment transaction: 0x4424678c1a13882fa820befb8455e50a6d46c41cd0721398996920259ab6a523
- Explorer: https://explorer-studio-dev.genlayer.com/tx/0x4424678c1a13882fa820befb8455e50a6d46c41cd0721398996920259ab6a523

Completed wallet-driven review: quick-test-20260917-cu65m. The contract recorded BLOCK with one ACCEPTED challenge.

- Review escrow after settlement: bounty 0, execution bond 0, challenge stake 0 outstanding.
- Recorded settlement allocation: the challenger receives 1,100,000,000,000,000,000 wei (1 GEN bounty share plus 0.1 GEN stake); the proposer receives the 1,000 wei execution-bond refund.
- Current observed account credits: proposer 2,000,000,000,000,001,000 wei; challenger 1,100,000,000,000,000,000 wei.
- Current aggregate accounting read: 6,000,000,000,000,006,000 wei outstanding escrow and 3,100,000,000,000,001,000 wei settled credits.

These are contract reads, not a claim that a BLOCK verdict is independent proof of safety. Dissent is an opt-in gate, and settled credits remain reusable inside Dissent rather than becoming wallet cash.

Wallet-free verification from the repository root:

genlayer schema 0x8BD79Ac285FBd87147B9A64BfF60436C050A684C --rpc https://studio-next.genlayer.com/api
genlayer call 0x8BD79Ac285FBd87147B9A64BfF60436C050A684C get_config --rpc https://studio-next.genlayer.com/api
genlayer call 0x8BD79Ac285FBd87147B9A64BfF60436C050A684C get_accounting --rpc https://studio-next.genlayer.com/api
genlayer call 0x8BD79Ac285FBd87147B9A64BfF60436C050A684C get_proposal_count --rpc https://studio-next.genlayer.com/api
genlayer call 0x8BD79Ac285FBd87147B9A64BfF60436C050A684C get_proposal_ids --rpc https://studio-next.genlayer.com/api --args 0 50

## Verified protocol surface

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

The agents/ package contains a local planner and fixture scenario for reproducible
development. It is not proof of wallet-driven operation; the deployed review and
settlement above are the demonstrated on-chain evidence.

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
PYTHONPATH=. pytest tests/agents/ -q
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

## Known frontend limitation

Studio Next RPC rate limits can temporarily delay review and profile loading or
transaction confirmation updates. Recurring HTTP 429 errors remain under
investigation. A read failure does not mean a transaction failed; verify its
status in the explorer before resubmitting.

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

## Local agent planner

The agents/ package is a local planner and fixture harness for preparing proposal,
challenge and adjudication inputs. It does not submit the completed wallet-driven
review above and must not be read as simulated activity on the deployed contract.

Run the local planner and inspect its exact transaction plan:

PYTHONPATH=. python -m agents.run_demo

The isolated Studio browser harness is a separate integration tool. It waits for
finalization and verifies settled Dissent credits; it does not submit or verify an
external payout. Dissent does not stop actions performed outside the opt-in gate and
does not execute arbitrary textual actions. Prompt-injection resistance is bounded
validation, not a proof that malicious prose can never influence an LLM.

## Studio Next frontend target

The frontend and fresh deployment target use Studio Next at
https://studio-next.genlayer.com/api on chain ID 61997. Studio-dev and Studio
Next share that chain ID, so chain ID alone does not prove the injected wallet
uses the configured endpoint. If needed, manually update the wallet network RPC
to https://studio-next.genlayer.com/api before confirming it in the app.

## Current Studio Next deployment

The authoritative Dissent deployment is finalized and accepted on Studio Next:

- RPC: https://studio-next.genlayer.com/api
- Chain ID: 61997
- Contract: `0x8BD79Ac285FBd87147B9A64BfF60436C050A684C`
- Deployment transaction: `0x4424678c1a13882fa820befb8455e50a6d46c41cd0721398996920259ab6a523`
- Explorer: [deployment transaction](https://explorer-studio-dev.genlayer.com/tx/0x4424678c1a13882fa820befb8455e50a6d46c41cd0721398996920259ab6a523)
- Constructor minimums: bounty `300`, challenge stake `100`, execution bond `1000` wei
- Lifecycle: `FINALIZED` / `Accepted`, execution result `FINISHED_WITH_RETURN`

Public reads are wallet-free. Writes require a connected wallet configured for
Studio Next and explicit wallet approval. Settled Dissent credits are reusable
for supported Dissent funding, but are not wallet-withdrawable in this RC.

## Reviewer verification

Studio Next RPC rate limits can temporarily delay review and profile loading or
transaction confirmation updates. Recurring HTTP 429 errors remain under
investigation. A read failure does not mean a transaction failed; verify its
status in the explorer before resubmitting.

When rate-limited, allow the cooldown to finish before retrying. Avoid repeated
refreshes or duplicate submissions. A temporary unavailable-data notice is not
proof that a review is missing or that a transaction failed.

From the repository root, the following commands match the checked-in scripts
and installed CLI syntax:

```shell
npm install
npm run lint
npm run build
PYTHONPATH=. pytest tests/direct/test_dissent.py -q
genvm-lint check contracts/dissent.py
```

Read the deployed contract without changing state:

```shell
genlayer schema 0x8BD79Ac285FBd87147B9A64BfF60436C050A684C --rpc https://studio-next.genlayer.com/api
genlayer call 0x8BD79Ac285FBd87147B9A64BfF60436C050A684C get_config --rpc https://studio-next.genlayer.com/api
genlayer call 0x8BD79Ac285FBd87147B9A64BfF60436C050A684C get_accounting --rpc https://studio-next.genlayer.com/api
genlayer call 0x8BD79Ac285FBd87147B9A64BfF60436C050A684C get_proposal_count --rpc https://studio-next.genlayer.com/api
genlayer call 0x8BD79Ac285FBd87147B9A64BfF60436C050A684C get_proposal_ids --rpc https://studio-next.genlayer.com/api --args 0 50
```

The frontend is configured with
`NEXT_PUBLIC_GENLAYER_RPC_URL`, `NEXT_PUBLIC_GENLAYER_CHAIN_ID`,
`NEXT_PUBLIC_GENLAYER_NETWORK`, and
`NEXT_PUBLIC_DISSENT_CONTRACT_ADDRESS`; copy
`frontend/.env.example` to `frontend/.env.local` when overriding the verified
defaults. Run the local app with `npm run dev`.

The product flow is commit → challenge → adjudicate → either revise, execute,
or cancel. Validators evaluate the proposal, policy, cited HTTPS evidence and
any objections; consensus records the meaningful contract state and its
settlement. Decentralized judgment is needed because independent validators
provide the adversarial source review rather than trusting the proposing agent
alone. Dissent is an opt-in escrow/review gate: it does not stop actions taken
outside Dissent and does not execute arbitrary textual actions.

## Demo video checklist

- Explain the autonomous-action risk and why a paid adversarial review is needed.
- Show the finalized Studio Next contract and its explorer transaction.
- Open the wallet chooser without implying that a wallet is needed for public reads.
- Create a proposal with evidence and explicit funding.
- Add a challenge, wait for the review window, and show adjudication/verdict.
- Open the public dossier with evidence observations and settlement state.
- Use the explorer to prove the recorded contract transaction and finalized lifecycle.

Mark only actions actually demonstrated in the recording; this checklist does
not claim that an untested browser flow has been verified.

## Verified historical Studio-dev deployment

The existing verified release-candidate deployment is historical evidence at
0x84586890322D91B722eed1F5480845dB9272405e on the canonical Studio-dev RPC
(chain ID 61997), from source commit
eac9efea391fe712343a92ab1b7004d53ba3bdcd. Deployment transaction:
0x62da1e3be8f231ed21ce6cd73abffc110db19f6517e46936679cace47142b690.
The deployment starts with an empty proposal index and zero escrow/settled
credits. Credits are reusable inside Dissent but are not wallet-withdrawable
in this RC.

Fee profiles are measured locally with the repository's `gltest` profile
fixture, and the deployment script converts the measured deploy entry into
supported live estimate options before asking Studio Next for a fresh quote.
The returned distribution and `feeValue` are submitted unchanged.
