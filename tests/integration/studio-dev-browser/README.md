# Studio-dev browser-wallet E2E harness

This harness replaces the Python transaction runner without changing the
contract or the application frontend. It uses `genlayer-js@2.0.0-rc.1`, the
SDK's `studioDevnet` chain definition, and the browser wallet exposed as
`window.ethereum`.

It is intentionally separate from the normal pytest/gltest suite. The page
does nothing on load. A user must connect two funded wallet accounts and then
click the explicit E2E button before any transaction is requested.

From WSL at the repository root:

```bash
cd '/mnt/c/Users/DELL 7400/dissent/tests/integration/studio-dev-browser'
npm install
npm run dev
```

Open `http://127.0.0.1:4173/tests/integration/studio-dev-browser/` in the
wallet-enabled browser. The first connected account is the proposer and the
second is the challenger. The harness verifies:

1. fresh deployment and `get_config`;
2. commit and no-challenge adjudication;
3. proposer credit withdrawal;
4. a separate commit and challenge;
5. challenged adjudication, including the contract's web and LLM branch.

Each write estimates fees through `genlayer-js` and passes both
`distribution` and `feeValue`. Reads request `latest-nonfinal` state.
