export type ErrorContext = "read" | "write" | "wallet" | "runtime" | "validation";

const RATE_LIMITED = "Live data is temporarily rate limited. Try again shortly.";
const RPC_UNAVAILABLE = "Live contract data is temporarily unavailable.";
const WALLET_REJECTED = "The request was cancelled in your wallet.";
const WRONG_NETWORK = "Switch to Studio Next to continue.";
const INSUFFICIENT_FUNDS = "The connected wallet does not have enough GEN.";
const MISSING_PROPOSAL = "This review was not found.";
const VALIDATION_FALLBACK = "Check the highlighted fields and try again.";
const UNKNOWN = "Something went wrong. Please try again.";
export const PENDING_CONFIRMATION = "Submitted, confirmation pending.";
export const FAILED_AFTER_BROADCAST = "The transaction was submitted, but contract execution failed.";

export class DissentValidationError extends Error {
  readonly dissentErrorKind = "validation";

  constructor(message: string) {
    super(message);
    this.name = "DissentValidationError";
  }
}

type ErrorParts = {
  message: string;
  code: string;
  name: string;
};

function errorParts(error: unknown): ErrorParts {
  if (error instanceof DissentValidationError) {
    return { message: error.message, code: "", name: error.name };
  }
  if (error instanceof Error) {
    const record = error as Error & { code?: unknown; shortMessage?: unknown };
    return {
      message: typeof record.shortMessage === "string" ? record.shortMessage : error.message,
      code: typeof record.code === "string" || typeof record.code === "number" ? String(record.code) : "",
      name: error.name,
    };
  }
  if (error !== null && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return {
      message: typeof record.shortMessage === "string"
        ? record.shortMessage
        : typeof record.message === "string"
          ? record.message
          : "",
      code: typeof record.code === "string" || typeof record.code === "number" ? String(record.code) : "",
      name: typeof record.name === "string" ? record.name : "",
    };
  }
  return { message: typeof error === "string" ? error : "", code: "", name: "" };
}

function searchableText(error: unknown): string {
  const parts = errorParts(error);
  return `${parts.message} ${parts.name} ${parts.code}`.toLowerCase();
}

export function isRateLimitError(error: unknown): boolean {
  return /rate[ -]?limit|too many requests|\b429\b/.test(searchableText(error));
}

export function sanitizeError(error: unknown, context: ErrorContext = "runtime"): string {
  if (context === "validation") {
    return error instanceof DissentValidationError ? error.message : "Check the highlighted fields and try again.";
  }

  const parts = errorParts(error);
  const text = searchableText(error);
  if (parts.code === "4001" || /user rejected|user denied|request rejected|cancelled in your wallet|canceled in your wallet/.test(text)) {
    return WALLET_REJECTED;
  }
  if (/proposal.{0,40}(not found|does not exist|not exist|unknown)|(?:not found|does not exist|unknown).{0,40}proposal/.test(text)) {
    return MISSING_PROPOSAL;
  }
  if (/wrong network|switch (the )?wallet|chain ?id|chain \d+|network mismatch|unsupported chain/.test(text)) {
    return WRONG_NETWORK;
  }
  if (/insufficient funds|not enough gen|balance too low|exceeds (the )?balance|underfunded/.test(text)) {
    return INSUFFICIENT_FUNDS;
  }
  if (/execution (failed|error)|finished_with_error|contract execution failed/.test(text)) {
    return FAILED_AFTER_BROADCAST;
  }
  if (isRateLimitError(error)) return RATE_LIMITED;
  if (/rpc|network|fetch|timeout|gateway|unavailable|connection refused|failed to load|\b50[234]\b/.test(text)) {
    return RPC_UNAVAILABLE;
  }
  return UNKNOWN;
}
