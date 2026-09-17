import { createTransactionKit } from "@genlayer/transaction-kit";
import { createClient } from "genlayer-js";
import { transactionsStatusNumberToName, executionResultNumberToName, type CalldataEncodable, type GenLayerTransaction, type TransactionHash } from "genlayer-js/types";
import { configState, requireConfig } from "./config";
import { readContract } from "./data";
import { studioNext } from "./network";
import { readWalletChainId } from "./wallet";
import type { InjectedProvider } from "./wallet";
import { DissentValidationError, FAILED_AFTER_BROADCAST, PENDING_CONFIRMATION } from "./errors";
import { field } from "./types";

import { safeEvidenceUrl } from './types';

export const U256_MAX = (1n << 256n) - 1n;

export type DissentWriteRequest = {
  walletAddress: string;
  provider: InjectedProvider;
  functionName: string;
  args: CalldataEncodable[];
  value: bigint;
};

export type WritePhase = "idle" | "checking" | "awaiting_signature" | "submitted" | "awaiting_result" | "accepted" | "finalizing" | "confirmation_pending" | "confirmed" | "succeeded" | "failed";

export type WriteProgress = {
  phase: WritePhase;
  hash: string | null;
  error: string | null;
};

export type PendingWrite = {
  hash: TransactionHash;
  functionName: string;
  proposalId: string;
  secondaryId: string | null;
  createdAt: number;
};

export type PendingReconciliation =
  | { status: "confirmed"; hash: TransactionHash }
  | { status: "failed"; hash: TransactionHash; error: string }
  | null;

const PENDING_WRITE_STORAGE_KEY = "dissent-pending-write-v1";

type ClientProvider = NonNullable<NonNullable<Parameters<typeof createClient>[0]>["provider"]>;

function proposalIdFor(functionName: string, args: CalldataEncodable[]): string | null {
  const value = functionName === "revise" ? args[1] : args[0];
  return typeof value === "string" ? value : null;
}

function secondaryIdFor(functionName: string, args: CalldataEncodable[]): string | null {
  const value = functionName === "challenge" ? args[1] : null;
  return typeof value === "string" ? value : null;
}

function savePendingWrite(request: DissentWriteRequest, hash: TransactionHash): void {
  const proposalId = proposalIdFor(request.functionName, request.args);
  if (!proposalId || typeof window === "undefined") return;
  const pending: PendingWrite = {
    hash,
    functionName: request.functionName,
    proposalId,
    secondaryId: secondaryIdFor(request.functionName, request.args),
    createdAt: Date.now(),
  };
  try { window.localStorage.setItem(PENDING_WRITE_STORAGE_KEY, JSON.stringify(pending)); } catch { /* Storage is optional. */ }
}

export function getPendingWrite(): PendingWrite | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PENDING_WRITE_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingWrite>;
    if (typeof value.hash !== "string" || !/^0x[0-9a-fA-F]+$/.test(value.hash) || typeof value.functionName !== "string" || typeof value.proposalId !== "string") return null;
    return { hash: value.hash as TransactionHash, functionName: value.functionName, proposalId: value.proposalId, secondaryId: typeof value.secondaryId === "string" ? value.secondaryId : null, createdAt: typeof value.createdAt === "number" ? value.createdAt : 0 };
  } catch { return null; }
}

function clearPendingWrite(): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(PENDING_WRITE_STORAGE_KEY); } catch { /* Storage is optional. */ }
}

function statusName(receipt: GenLayerTransaction): string | undefined {
  if (receipt.statusName) return receipt.statusName;
  if (typeof receipt.status === "number") return transactionsStatusNumberToName[String(receipt.status) as keyof typeof transactionsStatusNumberToName];
  return typeof receipt.status === "string" ? receipt.status : undefined;
}

function executionResultName(receipt: GenLayerTransaction): string | undefined {
  if (receipt.txExecutionResultName) return receipt.txExecutionResultName;
  if (typeof receipt.txExecutionResult === "number") return executionResultNumberToName[String(receipt.txExecutionResult) as keyof typeof executionResultNumberToName];
  return undefined;
}

function rawList(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string") : [];
}

function rawProposalStatus(raw: unknown): string | null {
  const value = field(raw, "status", 7);
  return typeof value === "string" ? value : null;
}

async function proposalIsIndexed(proposalId: string): Promise<boolean> {
  const rawCount = await readContract("get_proposal_count");
  const count = typeof rawCount === "bigint" ? rawCount : typeof rawCount === "string" && /^\d+$/.test(rawCount) ? BigInt(rawCount) : null;
  if (count === null || count === 0n) return false;
  const offset = count > 50n ? count - 50n : 0n;
  return rawList(await readContract("get_proposal_ids", [offset, 50])).includes(proposalId);
}

