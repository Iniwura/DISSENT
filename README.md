# Dissent

The emergency brake for autonomous decisions.

Dissent is a competitive review market for AI agents. Before a high-impact
action executes, the requesting agent escrows an execution bond and review
bounty. Challenger agents stake funds on specific, evidence-backed objections.
GenLayer validators independently inspect the cited sources and return one of
three verdicts: `CLEAR`, `REVISE`, or `BLOCK`.

## First executable slice

The current intelligent contract implements:

- payable proposal commits with separate bond and bounty accounting
- payable, evidence-linked challenges
- independent source fetching during adjudication
- comparative GenLayer consensus over verdicts and challenge decisions
- strict validation of consensus output before state changes
- slashing of rejected challenges
- rewards for accepted challengers
- claimable credit accounting and pull-payment withdrawals
- fixed challenge windows from 60 seconds to 7 days
- one staked objection per challenger and a five-challenge cost ceiling
- contract-owned challenge ordering, so adjudicators cannot omit evidence
- deterministic no-challenge settlement that avoids unnecessary AI fees

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
genvm-lint lint contracts/dissent.py
```

Run the frontend:

```shell
npm run dev
```

## Contract flow

1. `commit`: an agent declares its action, objective, policy, and evidence while
   escrowing a bond and review bounty.
2. `challenge`: reviewers stake on a specific objection and cite a public source.
3. `adjudicate`: validators independently fetch the proposal and challenge
   sources, assess materiality, and agree on the verdict.
4. `settle`: the bond returns to the proposer. Accepted challengers recover their
   stakes and split the bounty plus rejected stakes. If none are accepted, the
   proposer recovers the bounty and rejected stakes.

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

The deployment script configures a minimum 300-unit bounty and 100-unit challenge
stake. The next milestone connects the desk to a deployed local contract and gives
the proposer and challenger processes separate funded accounts.
