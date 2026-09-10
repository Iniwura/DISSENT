import { createClient, isSuccessful } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import {
  ExecutionResult,
  TransactionHashVariant,
} from "genlayer-js/types";

const CONTRACT_URL = "/contracts/dissent.py";
const CHAIN_ID_HEX = `0x${studioDevnet.id.toString(16)}`;
const MINIMUM_BOUNTY = 300;
const MINIMUM_STAKE = 100;
const BOUNTY = 300;
const EXECUTION_BOND = 1_000;
const COMMIT_VALUE = BOUNTY + EXECUTION_BOND;
const REVIEW_SECONDS = 60;
const WAIT_INTERVAL_MS = 3_000;
const WAIT_RETRIES = 240;

const provider = () => {
  if (!window.ethereum) {
    throw new Error("No injected wallet found. Install or enable a browser wallet.");
  }
  return window.ethereum;
};

const statusElement = document.querySelector("#status");
const connectButton = document.querySelector("#connect");
const runButton = document.querySelector("#run");

const state = {
  proposer: null,
  challenger: null,
  readClient: null,
  contractAddress: null,
};

function writeStatus(value) {
  statusElement.textContent = typeof value === "string"
    ? value
    : JSON.stringify(value, (_key, item) => (
      typeof item === "bigint" ? `${item}n` : item
    ), 2);
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
    await wallet.request({
      method: "wallet_addEthereumChain",
      params: [chainParams],
    });
    await wallet.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_ID_HEX }],
    });
  }
}

async function connectWallet() {
  await ensureStudioDevnet();
  const wallet = provider();
  const requested = await wallet.request({ method: "eth_requestAccounts" });
  const visible = await wallet.request({ method: "eth_accounts" });
  const accounts = [...new Set([...(requested || []), ...(visible || [])])]
    .map(normalizeAddress);

  if (accounts.length < 2) {
    throw new Error(
      "Connect two funded wallet accounts to this page; the contract forbids a proposer from challenging itself.",
    );
  }

  state.proposer = accounts[0];
  state.challenger = accounts[1];
  state.readClient = createClient({ chain: studioDevnet });
  runButton.disabled = false;
  writeStatus({
    network: studioDevnet.name,
    chainId: studioDevnet.id,
    proposer: state.proposer,
    challenger: state.challenger,
    next: "Click Run isolated E2E when ready. No transaction has been submitted.",
  });
}

function writeClient(account) {
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
  if (feeValue <= 0n) {
    throw new Error("Studio-dev returned no positive feeValue estimate.");
  }
  return {
    distribution: estimate.distribution,
    feeValue,
  };
}

