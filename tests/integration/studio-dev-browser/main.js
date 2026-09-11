import { createClient, isSuccessful } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { ExecutionResult, TransactionHashVariant } from "genlayer-js/types";

const CONTRACT_URL = "/contracts/dissent.py";
const STORAGE_KEY = "dissent-studio-dev-e2e:v2";
const MOCK_PROVIDER_MODE = new URLSearchParams(window.location.search).get("mock-provider") === "1";
const MOCK_ACCOUNT = "0x0000000000000000000000000000000000000001";
const CHAIN_ID_HEX = `0x${studioDevnet.id.toString(16)}`;
const MINIMUM_BOUNTY = 300;
const MINIMUM_STAKE = 100;
const MINIMUM_EXECUTION_BOND = 1_000;
const BOUNTY = 300;
const EXECUTION_BOND = 1_000;
const COMMIT_VALUE = BOUNTY + EXECUTION_BOND;
const REVIEW_SECONDS = 60;
const CANCELLATION_GRACE_SECONDS = 604_800;
const WAIT_INTERVAL_MS = 3_000;
const WAIT_RETRIES = 240;
const mockMetrics = { feeEstimateCalls: 0, blockedWriteCalls: 0 };

const mockProvider = {
  request: async ({ method }) => {
    if (method === "eth_chainId") return CHAIN_ID_HEX;
    if (method === "eth_requestAccounts" || method === "eth_accounts") return [MOCK_ACCOUNT];
    if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
    throw new Error(`Mock provider blocked unsupported request: ${method}`);
  },
};

const provider = () => {
  if (MOCK_PROVIDER_MODE) return mockProvider;
  if (!window.ethereum) {
    throw new Error("No injected wallet found. Install or enable a browser wallet.");
  }
  return window.ethereum;
};

const statusElement = document.querySelector("#status");
const modeElement = document.querySelector("#mode");
const contractAddressElement = document.querySelector("#contract-address");
const connectProposerButton = document.querySelector("#connect-proposer");
const noChallengeButton = document.querySelector("#run-no-challenge");
const connectChallengerButton = document.querySelector("#connect-challenger");
const challengedButton = document.querySelector("#run-challenged");
const fullButton = document.querySelector("#run-full");

const emptyScenario = () => ({
  proposalId: null,
  challengeId: null,
  deadline: null,
  stage: "idle",
  error: null,
  settledCredit: null,
  accounting: null,
  txHashes: {},
});

function initialState() {
  return {
    mode: "existing",
    contractAddress: null,
    proposer: null,
    challenger: null,
    deployment: { status: "idle", txHash: null },
    noChallenge: emptyScenario(),
    challenged: emptyScenario(),
  };
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!parsed) return initialState();
    const defaults = initialState();
    return {
      ...defaults,
      ...parsed,
      deployment: { ...defaults.deployment, ...(parsed.deployment || {}) },
      noChallenge: { ...emptyScenario(), ...(parsed.noChallenge || {}) },
      challenged: { ...emptyScenario(), ...(parsed.challenged || {}) },
    };
  } catch {
    return initialState();
  }
}

const state = loadState();
state.proposerConnected = false;
state.challengerConnected = false;
state.busy = false;

function createMockReadClient() {
  return {
    getBalance: async () => 1n,
    estimateTransactionFees: async () => {
      mockMetrics.feeEstimateCalls += 1;
      render(`Mock provider reached fee estimation (${mockMetrics.feeEstimateCalls}).`);
      return {
        distribution: {
          leaderTimeunitsAllocation: 100n,
          validatorTimeunitsAllocation: 200n,
          appealRounds: 0n,
          executionBudgetPerRound: 500_000n,
          executionConsumed: 0n,
          totalMessageFees: 0n,
          rotations: [1n],
          maxPriceGenPerTimeUnit: 0n,
          storageFeeMaxGasPrice: 0n,
          receiptFeeMaxGasPrice: 0n,
        },
        feeValue: 1n,
      };
    },
    readContract: async ({ functionName }) => {
      if (functionName === "get_config") {
        return {
          minimum_bounty: MINIMUM_BOUNTY,
          minimum_stake: MINIMUM_STAKE,
          minimum_execution_bond: MINIMUM_EXECUTION_BOND,
          maximum_challenges: 5,
          minimum_review_seconds: REVIEW_SECONDS,
          maximum_review_seconds: 604_800,
          cancellation_grace_seconds: CANCELLATION_GRACE_SECONDS,
        };
      }
      throw new Error(`Mock read stopped before live transaction: ${functionName}`);
    },
    waitForTransactionReceipt: async () => {
      throw new Error("Mock provider blocked transaction receipt polling.");
    },
    debugTraceTransaction: async () => ({ result_code: 0 }),
  };
}

