import { studioDevnet } from "genlayer-js/chains";
import type { GenLayerChain } from "genlayer-js/types";
import { defineChain } from "viem";

// Studio Next and Studio Dev advertise chain 61997, so the endpoint is part
// of the network identity and must remain explicit in every public read/write.
export const STUDIO_NEXT_RPC_URL = "https://studio-next.genlayer.com/api";
export const STUDIO_NEXT_CHAIN_ID = 61997;
export const STUDIO_NEXT_CHAIN_ID_HEX = "0xf22d";
export const STUDIO_NEXT_NETWORK = "studio-next";
export const STUDIO_NEXT_EXPLORER_URL = "https://explorer-studio-dev.genlayer.com/";

// genlayer-js@2.0.0-rc.1 does not ship a studioNext constant. Clone the
// official Studio chain metadata and replace only the endpoint and labels.
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
