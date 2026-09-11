# Studio-dev browser-wallet E2E harness

This harness replaces the Python transaction runner without changing the
contract or the application frontend. It uses `genlayer-js@2.0.0-rc.1`, the
SDK's `studioDevnet` chain definition, and the browser wallet exposed as
`window.ethereum`.

It is intentionally separate from the normal pytest/gltest suite. The page
does nothing on load. Existing-contract mode requires the user to paste the
address of the intended deployment; fresh mode deploys the contract only after
the user starts a staged run. A user must explicitly connect the proposer
before any wallet request is made. The no-challenge flow needs only that one
funded account; challenged flows additionally require a second, distinct funded
challenger.

From WSL at the repository root:

```bash
cd '/mnt/c/Users/DELL 7400/dissent/tests/integration/studio-dev-browser'
npm install
npm run dev
```

Open `http://127.0.0.1:4173/tests/integration/studio-dev-browser/` in the
wallet-enabled browser. Use the staged controls in this order as needed:

1. **Connect proposer**
2. **Run no-challenge**
3. **Connect challenger** (only for challenged tests)
4. **Run challenged** or **Run full E2E**

The **Fresh deployment** mode preserves the original isolated deployment
scenario; **Existing contract** is the default. The harness verifies:

1. deployment when fresh mode is selected, or `get_config` on the existing contract;
2. commit and no-challenge adjudication;
3. the CLEAR execution gate and settled Dissent credit after execution;
4. a separate commit and challenge;
5. challenged adjudication, including the contract's web and LLM branch.

Each write estimates fees through `genlayer-js` and passes both
`distribution` and `feeValue`. Writes wait for finalization and reads request
`latest-final` state. The harness verifies the on-chain Dissent credit ledger
after execution and challenged settlement; it does not submit an external
payout or infer wallet delivery. The `commit`, `revise`, and `challenge` ABI
payloads end with an explicit `credit_amount`; this harness uses `0` and funds
its scenarios externally. Settled credits are reusable inside Dissent, but
there is no wallet cashout in this RC. A permissionless `cancel` write is an
exceptional seven-day liveness recovery mechanism, not a normal alternative to
adjudication. It recovers unresolved escrow after prolonged provider or
consensus failure without web or LLM work.
Transaction hashes, proposal IDs, deadlines, and step status are saved in
`localStorage` before waiting, so reloading the page resumes an in-flight
stage instead of submitting a duplicate transaction.

For safe local verification without a wallet or live transaction, append
`?mock-provider=1` to the page URL. The mock wallet reaches fee estimation,
counts that call, and blocks every write submission while surfacing the error
in the status panel.