state.readClient = MOCK_PROVIDER_MODE
  ? createMockReadClient()
  : createClient({ chain: studioDevnet });

function saveState() {
  const persisted = { ...state };
  delete persisted.proposerConnected;
  delete persisted.challengerConnected;
  delete persisted.busy;
  delete persisted.readClient;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
}

function writeStatus(value) {
  statusElement.textContent = typeof value === "string"
    ? value
    : JSON.stringify(value, (_key, item) => (
      typeof item === "bigint" ? `${item}n` : item
    ), 2);
}

function errorText(error) {
  if (error instanceof Error) {
    return error.stack || `${error.name}: ${error.message}`;
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error, (_key, item) => (
      typeof item === "bigint" ? `${item}n` : item
    ), 2);
  } catch {
    return String(error);
  }
}

function statusSnapshot(message = null) {
  return {
    message,
    network: studioDevnet.name,
    chainId: studioDevnet.id,
    mode: state.mode,
    contractAddress: state.contractAddress,
    proposer: state.proposer,
    proposerConnected: state.proposerConnected,
    challenger: state.challenger,
    challengerConnected: state.challengerConnected,
    mockProvider: MOCK_PROVIDER_MODE ? mockMetrics : undefined,
    deployment: state.deployment,
    noChallenge: state.noChallenge,
    challenged: state.challenged,
  };
}

function render(message = null) {
  contractAddressElement.disabled = state.mode !== "existing";
  contractAddressElement.value = state.mode === "existing"
    ? state.contractAddress || ""
    : "Fresh deployment will be created on the first staged run";
  modeElement.value = state.mode;
  noChallengeButton.disabled = state.busy || !state.proposerConnected;
  connectChallengerButton.disabled = state.busy || !state.proposerConnected;
  const challengedReady = state.proposerConnected
    && state.challengerConnected
    && state.proposer?.toLowerCase() !== state.challenger?.toLowerCase();
  challengedButton.disabled = state.busy || !challengedReady;
  fullButton.disabled = state.busy || !challengedReady;
  writeStatus(statusSnapshot(message));
}

function normalizeAddress(value) {
  return String(value);
}

function numeric(value) {
  return Number(value);
}

function field(value, name) {
  return value?.[name];
}

function isAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

function resetScenario(scenario) {
  Object.assign(scenario, emptyScenario());
}

function resetProgress(message) {
  state.deployment = { status: "idle", txHash: null };
  resetScenario(state.noChallenge);
  resetScenario(state.challenged);
  saveState();
  render(message);
}

async function ensureStudioDevnet() {
  const wallet = provider();
  const currentChain = await wallet.request({ method: "eth_chainId" });
  if (currentChain.toLowerCase() === CHAIN_ID_HEX.toLowerCase()) return;

  const chainParams = {
    chainId: CHAIN_ID_HEX,
    chainName: studioDevnet.name,
    rpcUrls: [...studioDevnet.rpcUrls.default.http],
    nativeCurrency: studioDevnet.nativeCurrency,
  };
  try {
    await wallet.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_ID_HEX }],
    });
  } catch (error) {
    if (error?.code !== 4902) throw error;
    await wallet.request({ method: "wallet_addEthereumChain", params: [chainParams] });
    await wallet.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_ID_HEX }],
    });
  }
}

