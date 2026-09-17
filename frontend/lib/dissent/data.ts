import { createClient } from "genlayer-js";
import { TransactionHashVariant } from "genlayer-js/types";
import { configState, requireConfig } from "./config";
import { isRateLimitError } from "./errors";
import { studioNext } from "./network";
import {
  type Accounting,
  type Challenge,
  type DissentContractConfig,
  field,
  parseObservations,
  toAddress,
  toBigInt,
  toText,
  type MarketSnapshot,
  type Proposal,
  type ProposalDetail,
  type ProposalStatus,
  validateIdentifier,
} from "./types";

export const SDK_VERSION = "genlayer-js 2.0.0-rc.1 - transaction kit 0.1.0-rc.2";

let client: ReturnType<typeof createClient> | null = null;

function getClient() {
  const config = requireConfig();
  if (!client) client = createClient({ chain: studioNext, endpoint: config.rpcUrl });
  return client;
}

export type ReadHealth = "loading" | "healthy" | "unavailable" | "misconfigured";

const MAX_PARALLEL_DETAIL_READS = 3;
const RATE_LIMIT_RETRY_DELAY_MS = 1_000;
const MAX_RATE_LIMIT_RETRIES = 1;
const READ_CACHE_TTL_MS = 5_000;
const MAX_READ_CACHE_ENTRIES = 300;
const inflightReads = new Map<string, Promise<unknown>>();
const readCache = new Map<string, { value: unknown; expiresAt: number }>();

function readKey(functionName: string, args: (string | number | bigint)[]): string {
  return JSON.stringify([functionName, args.map((arg) => typeof arg === "bigint" ? `${arg}n` : arg)]);
}

function retryAfterMs(error: unknown): number | null {
  const candidates: unknown[] = [error];
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    candidates.push(record.cause, record.response);
  }
  for (const candidate of candidates) {
    if (typeof candidate !== "object" || candidate === null) continue;
    const record = candidate as Record<string, unknown>;
    const headers = record.headers;
    const raw = headers instanceof Headers
      ? headers.get("retry-after")
      : typeof headers === "object" && headers !== null
        ? (headers as Record<string, unknown>)["retry-after"] ?? (headers as Record<string, unknown>)["Retry-After"]
        : undefined;
    if (typeof raw !== "string" && typeof raw !== "number") continue;
    const value = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(value) && value >= 0) return value * 1_000;
    const date = Date.parse(String(raw));
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return null;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

let nextRateLimitRetryAt = 0;
const RATE_LIMIT_RETRY_SPACING_MS = 250;

async function waitForRateLimitRetry(error: unknown, retryNumber: number): Promise<void> {
  const delay = Math.min(4_000, retryAfterMs(error) ?? RATE_LIMIT_RETRY_DELAY_MS * (2 ** retryNumber));
  const now = Date.now();
  const retryAt = Math.max(now + delay, nextRateLimitRetryAt);
  nextRateLimitRetryAt = retryAt + RATE_LIMIT_RETRY_SPACING_MS;
  await wait(Math.max(0, retryAt - now));
}

async function readContractOnce(functionName: string, args: (string | number | bigint)[]): Promise<unknown> {
  let retries = 0;
  while (true) {
    try {
      const config = requireConfig();
      return await getClient().readContract({
        address: config.contractAddress,
        functionName,
        args,
        transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
      });
    } catch (error) {
      if (retries >= MAX_RATE_LIMIT_RETRIES || !isRateLimitError(error)) throw error;
      retries += 1;
      await waitForRateLimitRetry(error, retries);
    }
  }
}

export async function readContract(functionName: string, args: (string | number | bigint)[] = []): Promise<unknown> {
  const key = readKey(functionName, args);
  const cached = readCache.get(key);
  if (cached) {
    if (cached.expiresAt > Date.now()) return Promise.resolve(cached.value);
    readCache.delete(key);
  }
  const existing = inflightReads.get(key);
  if (existing) return existing;
  const request = readContractOnce(functionName, args);
  inflightReads.set(key, request);
  request.then(
    (value) => {
      if (readCache.size >= MAX_READ_CACHE_ENTRIES && !readCache.has(key)) {
        const oldest = readCache.keys().next().value;
        if (typeof oldest === "string") readCache.delete(oldest);
      }
      readCache.set(key, { value, expiresAt: Date.now() + READ_CACHE_TTL_MS });
      if (inflightReads.get(key) === request) inflightReads.delete(key);
    },
    () => { if (inflightReads.get(key) === request) inflightReads.delete(key); },
  );
  return request;
}

