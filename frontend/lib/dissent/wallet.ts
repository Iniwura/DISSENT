export type InjectedProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

export class WalletUserRejectedError extends Error {
  readonly code = 4001;

  constructor() {
    super("Wallet request rejected.");
    this.name = "WalletUserRejectedError";
  }
}

function rpcErrorCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const record = error as { code?: unknown; cause?: unknown; data?: { originalError?: unknown } };
  if (typeof record.code === "number") return record.code;
  return rpcErrorCode(record.cause) ?? rpcErrorCode(record.data?.originalError);
}

export function isUserRejectedError(error: unknown): boolean {
  if (error instanceof WalletUserRejectedError) return true;
  if (rpcErrorCode(error) === 4001) return true;
  return typeof error === "object" && error !== null && /userrejected|user rejected|request rejected/i.test(String((error as { name?: unknown }).name ?? ""));
}

export async function readWalletChainId(provider: InjectedProvider): Promise<number> {
  const value = await provider.request({ method: "eth_chainId" });
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new Error("Wallet returned an invalid chain ID.");
  }
  return Number(BigInt(value));
}

export function normalizeWalletAddress(value: string): string {
  return value.trim().toLowerCase();
}