async function proposalIsReadable(proposalId: string): Promise<boolean> {
  if (!await proposalIsIndexed(proposalId)) return false;
  try {
    return rawProposalStatus(await readContract("get_proposal", [proposalId])) !== null;
  } catch {
    return false;
  }
}

export async function confirmContractState(functionName: string, proposalId: string, secondaryId: string | null = null): Promise<boolean> {
  if (functionName === "commit" || functionName === "revise") return proposalIsReadable(proposalId);
  if (functionName === "challenge") return Boolean(secondaryId && rawList(await readContract("get_proposal_challenge_ids", [proposalId])).includes(secondaryId));
  const state = rawProposalStatus(await readContract("get_proposal", [proposalId]));
  if (functionName === "adjudicate") return state !== null && state !== "OPEN";
  if (functionName === "execute") return state === "EXECUTED";
  if (functionName === "cancel") return state === "CANCELLED";
  return false;
}

export async function reconcilePendingWrite(pending: PendingWrite): Promise<PendingReconciliation> {
  try {
    const config = requireConfig();
    const receipt = await createClient({ chain: studioNext, endpoint: config.rpcUrl }).getTransaction({ hash: pending.hash });
    const currentStatus = statusName(receipt);
    const result = executionResultName(receipt);
    if ((currentStatus === "ACCEPTED" || currentStatus === "FINALIZED") && result === "FINISHED_WITH_RETURN") {
      if (await confirmContractState(pending.functionName, pending.proposalId, pending.secondaryId)) {
        clearPendingWrite();
        return { status: "confirmed", hash: pending.hash };
      }
      return null;
    }
    if (currentStatus === "FINALIZED" && result && result !== "FINISHED_WITH_RETURN") {
      clearPendingWrite();
      return { status: "failed", hash: pending.hash, error: FAILED_AFTER_BROADCAST };
    }
  } catch { /* Keep the pending record for a later reconciliation. */ }
  return null;
}

export function parseUint(value: string, fieldName: string): bigint {
  const cleaned = value.trim();
  if (!/^\d+$/.test(cleaned)) throw new DissentValidationError(`${fieldName} must be a non-negative integer.`);
  const parsed = BigInt(cleaned);
  if (parsed > U256_MAX) throw new DissentValidationError(`${fieldName} is outside the u256 range.`);
  return parsed;
}

export function parseGen(value: string, fieldName: string): bigint {
  const cleaned = value.trim();
  if (!/^\d+(?:\.\d{1,18})?$/.test(cleaned)) throw new DissentValidationError(`${fieldName} must be a GEN amount with up to 18 decimals.`);
  const [whole, fraction = ""] = cleaned.split(".");
  const parsed = BigInt(whole) * 1_000_000_000_000_000_000n + BigInt(fraction.padEnd(18, "0"));
  if (parsed > U256_MAX) throw new DissentValidationError(`${fieldName} is outside the u256 range.`);
  return parsed;
}

export function validateRecipient(value: string): string {
  const cleaned = value.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(cleaned)) throw new DissentValidationError("Execution recipient must be a 20-byte address.");
  if (/^0x0{40}$/i.test(cleaned)) throw new DissentValidationError("Execution recipient cannot be the zero address.");
  return cleaned;
}

export function validateHttpsUrl(value: string): string {
  const cleaned = value.trim();
  if (!safeEvidenceUrl(cleaned)) throw new DissentValidationError('Evidence URL must use a public HTTPS host.');
  let parsed: URL;
  try { parsed = new URL(cleaned); } catch { throw new DissentValidationError("Evidence URL must be a valid HTTPS URL."); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash || !parsed.hostname) {
    throw new DissentValidationError("Evidence URL must be HTTPS without credentials or a fragment.");
  }
  const hostname = parsed.hostname.toLowerCase();
  const host = hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.includes(":")) {
    throw new DissentValidationError("Evidence URL cannot target localhost.");
  }
  const ipv4 = host.split(".");
  if (ipv4.length === 4 && ipv4.every((part) => /^\d+$/.test(part))) {
    const [first, second, third] = ipv4.map(Number);
    if (ipv4.some((part) => Number(part) > 255)) throw new DissentValidationError("Evidence URL has an invalid IP address.");
    const reserved = first === 0 || first === 10 || first === 127
      || (first === 100 && second >= 64 && second <= 127)
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && (second === 0 || second === 168))
      || (first === 192 && second === 88 && third === 99)
      || (first === 198 && (second === 18 || second === 19 || second === 51))
      || (first === 203 && second === 0 && third === 113)
      || first >= 224;
    if (reserved) throw new DissentValidationError("Evidence URL cannot target a reserved IP address.");
  }
  return parsed.toString();
}

