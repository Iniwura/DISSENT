import { STUDIO_NEXT_NETWORK, STUDIO_NEXT_RPC_URL } from "./network";

export type DissentConfig = {
  rpcUrl: string;
  chainId: number;
  network: typeof STUDIO_NEXT_NETWORK;
  contractAddress: `0x${string}`;
};

export type ConfigState =
  | { ok: true; value: DissentConfig }
  | { ok: false; message: string };

const DEFAULT_RPC_URL = STUDIO_NEXT_RPC_URL;
const DEFAULT_CHAIN_ID = "61997";
const DEFAULT_NETWORK = STUDIO_NEXT_NETWORK;
const DEFAULT_CONTRACT_ADDRESS = "0x8BD79Ac285FBd87147B9A64BfF60436C050A684C";

export const VERIFIED_X_POST_URL = "https://x.com/saitama_xc/status/2095118089901818044";
export const VERIFIED_X_POST_AUTHOR = "@saitama_xc";

function publicValue(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined ? fallback : value.trim();
}

function parseChainId(value: string): number {
  if (!/^\d+$/.test(value)) throw new Error("NEXT_PUBLIC_GENLAYER_CHAIN_ID must be numeric.");
  const parsed = BigInt(value);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("NEXT_PUBLIC_GENLAYER_CHAIN_ID is outside the safe integer range.");
  }
  return Number(parsed);
}

function parseConfig(): ConfigState {
  try {
    const rpcUrl = publicValue("NEXT_PUBLIC_GENLAYER_RPC_URL", DEFAULT_RPC_URL);
    const chainId = parseChainId(publicValue("NEXT_PUBLIC_GENLAYER_CHAIN_ID", DEFAULT_CHAIN_ID));
    const network = publicValue("NEXT_PUBLIC_GENLAYER_NETWORK", DEFAULT_NETWORK);
    const contractAddress = publicValue(
      "NEXT_PUBLIC_DISSENT_CONTRACT_ADDRESS",
      DEFAULT_CONTRACT_ADDRESS,
    );

    if (!/^https:\/\/[^\s/]+(?:\/[^\s]*)?$/.test(rpcUrl)) {
      throw new Error("NEXT_PUBLIC_GENLAYER_RPC_URL must be an HTTPS URL.");
    }
    if (chainId !== 61997) throw new Error("This release candidate requires Studio Next chain 61997.");
    if (network !== STUDIO_NEXT_NETWORK) throw new Error("This release candidate requires the Studio Next network label.");
    if (rpcUrl !== STUDIO_NEXT_RPC_URL) throw new Error("This release candidate requires the configured Studio Next RPC.");
    if (!/^0x[0-9a-fA-F]{40}$/.test(contractAddress)) {
      throw new Error("NEXT_PUBLIC_DISSENT_CONTRACT_ADDRESS must be a 20-byte address.");
    }

    return {
      ok: true,
      value: {
        rpcUrl,
        chainId,
        network,
        contractAddress: contractAddress as `0x${string}`,
      },
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Invalid public configuration.",
    };
  }
}

export const configState = parseConfig();

export function requireConfig(): DissentConfig {
  if (!configState.ok) throw new Error(configState.message);
  return configState.value;
}
