# Dissent frontend

Dissent is an opt-in adversarial review market for autonomous decisions. This
frontend presents the Studio Next product on `https://studio-next.genlayer.com/api`.
The configured contract is the verified fresh deployment
0x8BD79Ac285FBd87147B9A64BfF60436C050A684C; public reads require that
address to exist on the selected RPC: proposal index,
proposal records, challenges, evidence observations, accounting and internal
settled credits. Explicit wallet-gated forms cover the contract’s commit,
challenge, adjudicate, revise, execute and cancel writes.

## Run locally

Install from the repository root because this project is an npm workspace:

```bash
npm install
npm run dev
```

The app is available at `http://localhost:3000`. Verification commands are:

```bash
npm run lint
npm run build
```

## Public configuration

Copy .env.example to .env.local only when overriding the configured defaults.

- NEXT_PUBLIC_GENLAYER_RPC_URL - Studio Next RPC used for public reads and writes.
- `NEXT_PUBLIC_GENLAYER_CHAIN_ID` — must be `61997` for this RC.
- NEXT_PUBLIC_GENLAYER_NETWORK - must be studio-next (the product-facing label).
- NEXT_PUBLIC_DISSENT_CONTRACT_ADDRESS - the Dissent contract address on the

Malformed configuration is shown in the UI rather than silently falling back
to demo data. Reads use `genlayer-js@2.0.0-rc.1`, `explicit Studio Next chain adapter plus the transaction-kit RC`, concurrency
limits, in-flight deduplication, stale-response guards and finalized read
snapshots. No wallet is needed to browse the public review market.

## Product boundary

Connecting a browser wallet is always explicit. Writes are guarded to
Studio Next chain 61997, require a wallet signature, wait for finalization and
refresh the finalized public reads before reporting success. Settled credits
are reusable for future Dissent proposals and challenges, but this RC has no
wallet withdrawal or cashout path.

Dissent is an opt-in adversarial review market. It does not stop actions that
are performed outside the contract and it does not execute arbitrary textual
actions. External evidence is displayed as evidence, not instructions, and
may change between adjudication attempts.

## Routes

- `/` — editorial landing page with the live contract proof and review model.
- `/reviews` — public review market, filters, search and creation-order index.
- `/reviews#start-a-review` — wallet-gated commit form with external-only,
  credit-only or mixed funding.
- `/reviews/[id]` — proposal brief, evidence anchor, challenges, hashes,
  status, escrow and revision lineage.
- `/balance` — account-scoped settled Dissent credits.
- `/proposals/[id]` — compatibility redirect to `/reviews/[id]`.
- `/credits` — compatibility redirect to `/balance`.

Network, RPC, chain, contract, SDK and connection diagnostics live in the
header’s Network status drawer. Dissent does not stop actions performed
outside the contract and does not execute arbitrary textual actions. External
evidence is displayed as evidence, not instructions, and may change between
adjudication attempts. Unresolved OPEN proposals have an exceptional
seven-day liveness recovery mechanism; cancellation is not a normal
alternative to adjudication.