async function connectedAccounts() {
  const wallet = provider();
  const requested = await wallet.request({ method: "eth_requestAccounts" });
  const visible = await wallet.request({ method: "eth_accounts" });
  return [...new Set([...(requested || []), ...(visible || [])])].map(normalizeAddress);
}

async function assertFunded(address) {
  const balance = await state.readClient.getBalance({ address });
  if (balance <= 0n) throw new Error(`Account ${address} has no Studio-dev balance.`);
}

async function connectProposer() {
  await ensureStudioDevnet();
  const accounts = await connectedAccounts();
  const proposer = accounts[0];
  if (!proposer) throw new Error("The wallet returned no account.");
  if (state.proposer && state.proposer.toLowerCase() !== proposer.toLowerCase()) {
    resetProgress("Proposer changed; staged transaction progress was reset.");
  }
  await assertFunded(proposer);
  state.proposer = proposer;
  state.proposerConnected = true;
  if (state.challenger?.toLowerCase() === proposer.toLowerCase()) {
    state.challengerConnected = false;
  }
  saveState();
  render("Proposer connected. No transaction has been submitted.");
}

async function connectChallenger() {
  if (!state.proposerConnected) throw new Error("Connect the proposer first.");
  await ensureStudioDevnet();
  const accounts = await connectedAccounts();
  const challenger = accounts.find(
    (account) => account.toLowerCase() !== state.proposer.toLowerCase(),
  );
  if (!challenger) {
    throw new Error(
      "Connect or select a second funded wallet account; proposer and challenger must be distinct.",
    );
  }
  if (state.challenger && state.challenger.toLowerCase() !== challenger.toLowerCase()) {
    resetScenario(state.challenged);
  }
  await assertFunded(challenger);
  state.challenger = challenger;
  state.challengerConnected = true;
  saveState();
  render("Distinct challenger connected. Challenged actions are now enabled.");
}

function writeClient(account) {
  if (MOCK_PROVIDER_MODE) {
    return {
      writeContract: async () => {
        mockMetrics.blockedWriteCalls += 1;
        throw new Error("Mock provider blocked live transaction submission.");
      },
      deployContract: async () => {
        mockMetrics.blockedWriteCalls += 1;
        throw new Error("Mock provider blocked live deployment submission.");
      },
    };
  }
  return createClient({
    chain: studioDevnet,
    account,
    provider: provider(),
  });
}

async function estimateFees() {
  const estimate = await state.readClient.estimateTransactionFees({
    leaderTimeunitsAllocation: 100n,
    validatorTimeunitsAllocation: 200n,
    totalMessageFees: 0n,
    rotations: [1n],
  });
  const feeValue = estimate.feeValue === undefined ? 0n : BigInt(estimate.feeValue);
  if (feeValue <= 0n) throw new Error("Studio-dev returned no positive feeValue estimate.");
  return { distribution: estimate.distribution, feeValue };
}

async function waitForFinalized(hash) {
  const receipt = await state.readClient.waitForTransactionReceipt({
    hash,
    waitUntil: "finalized",
    interval: WAIT_INTERVAL_MS,
    retries: WAIT_RETRIES,
  });
  if (!isSuccessful(receipt)) {
    const trace = await state.readClient.debugTraceTransaction({ hash });
    const execution = receipt.txExecutionResultName || ExecutionResult.NOT_VOTED;
    throw new Error(`Transaction ${hash} failed with ${execution}: ${JSON.stringify({
      stderr: trace?.stderr,
      genvm_log: trace?.genvm_log,
      result_code: trace?.result_code,
    })}`);
  }
  return receipt;
}

async function readContract(functionName, args = []) {
  if (!state.contractAddress) throw new Error("No contract address is selected.");
  return state.readClient.readContract({
    address: state.contractAddress,
    functionName,
    args,
    transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
  });
}

