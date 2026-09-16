import { DissentValidationError } from "./errors";

export const PROPOSAL_STATUSES = [
  "OPEN",
  "CLEAR",
  "REVISE",
  "BLOCK",
  "CANCELLED",
  "EXECUTED",
] as const;

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export type EvidenceObservation = {
  id: string;
  evidenceUrl: string;
  status: "available" | "truncated" | "unavailable";
  contentHash: string;
};

export type Proposal = {
  id: string;
  proposer: string;
  executionRecipient: string;
  action: string;
  objective: string;
  policy: string;
  evidenceUrl: string;
  status: ProposalStatus | string;
  initialBond: bigint;
  outstandingBond: bigint;
  initialBounty: bigint;
  outstandingBounty: bigint;
  openedAt: bigint;
  challengeDeadline: bigint;
  resolvedAt: bigint;
  challengeCount: bigint;
  resolution: string;
  evidenceObservations: EvidenceObservation[] | null;
  observationError: string | null;
  executedAt: bigint;
  parentProposalId: string;
  revisionNumber: bigint;
  supersededBy: string;
};

export type Challenge = {
  id: string;
  proposalId: string;
  challenger: string;
  objection: string;
  evidenceUrl: string;
  initialStake: bigint;
  outstandingStake: bigint;
  commitment: string;
  status: string;
  reasoning: string;
};

export type DissentContractConfig = {
  minimumBounty: bigint;
  minimumStake: bigint;
  minimumExecutionBond: bigint;
  maximumChallenges: bigint;
  minimumReviewSeconds: bigint;
  maximumReviewSeconds: bigint;
  cancellationGraceSeconds: bigint;
  maxSourceChars: bigint;
  maxTotalSourceChars: bigint;
  maxPromptChars: bigint;
};

export type Accounting = {
  totalOutstandingEscrow: bigint;
  totalSettledCredits: bigint;
};

export type MarketSnapshot = {
  config: DissentContractConfig;
  accounting: Accounting;
  proposalCount: bigint;
  proposalIds: string[];
  proposals: Proposal[];
  walletCredit: bigint | null;
};

export type ProposalDetail = {
  proposal: Proposal;
  challenges: Challenge[];
  canExecute: boolean;
};

export function toBigInt(value: unknown, fieldName: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  throw new Error(`Invalid ${fieldName} value returned by contract.`);
}

export function toText(value: unknown, fieldName: string): string {
  if (typeof value !== "string") throw new Error(`Invalid ${fieldName} value returned by contract.`);
  return value;
}

export function toAddress(value: unknown, fieldName: string): string {
  const address = toText(value, fieldName);
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error(`Invalid ${fieldName} address returned by contract.`);
  return address;
}

export function field(raw: unknown, name: string, index: number): unknown {
  if (Array.isArray(raw)) return raw[index];
  if (raw !== null && typeof raw === "object") return (raw as Record<string, unknown>)[name];
  return undefined;
}

export function formatWei(value: bigint, decimals = 4): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 1_000_000_000_000_000_000n;
  const remainder = absolute % 1_000_000_000_000_000_000n;
  const fraction = remainder.toString().padStart(18, "0").slice(0, decimals).replace(/0+$/, "");
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (!fraction && remainder > 0n && whole === 0n) return (negative ? "-" : "") + "<0." + "0".repeat(Math.max(0, decimals - 1)) + "1 GEN";
  return (negative ? "-" : "") + grouped + (fraction ? "." + fraction : "") + " GEN";
}

export function formatMinimumWei(value: bigint): string {
  if (value >= 0n) return value.toLocaleString('en-US') + ' wei';
  return `${value.toLocaleString("en-US")} wei (${formatWei(value)} equivalent)`;
}

export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

export function validateIdentifier(value: string, fieldName = "identifier"): string {
  if (typeof value !== "string") throw new DissentValidationError(`Invalid ${fieldName}.`);
  const canonical = value.trim();
  if (!canonical || canonical.length > 80 || [...canonical].some((character) => character.charCodeAt(0) < 33 || character.charCodeAt(0) === 127)) {
    throw new DissentValidationError(`Invalid ${fieldName}.`);
  }
  return canonical;
}

function isDisallowedEvidenceHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === 'test' || hostname.endsWith('.test') || hostname.includes(':') || !hostname.includes('.')) return true;
  const octets = hostname.split('.');
  if (octets.length !== 4 || octets.some((part) => !/^\d+$/.test(part))) return false;
  const [first, second] = octets.map(Number);
  return first === 0 || first === 10 || first === 127 || (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

export function safeEvidenceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (isDisallowedEvidenceHostname(hostname)) return null;
    if (url.protocol !== "https:" || url.username || url.password || url.hash) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function formatTimestamp(seconds: bigint): string {
  if (seconds === 0n) return "Not recorded";
  const number = Number(seconds);
  if (!Number.isSafeInteger(number) || number < 0) return seconds.toString();
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(number * 1000));
}

export function parseObservations(value: unknown): {
  observations: EvidenceObservation[] | null;
  error: string | null;
} {
  if (value === undefined || value === null || value === "") return { observations: [], error: null };
  if (typeof value !== "string") return { observations: null, error: "Observation payload is not text." };
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error("Observation payload is not an array.");
    const observations = parsed.map((item, index) => {
      if (item === null || typeof item !== "object") throw new Error(`Observation ${index + 1} is malformed.`);
      const record = item as Record<string, unknown>;
      const status = record.status;
      if (typeof record.id !== "string" || typeof record.evidence_url !== "string" ||
          typeof record.content_hash !== "string" ||
          !["available", "truncated", "unavailable"].includes(String(status))) {
        throw new Error(`Observation ${index + 1} is malformed.`);
      }
      return {
        id: record.id,
        evidenceUrl: record.evidence_url,
        status: status as EvidenceObservation["status"],
        contentHash: record.content_hash,
      };
    });
    return { observations, error: null };
  } catch (error) {
    return { observations: null, error: "Observation payload is malformed." };
  }
}