export function invalidateReadCache(): void {
  readCache.clear();
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function readConfig(raw: unknown): DissentContractConfig {
  return {
    minimumBounty: toBigInt(field(raw, "minimum_bounty", 0), "minimum_bounty"),
    minimumStake: toBigInt(field(raw, "minimum_stake", 1), "minimum_stake"),
    minimumExecutionBond: toBigInt(field(raw, "minimum_execution_bond", 2), "minimum_execution_bond"),
    maximumChallenges: toBigInt(field(raw, "maximum_challenges", 3), "maximum_challenges"),
    minimumReviewSeconds: toBigInt(field(raw, "minimum_review_seconds", 4), "minimum_review_seconds"),
    maximumReviewSeconds: toBigInt(field(raw, "maximum_review_seconds", 5), "maximum_review_seconds"),
    cancellationGraceSeconds: toBigInt(field(raw, "cancellation_grace_seconds", 6), "cancellation_grace_seconds"),
    maxSourceChars: toBigInt(field(raw, "max_source_chars", 7), "max_source_chars"),
    maxTotalSourceChars: toBigInt(field(raw, "max_total_source_chars", 8), "max_total_source_chars"),
    maxPromptChars: toBigInt(field(raw, "max_prompt_chars", 9), "max_prompt_chars"),
  };
}

function readAccounting(raw: unknown): Accounting {
  return {
    totalOutstandingEscrow: toBigInt(field(raw, "total_outstanding_escrow", 0), "total_outstanding_escrow"),
    totalSettledCredits: toBigInt(field(raw, "total_settled_credits", 1), "total_settled_credits"),
  };
}

function readProposal(raw: unknown): Proposal {
  const observations = parseObservations(field(raw, "evidence_observations", 17));
  const status = toText(field(raw, "status", 7), "status") as ProposalStatus | string;
  return {
    id: toText(field(raw, "id", 0), "proposal.id"),
    proposer: toAddress(field(raw, "proposer", 1), "proposal.proposer"),
    executionRecipient: toAddress(field(raw, "execution_recipient", 2), "proposal.execution_recipient"),
    action: toText(field(raw, "action", 3), "proposal.action"),
    objective: toText(field(raw, "objective", 4), "proposal.objective"),
    policy: toText(field(raw, "policy", 5), "proposal.policy"),
    evidenceUrl: toText(field(raw, "evidence_url", 6), "proposal.evidence_url"),
    status,
    initialBond: toBigInt(field(raw, "initial_bond", 8), "proposal.initial_bond"),
    outstandingBond: toBigInt(field(raw, "outstanding_bond", 9), "proposal.outstanding_bond"),
    initialBounty: toBigInt(field(raw, "initial_bounty", 10), "proposal.initial_bounty"),
    outstandingBounty: toBigInt(field(raw, "outstanding_bounty", 11), "proposal.outstanding_bounty"),
    openedAt: toBigInt(field(raw, "opened_at", 12), "proposal.opened_at"),
    challengeDeadline: toBigInt(field(raw, "challenge_deadline", 13), "proposal.challenge_deadline"),
    resolvedAt: toBigInt(field(raw, "resolved_at", 14), "proposal.resolved_at"),
    challengeCount: toBigInt(field(raw, "challenge_count", 15), "proposal.challenge_count"),
    resolution: toText(field(raw, "resolution", 16), "proposal.resolution"),
    evidenceObservations: observations.observations,
    observationError: observations.error,
    executedAt: toBigInt(field(raw, "executed_at", 18), "proposal.executed_at"),
    parentProposalId: toText(field(raw, "parent_proposal_id", 19), "proposal.parent_proposal_id"),
    revisionNumber: toBigInt(field(raw, "revision_number", 20), "proposal.revision_number"),
    supersededBy: toText(field(raw, "superseded_by", 21), "proposal.superseded_by"),
  };
}

function readChallenge(raw: unknown): Challenge {
  return {
    id: toText(field(raw, "id", 0), "challenge.id"),
    proposalId: toText(field(raw, "proposal_id", 1), "challenge.proposal_id"),
    challenger: toAddress(field(raw, "challenger", 2), "challenge.challenger"),
    objection: toText(field(raw, "objection", 3), "challenge.objection"),
    evidenceUrl: toText(field(raw, "evidence_url", 4), "challenge.evidence_url"),
    initialStake: toBigInt(field(raw, "initial_stake", 5), "challenge.initial_stake"),
    outstandingStake: toBigInt(field(raw, "outstanding_stake", 6), "challenge.outstanding_stake"),
    commitment: toText(field(raw, "commitment", 7), "challenge.commitment"),
    status: toText(field(raw, "status", 8), "challenge.status"),
    reasoning: toText(field(raw, "reasoning", 9), "challenge.reasoning"),
  };
}

function readIdList(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.some((item) => typeof item !== "string")) {
    throw new Error("Contract returned a malformed proposal index.");
  }
  return raw.map((item) => validateIdentifier(item, "proposal ID"));
}

