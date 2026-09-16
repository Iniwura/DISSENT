import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { STUDIO_NEXT_RPC_URL, studioNextWagmi } from "./network";

// RainbowKit discovers EIP-6963 injected wallets through wagmi. The generic
// injected connector remains a fallback for older browser extensions.
// WalletConnect is intentionally omitted until a real project ID is configured.
export const wagmiConfig = createConfig({
  chains: [studioNextWagmi],
  connectors: [
    injected(),
  ],
  transports: {
    [studioNextWagmi.id]: http(STUDIO_NEXT_RPC_URL),
  },
  multiInjectedProviderDiscovery: true,
});