async function ensureContract() {
  if (state.mode === "existing") {
    if (!isAddress(state.contractAddress)) throw new Error("Enter a valid existing contract address.");
    return state.contractAddress;
  }

  if (state.deployment.txHash) {
    const receipt = await waitForFinalized(state.deployment.txHash);
    const decoded = receipt.txDataDecoded || {};
    const address = decoded.contractAddress || decoded.contract_address || receipt.recipient;
    if (!address || address.toLowerCase() === "0x0000000000000000000000000000000000000000") {
      throw new Error("Accepted deployment did not return a contract address.");
    }
    state.contractAddress = address;
    state.deployment.status = "accepted";
    saveState();
    render("Resumed the saved deployment transaction.");
    return address;
  }

  const code = await (await fetch(CONTRACT_URL)).text();
  const client = writeClient(state.proposer);
  const hash = await client.deployContract({
    account: state.proposer,
    code,
    args: [MINIMUM_BOUNTY, MINIMUM_STAKE, MINIMUM_EXECUTION_BOND],
    fees: await estimateFees(),
  });
  state.deployment = { status: "submitted", txHash: hash };
  saveState();
  render(`Deployment submitted: ${hash}`);
  const receipt = await waitForFinalized(hash);
  const decoded = receipt.txDataDecoded || {};
  const address = decoded.contractAddress || decoded.contract_address || receipt.recipient;
  if (!address || address.toLowerCase() === "0x0000000000000000000000000000000000000000") {
    throw new Error("Accepted deployment did not return a contract address.");
  }
  state.contractAddress = address;
  state.deployment.status = "accepted";
  saveState();
  render(`Fresh contract deployed at ${address}.`);
  return address;
}

function assertConfig(config) {
  const expected = {
    minimum_bounty: MINIMUM_BOUNTY,
    minimum_stake: MINIMUM_STAKE,
    minimum_execution_bond: MINIMUM_EXECUTION_BOND,
    maximum_challenges: 5,
    minimum_review_seconds: REVIEW_SECONDS,
    maximum_review_seconds: 604_800,
    cancellation_grace_seconds: CANCELLATION_GRACE_SECONDS,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (numeric(config[key]) !== value) {
      throw new Error(`Unexpected deployed configuration for ${key}: ${config[key]}`);
    }
  }
}

async function verifyConfig() {
  assertConfig(await readContract("get_config"));
}

function ensureScenarioIds(scenario, suffix) {
  if (!scenario.proposalId) scenario.proposalId = `studio-e2e-${suffix}`;
  if (!scenario.challengeId) scenario.challengeId = `studio-e2e-${suffix}-challenge`;
  saveState();
}

async function submitScenarioStep(scenario, step, account, functionName, args = [], value = 0n) {
  const savedHash = scenario.txHashes[step];
  if (savedHash) {
    render(`Resuming ${step}: ${savedHash}`);
    await waitForFinalized(savedHash);
    scenario.stage = `${step}:finalized`;
    saveState();
    return savedHash;
  }

  const client = writeClient(account);
  const hash = await client.writeContract({
    account,
    address: state.contractAddress,
    functionName,
    args,
    value,
    fees: await estimateFees(),
  });
  scenario.txHashes[step] = hash;
  scenario.stage = `${step}:submitted`;
  saveState();
  render(`${step} submitted: ${hash}`);
  await waitForFinalized(hash);
  scenario.stage = `${step}:finalized`;
  saveState();
  return hash;
}

async function waitForDeadline(scenario) {
  const proposal = await readContract("get_proposal", [scenario.proposalId]);
  scenario.deadline = String(field(proposal, "challenge_deadline"));
  scenario.stage = "waiting-deadline";
  saveState();
  render(`Waiting for deadline ${scenario.deadline}...`);
  while (numeric(scenario.deadline) >= Math.floor(Date.now() / 1_000)) {
    const remaining = numeric(scenario.deadline) - Math.floor(Date.now() / 1_000);
    await new Promise((resolve) => setTimeout(resolve, Math.min(remaining + 1, 5) * 1_000));
  }
  scenario.stage = "deadline-reached";
  saveState();
}

