import { studioDevnet } from "genlayer-js/chains";
import type { GenLayerChain } from "genlayer-js/types";
import { defineChain } from "viem";

// Studio Next is a browser alias for the Studio development preview. Programmatic
// clients must use the canonical Studio-dev RPC even though both advertise 61997.
export const STUDIO_NEXT_RPC_URL = "https://studio-dev.genlayer.com/api";
export const STUDIO_NEXT_RPC_ALIAS_URL = "https://studio-next.genlayer.com/api";
export const STUDIO_NEXT_CHAIN_ID = 61997;
export const STUDIO_NEXT_CHAIN_ID_HEX = "0xf22d";
export const STUDIO_NEXT_NETWORK = "studio-next";
export const STUDIO_NEXT_EXPLORER_URL = "https://explorer-studio-dev.genlayer.com/";

// genlayer-js@2.0.0-rc.1 ships the matching Studio-dev chain metadata. Keep
// Dissent's product-facing Studio Next label, but bind all SDK reads/writes to
// the canonical Studio-dev endpoint.
export const studioNext = {
  ...studioDevnet,
  id: STUDIO_NEXT_CHAIN_ID,
  name: "GenLayer Studio Next",
  rpcUrls: {
    ...studioDevnet.rpcUrls,
    default: { http: [STUDIO_NEXT_RPC_URL] },
    public: { http: [STUDIO_NEXT_RPC_URL] },
  },
} as GenLayerChain;

export const studioNextWagmi = defineChain({
  id: STUDIO_NEXT_CHAIN_ID,
  name: "Studio Next",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: {
    default: { http: [STUDIO_NEXT_RPC_URL] },
    public: { http: [STUDIO_NEXT_RPC_URL] },
  },
  blockExplorers: {
    default: {
      name: "Studio Next Explorer",
      url: STUDIO_NEXT_EXPLORER_URL,
    },
  },
});
