"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit/components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/dissent/wagmi";

const dissentTheme = {
  colors: {
    accentColor: "#c92f32",
    accentColorForeground: "#f4efe4",
    actionButtonBorder: "#403a33",
    actionButtonBorderMobile: "#403a33",
    actionButtonSecondaryBackground: "#1b1917",
    closeButton: "#b9b1a4",
    closeButtonBackground: "#1b1917",
    connectButtonBackground: "#c92f32",
    connectButtonBackgroundError: "#c92f32",
    connectButtonInnerBackground: "#c92f32",
    connectButtonText: "#f4efe4",
    connectButtonTextError: "#f4efe4",
    connectionIndicator: "#c92f32",
    downloadBottomCardBackground: "#1b1917",
    downloadTopCardBackground: "#101010",
    error: "#c92f32",
    generalBorder: "#403a33",
    generalBorderDim: "#2b2823",
    menuItemBackground: "#1b1917",
    modalBackdrop: "rgba(10, 10, 10, 0.72)",
    modalBackground: "#101010",
    modalBorder: "#403a33",
    modalText: "#f4efe4",
    modalTextDim: "#8e877d",
    modalTextSecondary: "#b9b1a4",
    profileAction: "#c92f32",
    profileActionHover: "#a82529",
    profileForeground: "#101010",
    selectedOptionBorder: "#c92f32",
    standby: "#b9b1a4",
  },
  fonts: { body: "inherit" },
  radii: {
    actionButton: "0px",
    connectButton: "0px",
    menuButton: "0px",
    modal: "0px",
    modalMobile: "0px",
  },
  shadows: {
    connectButton: "none",
    dialog: "0 24px 80px rgba(0, 0, 0, 0.45)",
    profileDetailsAction: "none",
    selectedOption: "0 0 0 1px #c92f32",
    selectedWallet: "0 0 0 1px #c92f32",
    walletLogo: "none",
  },
  blurs: { modalOverlay: "blur(2px)" },
};

export function Web3Provider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [queryClient] = useState(() => new QueryClient());

  return <WagmiProvider config={wagmiConfig}>
    <QueryClientProvider client={queryClient}>
      <RainbowKitProvider theme={dissentTheme}>{children}</RainbowKitProvider>
    </QueryClientProvider>
  </WagmiProvider>;
}