async function runNoChallenge() {
  const scenario = state.noChallenge;
  if (scenario.stage === "complete") {
    render("No-challenge scenario already complete; saved progress was preserved.");
    return true;
  }
  scenario.stage = "preparing";
  scenario.error = null;
  saveState();
  render("No-challenge preparing...");
  try {
    if (!state.proposerConnected) throw new Error("Connect the proposer first.");
    await ensureStudioDevnet();
    await ensureContract();
    await verifyConfig();
    ensureScenarioIds(scenario, `${Date.now()}-clear`);
    await submitScenarioStep(scenario, "commit", state.proposer, "commit", [
      scenario.proposalId,
      "Evaluate an evidence-backed market action before execution",
      "Require material risks to be identified before principal is exposed",
      "Block unilateral control changes and unsupported risk claims",
      "https://example.com",
      state.proposer,
      BOUNTY,
      REVIEW_SECONDS,
      0,
    ], BigInt(COMMIT_VALUE));
    await waitForDeadline(scenario);
    await submitScenarioStep(scenario, "adjudicate", state.proposer, "adjudicate", [scenario.proposalId]);
    const proposal = await readContract("get_proposal", [scenario.proposalId]);
    if (field(proposal, "status") !== "CLEAR" || await readContract("can_execute", [scenario.proposalId]) !== true) {
      throw new Error("No-challenge adjudication did not clear the proposal.");
    }
    if (numeric(proposal.outstanding_bond) !== EXECUTION_BOND) {
      throw new Error("Execution bond was not retained after clear adjudication.");
    }
    if (numeric(await readContract("get_credit", [state.proposer])) !== BOUNTY) {
      throw new Error("Unexpected proposer credit after clear adjudication.");
    }
    await submitScenarioStep(scenario, "execute", state.proposer, "execute", [scenario.proposalId]);
    const executedProposal = await readContract("get_proposal", [scenario.proposalId]);
    if (executedProposal.status !== "EXECUTED" || await readContract("can_execute", [scenario.proposalId]) !== false) {
      throw new Error("Execution gate did not release the clear proposal.");
    }
    if (numeric(executedProposal.outstanding_bond) !== 0) {
      throw new Error("Execution did not zero the outstanding bond.");
    }
    const settledCredit = numeric(await readContract("get_credit", [state.proposer]));
    if (settledCredit !== BOUNTY + EXECUTION_BOND) {
      throw new Error("Execution did not create the expected settled Dissent credit.");
    }
    const accounting = await readContract("get_accounting");
    if (numeric(accounting.total_outstanding_escrow) !== 0
      || numeric(accounting.total_settled_credits) !== BOUNTY + EXECUTION_BOND) {
      throw new Error("Execution accounting does not show a fully settled Dissent credit.");
    }
    scenario.settledCredit = settledCredit;
    scenario.accounting = {
      total_outstanding_escrow: String(accounting.total_outstanding_escrow),
      total_settled_credits: String(accounting.total_settled_credits),
    };
    saveState();
    scenario.stage = "complete";
    scenario.error = null;
    saveState();
    render("No-challenge scenario complete.");
    return true;
  } catch (error) {
    scenario.stage = "error";
    scenario.error = errorText(error);
    saveState();
    render(`No-challenge failed:\n${scenario.error}`);
    return false;
  }
}