async function waitForAccepted(hash) {
  const receipt = await state.readClient.waitForTransactionReceipt({
    hash,
    waitUntil: "decided",
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

async function writeContract(account, functionName, args = [], value = 0n) {
  const client = writeClient(account);
  const hash = await client.writeContract({
    account,
    address: state.contractAddress,
    functionName,
    args,
    value,
    fees: await estimateFees(),
  });
  return waitForAccepted(hash);
}

async function readContract(functionName, args = []) {
  return state.readClient.readContract({
    address: state.contractAddress,
    functionName,
    args,
    transactionHashVariant: TransactionHashVariant.LATEST_NONFINAL,
  });
}

async function waitForDeadline(proposalId) {
  while (true) {
    const proposal = await readContract("get_proposal", [proposalId]);
    const remaining = numeric(field(proposal, "challenge_deadline")) - Math.floor(Date.now() / 1_000);
    if (remaining < 0) return;
    await new Promise((resolve) => setTimeout(resolve, Math.min(remaining + 1, 5) * 1_000));
  }
}

async function commit(proposalId) {
  await writeContract(
    state.proposer,
    "commit",
    [
      proposalId,
      "Evaluate an evidence-backed market action before execution",
      "Require material risks to be identified before principal is exposed",
      "Block unilateral control changes and unsupported risk claims",
      "https://example.com",
      BOUNTY,
      REVIEW_SECONDS,
    ],
    BigInt(COMMIT_VALUE),
  );
}

async function deployFreshContract() {
  const code = await (await fetch(CONTRACT_URL)).text();
  const client = writeClient(state.proposer);
  const hash = await client.deployContract({
    account: state.proposer,
    code,
    args: [MINIMUM_BOUNTY, MINIMUM_STAKE],
    fees: await estimateFees(),
  });
  const receipt = await waitForAccepted(hash);
  const decoded = receipt.txDataDecoded || {};
  const address = decoded.contractAddress || decoded.contract_address || receipt.recipient;
  if (!address || address.toLowerCase() === "0x0000000000000000000000000000000000000000") {
    throw new Error("Accepted deployment did not return a contract address.");
  }
  state.contractAddress = address;
}

function assertConfig(config) {
  const expected = {
    minimum_bounty: MINIMUM_BOUNTY,
    minimum_stake: MINIMUM_STAKE,
    maximum_challenges: 5,
    minimum_review_seconds: REVIEW_SECONDS,
    maximum_review_seconds: 604_800,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (numeric(config[key]) !== value) {
      throw new Error(`Unexpected deployed configuration for ${key}: ${config[key]}`);
    }
  }
}

async function runE2E() {
  await ensureStudioDevnet();
  if (!state.proposer || !state.challenger) {
    throw new Error("Connect two wallet accounts before running the E2E harness.");
  }

  await deployFreshContract();
  const config = await readContract("get_config");
  assertConfig(config);

  const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const clearProposalId = `studio-e2e-${runId}-clear`;
  const challengedProposalId = `studio-e2e-${runId}-challenged`;
  const challengeId = `studio-e2e-${runId}-challenge`;

  await commit(clearProposalId);
  await waitForDeadline(clearProposalId);
  await writeContract(state.proposer, "adjudicate", [clearProposalId]);
  const clearProposal = await readContract("get_proposal", [clearProposalId]);
  if (field(clearProposal, "status") !== "CLEAR") {
    throw new Error("No-challenge adjudication did not clear the proposal.");
  }
  if ((await readContract("can_execute", [clearProposalId])) !== true) {
    throw new Error("Cleared proposal is not executable.");
  }

  const clearCredit = numeric(await readContract("get_credit", [state.proposer]));
  if (clearCredit !== COMMIT_VALUE) {
    throw new Error(`Unexpected proposer credit after clear adjudication: ${clearCredit}`);
  }
  await writeContract(state.proposer, "withdraw");
  if (numeric(await readContract("get_credit", [state.proposer])) !== 0) {
    throw new Error("Withdraw did not clear the proposer credit.");
  }

  await commit(challengedProposalId);
  await writeContract(
    state.challenger,
    "challenge",
    [
      challengedProposalId,
      challengeId,
      "The action lacks evidence that control cannot be changed unilaterally",
      "https://example.com",
    ],
    BigInt(MINIMUM_STAKE),
  );
  await waitForDeadline(challengedProposalId);
  await writeContract(state.proposer, "adjudicate", [challengedProposalId]);

  const challengedProposal = await readContract("get_proposal", [challengedProposalId]);
  const challenge = await readContract("get_challenge", [challengeId]);
  const proposalStatus = field(challengedProposal, "status");
  const challengeStatus = field(challenge, "status");
  if (!["CLEAR", "REVISE", "BLOCK"].includes(proposalStatus)) {
    throw new Error(`Unexpected challenged proposal status: ${proposalStatus}`);
  }
  if (!["ACCEPTED", "REJECTED"].includes(challengeStatus)) {
    throw new Error(`Unexpected challenge status: ${challengeStatus}`);
  }

  return {
    chainId: studioDevnet.id,
    contractAddress: state.contractAddress,
    configVerified: true,
    noChallenge: {
      proposalId: clearProposalId,
      status: field(clearProposal, "status"),
      creditWithdrawn: true,
    },
    challengedAdjudication: {
      proposalId: challengedProposalId,
      challengeId,
      proposalStatus,
      challengeStatus,
      nondeterministicBranchExercised: true,
    },
  };
}

connectButton.addEventListener("click", async () => {
  connectButton.disabled = true;
  try {
    await connectWallet();
  } catch (error) {
    connectButton.disabled = false;
    writeStatus(`Wallet connection failed: ${error.message}`);
  }
});

runButton.addEventListener("click", async () => {
  runButton.disabled = true;
  connectButton.disabled = true;
  writeStatus("Running isolated Studio-dev E2E; wallet confirmations will appear...");
  try {
    writeStatus(await runE2E());
  } catch (error) {
    writeStatus(`Studio-dev E2E failed: ${error.message}`);
  } finally {
    runButton.disabled = false;
  }
});

if (window.ethereum?.on) {
  window.ethereum.on("accountsChanged", () => {
    runButton.disabled = true;
    state.proposer = null;
    state.challenger = null;
    writeStatus("Wallet accounts changed. Connect two accounts again.");
  });
}
