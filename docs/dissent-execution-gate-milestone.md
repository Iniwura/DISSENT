# Dissent Execution Gate

## Milestone summary

Dissent now includes an isolated, opt-in execution-gate implementation for agent-proposed tool actions. The gate binds a proposal to its exact canonical action digest, designated execution recipient, designated executor, adjudicated decision, and one-time consumption state. The existing Dissent marketplace deployment and its historical proposals, reviews, lineage, and settlement credits remain unchanged.

This is an authorization gate for a controlled integration. It does not stop agents or tools operating outside the opt-in executor.

## Deployed Studio Dev evidence

- Network: GenLayer Studio Dev, chain `61997`
- Gate contract: `0x609b43A74da79820EA7E7fA1d20c20988c97d345`
- Deployment transaction: [`0x5115b21494f3807c547365f91cd96945a045953f1d696d8482d9f887d8bfba70`](https://explorer-studio-dev.genlayer.com/api/transactions/0x5115b21494f3807c547365f91cd96945a045953f1d696d8482d9f887d8bfba70)
- Finalized status: `FINALIZED`
- Signer: `0x01feebafdfddd4ba23f69b43f0b501bba7aa7cff`
- Constructor: numeric `(300, 100, 1000)`
- Deployment deposit: `0.050000000000006470 GEN`
- Deployment source SHA-256: `1075533a8b413ae7a94b80d9aa2cb7139e83c1733519fc56c17e90f14ae6581a`
- Deployment calldata: `DgRhcmdzHeESoQbBPg==`

The read-only Studio Dev schema contains exactly 22 methods: 11 view methods and 11 write methods. Gate-specific methods include `commit_execution_gate`, `authorize_execution`, `consume_execution`, `revoke_execution`, `get_execution_gate`, and `get_execution_payload`.

The existing marketplace remains at `0x8BD79Ac285FBd87147B9A64BfF60436C050A684C`. No migration of historical records or credits is implied.

## Duplicate-deployment disclosure

Explorer shows an immediately preceding same-source finalized deployment at nonce `118`:

- Transaction: `0x85ab67ae51760f76f5f0c471f9a199d2df4d2ea4dceb9fe63b7f9cf011c8c3b6`
- Contract: `0x2bd3b318d17ED18B6243DD7362360095744Fa40B`

Nonce `119`, contract `0x609b43A74da79820EA7E7fA1d20c20988c97d345`, is the selected gate deployment for this milestone. Both records use the approved source hash and per-transaction deposit. The duplicate is disclosed rather than presented as a single transaction.

## Local verification evidence

The verified implementation recorded these completed checks:

- 144 Direct Mode contract tests passed.
- 14 controlled-executor security tests passed.
- 7 agent/network tests passed.
- Contract lint, semantic validation, schema extraction, and typecheck passed.
- Frontend TypeScript and production build passed.
- Python, TypeScript, and contract digest agreement was verified for the deployed source.

These are local verification results. They are not a substitute for a live CLEAR/BLOCK execution proof.

## Live-proof boundary

At the time of publication, no CLEAR proposal, BLOCK proposal, altered-payload attempt, replay attempt, or controlled external append-only action has been executed on the deployed gate. Therefore this milestone must not claim live execution evidence, external execution receipts, or a demonstrated BLOCK case.

The required live proof, when separately authorized, is:

1. Submit a specific opt-in action and wait for the challenge window.
2. Read the finalized proposal and adjudication state from the gate contract.
3. For CLEAR, independently verify the exact action digest, proposal, recipient, executor, and authorization on finalized chain state.
4. Consume the authorization onchain and wait for finalized consumption.
5. Perform one safe append-only controlled operation only after both finalized reads.
6. Show that BLOCK and REVISE produce no external operation.
7. Submit altered-payload, wrong-executor, replay, and duplicate-consumption attempts and show denial.

The controlled executor has an executor-only 900-second TTL. This is an integration timeout, not contract-enforced expiry. The contract provides one-time consumption, but the external side effect remains at-most-once rather than exactly-once if the executor crashes after consumption and before recording its result.

## Verification instructions

Confirm the deployed source locally:

```bash
sha256sum contracts/dissent.py
# 1075533a8b413ae7a94b80d9aa2cb7139e83c1733519fc56c17e90f14ae6581a
```

Query the finalized deployment record and the Studio Dev `gen_getContractSchema` RPC for the selected contract. Confirm `status=FINALIZED`, `contract_address=0x609b43A74da79820EA7E7fA1d20c20988c97d345`, the 22-method schema, and the source hash above.

## Portal description

**Dissent Execution Gate** adds a real opt-in authorization layer between agent proposals and a controlled tool executor. Dissent preserves its existing marketplace while introducing proposal-specific action digests, challenge/adjudication outcomes, designated executors, CLEAR-only authorization, finalized-state verification, and one-time authorization consumption. The implementation is deployed separately on Studio Dev and is designed to deny BLOCK, REVISE, altered-payload, wrong-executor, cross-proposal replay, and duplicate-consumption attempts.

The deployment and local verification evidence are published here. Live CLEAR/BLOCK execution and the controlled external operation remain explicitly pending separate authorization and must not be represented as completed in this milestone submission.
