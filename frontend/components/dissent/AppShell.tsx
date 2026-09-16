"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit/components";
import { Activity, CircleAlert, CircleHelp, Copy, Wallet, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useDissent } from "./DissentProvider";
import { STUDIO_NEXT_CHAIN_ID } from "@/lib/dissent/network";
import { configState } from "@/lib/dissent/config";
import { SDK_VERSION } from "@/lib/dissent/data";
import { formatWei, shortAddress } from "@/lib/dissent/types";
import { sanitizeError } from "@/lib/dissent/errors";

const links = [
  { href: "/reviews", label: "Reviews", match: (pathname: string) => pathname === "/reviews" || (pathname.startsWith("/reviews/") && pathname !== "/reviews/new") },
  { href: "/reviews/new", label: "Start a Review", match: (pathname: string) => pathname === "/reviews/new" },
  { href: "/balance", label: "Balance", match: (pathname: string) => pathname === "/balance" },
];

function healthLabel(health: ReturnType<typeof useDissent>["health"]): string {
  return {
    loading: "Reading live contract",
    healthy: "Contract reads live",
    unavailable: "Read unavailable",
    misconfigured: "Configuration error",
  }[health];
}

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const { snapshot, health, wallet, disconnect, switchNetwork } = useDissent();
  const [networkSwitching, setNetworkSwitching] = useState(false);
  const [networkOpen, setNetworkOpen] = useState(false);
  const networkTriggerRef = useRef<HTMLButtonElement>(null);
  const networkCloseRef = useRef<HTMLButtonElement>(null);
  const networkWasOpenRef = useRef(false);

  useEffect(() => {
    if (!networkOpen) {
      if (networkWasOpenRef.current) networkTriggerRef.current?.focus();
      networkWasOpenRef.current = false;
      return;
    }
    networkWasOpenRef.current = true;
    networkCloseRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNetworkOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [networkOpen]);

  async function handleSwitchNetwork() {
    if (networkSwitching) return;
    setNetworkSwitching(true);
    try {
      await switchNetwork();
    } finally {
      setNetworkSwitching(false);
    }
  }

  const wrongWalletNetwork = Boolean(wallet.address) && wallet.chainId !== STUDIO_NEXT_CHAIN_ID;

  return <div className="app-shell">
    <div className="site-frame">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Dissent home">
          <span className="brand-mark" aria-hidden="true"><i /><i /></span>
          <span>DISSENT</span>
        </Link>
        <nav className="header-nav" aria-label="Primary navigation">
          {links.map((link) => <Link
            className={link.match(pathname) ? "nav-link active" : "nav-link"}
            href={link.href}
            key={link.href}
            data-tour={link.href === "/reviews/new" ? "nav-start-review" : undefined}
          >{link.label}</Link>)}
        </nav>
        <div className="header-actions">
          <ConnectButton.Custom>
            {({ account, chain, openConnectModal, mounted }) => {
              if (!mounted) return <span className="wallet-button" aria-hidden="true"><Wallet size={15} /></span>;
              if (!account || !chain) return <button
                className="wallet-button"
                type="button"
                data-tour="wallet"
                onClick={openConnectModal}
                title={wallet.providerAvailable ? "Choose a compatible browser wallet" : "No compatible browser wallet detected"}
              ><Wallet size={15} /><span>Connect wallet</span></button>;

              const fullAddress = wallet.address ?? account.address;
              return <details className="wallet-session-control">
                <summary className="wallet-button" data-tour="wallet" title="Open wallet session">
                  <Wallet size={15} /><span>{account.displayName}</span>
                </summary>
                <div className="session-menu" role="dialog" aria-label="Wallet session">
                  <div className="session-menu-heading">
                    <p className="eyebrow">Wallet session</p>
                    <strong>{account.displayName}</strong>
                  </div>
                  <div className="session-address">
                    <span className="mono">{fullAddress}</span>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={(event) => { event.preventDefault(); void navigator.clipboard?.writeText(fullAddress); }}
                      aria-label="Copy full wallet address"
                      title="Copy full wallet address"
                    ><Copy size={15} /></button>
                  </div>
                  <div className="session-network">
                    <span className={chain.unsupported ? "health-dot health-dot-error" : "health-dot health-dot-" + health} />
                    <div>
                      <strong>{chain.unsupported ? "Unsupported network" : chain.name}</strong>
                      <small>{chain.id === STUDIO_NEXT_CHAIN_ID ? "Chain 61997" : "Switch to Studio Next"}</small>
                    </div>
                  </div>
                  <small className="session-connector">{wallet.connectorName ?? "Selected wallet"}</small>
                  <button
                    ref={networkTriggerRef}
                    className="session-menu-link"
                    type="button"
                    onClick={(event) => { event.preventDefault(); setNetworkOpen(true); }}
                  >Network details <span aria-hidden="true">&rarr;</span></button>
                  <button
                    className="session-menu-link session-menu-danger"
                    type="button"
                    onClick={(event) => { event.preventDefault(); disconnect(); }}
                  >Disconnect <span aria-hidden="true">&times;</span></button>
                </div>
              </details>;
            }}
          </ConnectButton.Custom>
        </div>
      </header>

      {(!configState.ok || wallet.error) && <section className="notice notice-error" role="alert">
        <CircleAlert size={17} />
        <div>
          <strong>{!configState.ok ? "Public configuration needs attention" : "Wallet connection needs attention"}</strong>
          <p>{!configState.ok ? sanitizeError(configState.message, "read") : wallet.error}</p>
        </div>
      </section>}

      {wrongWalletNetwork && <section className="notice notice-network" role="status">
        <CircleAlert size={17} />
        <div>
          <strong>Wallet is on another network</strong>
          <p>Switch to Studio Next chain {STUDIO_NEXT_CHAIN_ID} to sign Dissent writes. Public reads remain available.</p>
        </div>
        <button className="button button-quiet" type="button" onClick={() => void handleSwitchNetwork()} disabled={networkSwitching}>
          {networkSwitching ? "Switching..." : "Switch to Studio Next"}
        </button>
      </section>}

      <main>{children}</main>
      <footer className="site-footer">
        <span><Activity size={14} /> Opt-in adversarial review</span>
        <span>Settled credits stay inside Dissent</span>
      </footer>
    </div>

    {networkOpen && <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setNetworkOpen(false); }}>
      <aside className="network-drawer" role="dialog" aria-modal="true" aria-labelledby="network-status-title">
        <div className="drawer-heading">
          <div><p className="eyebrow">Connection diagnostics</p><h2 id="network-status-title">Network status</h2></div>
          <button className="icon-button" type="button" onClick={() => setNetworkOpen(false)} aria-label="Close network status" ref={networkCloseRef}><X size={18} /></button>
        </div>
        <div className="drawer-health">
          <span className={health === "unavailable" ? "health-dot health-dot-error" : "health-dot health-dot-" + health} />
          <strong>{healthLabel(health)}</strong>
          <small>{wallet.connected ? "Wallet connected - " + shortAddress(wallet.address ?? "") : "Public reads do not require a wallet"}</small>
        </div>
        <dl className="network-list">
          <div><dt>Network</dt><dd>{configState.ok ? configState.value.network : "Unavailable"}</dd></div>
          <div><dt>Chain</dt><dd>{configState.ok ? configState.value.chainId : "Unavailable"}</dd></div>
          <div><dt>RPC</dt><dd className="mono">{configState.ok ? configState.value.rpcUrl : "Unavailable"}</dd></div>
          <div><dt>Contract</dt><dd className="mono">{configState.ok ? configState.value.contractAddress : "Unavailable"}</dd></div>
          <div><dt>Read SDK</dt><dd>{SDK_VERSION}</dd></div>
        </dl>
        {snapshot && <div className="drawer-proof">
          <span className="eyebrow">Live ledger</span>
          <div><span>Outstanding escrow</span><strong>{formatWei(snapshot.accounting.totalOutstandingEscrow)}</strong></div>
          <div><span>Settled credits</span><strong>{formatWei(snapshot.accounting.totalSettledCredits)}</strong></div>
        </div>}
        <p className="drawer-note">Writes require explicit wallet approval and are guarded to Studio Next chain 61997. Public reads remain wallet-free.</p>
      </aside>
    </div>}
  </div>;
}

export function PhaseTwoNote() {
  return <span className="phase-note"><CircleHelp size={13} /> Wallet actions require explicit approval in your connected wallet.</span>;
}

export function WeiValue({ value }: { value: bigint }) {
  return <span className="wei-value">{formatWei(value)}</span>;
}