export async function loadMarketSnapshot(walletAddress: string | null): Promise<MarketSnapshot> {
  if (!configState.ok) throw new Error(configState.message);
  const [rawConfig, rawAccounting, rawCount] = await Promise.all([
    readContract("get_config"),
    readContract("get_accounting"),
    readContract("get_proposal_count"),
  ]);
  const config = readConfig(rawConfig);
  const accounting = readAccounting(rawAccounting);
  const proposalCount = toBigInt(rawCount, "proposal count");
  if (proposalCount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Contract returned an invalid proposal count.");
  const numericCount = Number(proposalCount);

  const offsets = Array.from({ length: Math.ceil(numericCount / 50) }, (_, page) => page * 50);
  const pages = await mapWithConcurrency(offsets, MAX_PARALLEL_DETAIL_READS, async (offset) => readIdList(await readContract("get_proposal_ids", [offset, 50])));
  const proposalIds = pages.flat();
  if (proposalIds.length !== numericCount || new Set(proposalIds).size !== proposalIds.length) {
    throw new Error("Contract returned an inconsistent proposal index.");
  }
  const proposals = await mapWithConcurrency(proposalIds, MAX_PARALLEL_DETAIL_READS, async (id) => readProposal(await readContract("get_proposal", [id])));
  const walletCredit = walletAddress
    ? toBigInt(await readContract("get_credit", [walletAddress]), "wallet credit")
    : null;
  return { config, accounting, proposalCount, proposalIds, proposals, walletCredit };
}

export async function loadProposalDetail(proposalId: string, proposalHint?: Proposal): Promise<ProposalDetail> {
  const canonicalProposalId = validateIdentifier(proposalId, "proposal ID");
  const [rawProposal, rawChallengeIds] = await Promise.all([
    proposalHint?.id === canonicalProposalId ? Promise.resolve(proposalHint) : readContract("get_proposal", [canonicalProposalId]),
    readContract("get_proposal_challenge_ids", [canonicalProposalId]),
  ]);
  const proposal = proposalHint && proposalHint.id === canonicalProposalId ? proposalHint : readProposal(rawProposal);
  const challengeIds = readIdList(rawChallengeIds);
  const challenges = await mapWithConcurrency(challengeIds, MAX_PARALLEL_DETAIL_READS, async (id) => readChallenge(await readContract("get_challenge", [id])));
  const canExecute = proposal.status === "CLEAR" && await readContract("can_execute", [canonicalProposalId]) === true;
  return { proposal, challenges, canExecute };
}

export type TargetedMarketUpdate = {
  proposal: Proposal;
  proposalCount: bigint;
  proposalIdsOffset: number;
  proposalIds: string[];
  accounting: Accounting;
  walletCredit: bigint | null;
};

export async function loadTargetedProposal(proposalId: string, walletAddress: string | null): Promise<TargetedMarketUpdate> {
  const canonicalProposalId = validateIdentifier(proposalId, "proposal ID");
  const [detail, rawCount, rawAccounting] = await Promise.all([
    loadProposalDetail(canonicalProposalId),
    readContract("get_proposal_count"),
    readContract("get_accounting"),
  ]);
  const proposalCount = toBigInt(rawCount, "proposal count");
  if (proposalCount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Contract returned an invalid proposal count.");
  const numericCount = Number(proposalCount);
  const proposalIdsOffset = Math.max(0, numericCount - 50);
  const [rawIds, rawCredit] = await Promise.all([
    readContract("get_proposal_ids", [proposalIdsOffset, 50]),
    walletAddress ? readContract("get_credit", [walletAddress]) : Promise.resolve(null),
  ]);
  return {
    proposal: detail.proposal,
    proposalCount,
    proposalIdsOffset,
    proposalIds: readIdList(rawIds),
    accounting: readAccounting(rawAccounting),
    walletCredit: rawCredit === null ? null : toBigInt(rawCredit, "wallet credit"),
  };
}

export async function checkReadConnection(): Promise<void> {
  if (!configState.ok) throw new Error(configState.message);
  await readContract("get_config");
}