export async function submitContractWrite(
  request: DissentWriteRequest,
  onProgress: (progress: WriteProgress) => void,
): Promise<{ hash: TransactionHash; receipt: GenLayerTransaction | null; confirmed: boolean }> {
  if (!configState.ok) throw new Error(configState.message);
  const config = requireConfig();
  const provider = request.provider;

  let hash: TransactionHash | null = null;
  try {
    onProgress({ phase: "checking", hash: null, error: null });
    const chainId = await readWalletChainId(provider);
    if (chainId !== config.chainId) throw new Error(`Wallet is on chain ${chainId}; Studio Next chain ${config.chainId} is required before signing.`);

    const client = createClient({
      chain: studioNext,
      endpoint: config.rpcUrl,
      account: request.walletAddress as `0x${string}`,
      provider: provider as unknown as ClientProvider,
    });
    const kit = createTransactionKit({
      chain: studioNext,
      provider,
      account: request.walletAddress as `0x${string}`,
    });
    const quote = await kit.estimate(
      { preset: "standard", userValue: request.value },
      {
        kind: "write",
        address: config.contractAddress,
        method: request.functionName,
        args: request.args,
      },
    );
    if (quote.gasless || quote.feeValue <= 0n) {
      throw new Error("Studio Next returned no positive v0.6 fee deposit; signing was blocked.");
    }
    if (quote.verification.status === "mismatch") {
      throw new Error("Studio Next fee policy changed while estimating; re-estimate before signing.");
    }

    onProgress({ phase: "awaiting_signature", hash: null, error: null });
    hash = await client.writeContract({
      address: config.contractAddress,
      functionName: request.functionName,
      args: request.args,
      value: request.value,
      fees: { distribution: quote.distribution, feeValue: quote.feeValue },
    }) as TransactionHash;
    savePendingWrite(request, hash);
    onProgress({ phase: "submitted", hash, error: null });

    let decision: GenLayerTransaction | null = null;
    try {
      decision = await client.waitForDecision({ hash, fullTransaction: false });
    } catch {
      // A receipt polling failure after broadcast is not proof that the write failed.
    }
    if (decision && statusName(decision) === "ACCEPTED") {
      onProgress({ phase: "accepted", hash, error: null });
    } else {
      onProgress({ phase: "awaiting_result", hash, error: null });
    }

    onProgress({ phase: "finalizing", hash, error: null });
    const receipt = await client.waitForFinalization({ hash, fullTransaction: false });
    const finalStatus = statusName(receipt);
    if (finalStatus !== "ACCEPTED" && finalStatus !== "FINALIZED") {
      throw new Error("The submitted transaction has not reached an accepted or finalized state.");
    }
    if (executionResultName(receipt) !== "FINISHED_WITH_RETURN") {
      clearPendingWrite();
      onProgress({ phase: "failed", hash, error: FAILED_AFTER_BROADCAST });
      throw new Error(FAILED_AFTER_BROADCAST);
    }

    if (!await confirmContractState(request.functionName, proposalIdFor(request.functionName, request.args) ?? "", secondaryIdFor(request.functionName, request.args))) {
      onProgress({ phase: "confirmation_pending", hash, error: PENDING_CONFIRMATION });
      return { hash, receipt, confirmed: false };
    }

    clearPendingWrite();
    onProgress({ phase: "confirmed", hash, error: null });
    return { hash, receipt, confirmed: true };
  } catch (error) {
    if (!hash) throw error;
    const pending: PendingWrite = {
      hash,
      functionName: request.functionName,
      proposalId: proposalIdFor(request.functionName, request.args) ?? "",
      secondaryId: secondaryIdFor(request.functionName, request.args),
      createdAt: Date.now(),
    };
    const reconciled = await reconcilePendingWrite(pending);
    if (reconciled?.status === "confirmed") {
      onProgress({ phase: "confirmed", hash, error: null });
      return { hash, receipt: null, confirmed: true };
    }
    if (reconciled?.status === "failed") {
      onProgress({ phase: "failed", hash, error: FAILED_AFTER_BROADCAST });
      throw new Error(FAILED_AFTER_BROADCAST);
    }
    onProgress({ phase: "confirmation_pending", hash, error: PENDING_CONFIRMATION });
    return { hash, receipt: null, confirmed: false };
  }
}