async function runChallenged() {
  if (!state.proposerConnected) throw new Error("Connect the proposer first.");
  if (!state.challengerConnected || state.proposer.toLowerCase() === state.challenger.toLowerCase()) {
    throw new Error("Connect a distinct funded challenger first.");
  }
  await ensureStudioDevnet();
  await ensureContract();
  await verifyConfig();
  const scenario = state.challenged;
  if (scenario.stage === "complete") {
    render("Challenged scenario already complete; saved progress was preserved.");
    return;
  }
  ensureScenarioIds(scenario, `${Date.now()}-challenged`);
  await submitScenarioStep(scenario, "commit", state.proposer, "commit", [
    scenario.proposalId,
    "Evaluate an evidence-backed market action before execution",
      "Require material risks to be identified before principal is exposed",
      "Block unilateral control changes and unsupported risk claims",
      "https://example.com",
      state.proposer,
      BOUNTY,
      REVIEW_SECONDS,
      0,
  ], BigInt(COMMIT_VALUE));
  await submitScenarioStep(scenario, "challenge", state.challenger, "challenge", [
    scenario.proposalId,
    scenario.challengeId,
    "The action lacks evidence that control cannot be changed unilaterally",
    "https://example.com",
    0,
  ], BigInt(MINIMUM_STAKE));
  await waitForDeadline(scenario);
  await submitScenarioStep(scenario, "adjudicate", state.proposer, "adjudicate", [scenario.proposalId]);
  const proposal = await readContract("get_proposal", [scenario.proposalId]);
  const challenge = await readContract("get_challenge", [scenario.challengeId]);
  if (!["CLEAR", "REVISE", "BLOCK"].includes(field(proposal, "status"))) {
    throw new Error(`Unexpected challenged proposal status: ${field(proposal, "status")}`);
  }
  if (!["ACCEPTED", "REJECTED"].includes(field(challenge, "status"))) {
    throw new Error(`Unexpected challenge status: ${field(challenge, "status")}`);
  }
  const accounting = await readContract("get_accounting");
  const proposerCredit = numeric(await readContract("get_credit", [state.proposer]));
  const challengerCredit = numeric(await readContract("get_credit", [state.challenger]));
  if (numeric(accounting.total_settled_credits) <= 0
    || proposerCredit + challengerCredit !== numeric(accounting.total_settled_credits)) {
    throw new Error("Challenged settlement did not produce verifiable Dissent credits.");
  }
  scenario.settledCredit = { proposer: proposerCredit, challenger: challengerCredit };
  scenario.accounting = {
    total_outstanding_escrow: String(accounting.total_outstanding_escrow),
    total_settled_credits: String(accounting.total_settled_credits),
  };
  scenario.stage = "complete";
  saveState();
  render("Challenged scenario complete; nondeterministic adjudication was exercised.");
}

async function runAction(action, successMessage) {
  if (state.busy) return;
  state.busy = true;
  render("Working; transaction hashes are saved before each wait...");
  try {
    const completed = await action();
    if (completed !== false) render(successMessage);
  } catch (error) {
    render(`Paused:\n${errorText(error)}`);
  } finally {
    state.busy = false;
    render();
  }
}

connectProposerButton.addEventListener("click", () => runAction(connectProposer, "Proposer connected."));
connectChallengerButton.addEventListener("click", () => runAction(connectChallenger, "Challenger connected."));
noChallengeButton.addEventListener("click", () => {
  if (state.busy) return;
  state.noChallenge.stage = "preparing";
  state.noChallenge.error = null;
  saveState();
  render("No-challenge preparing...");
  void runAction(runNoChallenge, "No-challenge run complete or paused.");
});
challengedButton.addEventListener("click", () => runAction(runChallenged, "Challenged run complete or paused."));
fullButton.addEventListener("click", () => runAction(async () => {
  if (await runNoChallenge() === false) return false;
  return runChallenged();
}, "Full E2E run complete or paused."));

modeElement.addEventListener("change", () => {
  const nextMode = modeElement.value;
  if (nextMode === state.mode) return;
  state.mode = nextMode;
  state.contractAddress = null;
  resetProgress("Contract mode changed; staged progress was reset.");
});

contractAddressElement.addEventListener("change", () => {
  if (state.mode !== "existing") return;
  const nextAddress = contractAddressElement.value.trim();
  if (!isAddress(nextAddress)) {
    contractAddressElement.value = state.contractAddress || "";
    render("Enter a valid 20-byte contract address.");
    return;
  }
  if (!state.contractAddress || nextAddress.toLowerCase() !== state.contractAddress.toLowerCase()) {
    state.contractAddress = nextAddress;
    resetProgress("Existing contract changed; staged progress was reset.");
  }
});

if (window.ethereum?.on) {
  window.ethereum.on("accountsChanged", () => {
    state.proposerConnected = false;
    state.challengerConnected = false;
    render("Wallet accounts changed. Reconnect proposer and challenger as needed.");
  });
}

render(MOCK_PROVIDER_MODE
  ? "Mock provider mode. Connect proposer, then click Run no-challenge; live writes are blocked."
  : "No transactions submitted. Connect a proposer to begin.");
