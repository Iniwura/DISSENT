"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { configState } from "@/lib/dissent/config";
import { invalidateReadCache, loadMarketSnapshot, type ReadHealth } from "@/lib/dissent/data";
import type { MarketSnapshot } from "@/lib/dissent/types";
import { isUserRejectedError, normalizeWalletAddress } from "@/lib/dissent/wallet";
import type { InjectedProvider } from "@/lib/dissent/wallet";
import { STUDIO_NEXT_CHAIN_ID } from "@/lib/dissent/network";
import { isRateLimitError, sanitizeError } from "@/lib/dissent/errors";

type WalletState = {
  address: string | null;
  chainId: number | null;
  connected: boolean;
  providerAvailable: boolean;
  provider: InjectedProvider | null;
  connectorName: string | null;
  error: string | null;
};

export type DissentContextValue = {
  snapshot: MarketSnapshot | null;
  dataError: string | null;
  loading: boolean;
  health: ReadHealth;
  refresh: () => void;
  retry: () => void;
  canRetry: boolean;
  retryAvailableAt: number | null;
  wallet: WalletState;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
};

type ProviderCapableConnector = {
  getProvider: (parameters?: { chainId?: number }) => Promise<unknown>;
};

function hasProviderGetter(value: unknown): value is ProviderCapableConnector {
  return typeof value === "object" && value !== null && "getProvider" in value && typeof value.getProvider === "function";
}

const DissentContext = createContext<DissentContextValue | null>(null);

export function DissentProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const { address, connector, isConnected } = useAccount();
  const chainId = useChainId();
  const { connectors, error: connectError } = useConnect();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [snapshotWalletAddress, setSnapshotWalletAddress] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [loading, setLoading] = useState(configState.ok);
  const [refreshToken, setRefreshToken] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState<InjectedProvider | null>(null);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [retryAvailableAt, setRetryAvailableAt] = useState<number | null>(null);
  const [retryClock, setRetryClock] = useState(() => Date.now());
  const loadingRef = useRef(loading);
  const refreshQueuedRef = useRef(false);
  const retryCooldownRef = useRef(0);
  const lastSuccessfulRefreshRef = useRef(0);
  const lastRefreshRequestedRef = useRef(0);
  const previousWalletKeyRef = useRef<string | null>(null);

  const walletAddress = address ? normalizeWalletAddress(address) : null;
  const walletKey = walletAddress && connector
    ? walletAddress + ":" + connector.id + ":" + (chainId ?? "unknown")
    : null;

  useEffect(() => { loadingRef.current = loading; }, [loading]);

  const refresh = useCallback(() => {
    const requestedAt = Date.now();
    if (!configState.ok || requestedAt < retryCooldownRef.current) return;
    if (requestedAt - lastRefreshRequestedRef.current < 1_000) return;
    if (loadingRef.current) {
      refreshQueuedRef.current = true;
      lastRefreshRequestedRef.current = requestedAt;
      return;
    }
    lastRefreshRequestedRef.current = requestedAt;
    invalidateReadCache();
    setDataError(null);
    loadingRef.current = true;
    setRefreshToken((value) => value + 1);
  }, []);

  const retry = useCallback(() => refresh(), [refresh]);

  useEffect(() => {
    if (previousWalletKeyRef.current === walletKey) return;
    previousWalletKeyRef.current = walletKey;
    setProviderError(null);
  }, [walletKey]);

  useEffect(() => {
    let active = true;
    setSelectedProvider(null);
    if (!connector || !isConnected) return () => { active = false; };
    const liveConnector = connectors.find((candidate) => candidate.uid === connector.uid)
      ?? connectors.find((candidate) => candidate.id === connector.id);
    if (!liveConnector || !hasProviderGetter(liveConnector)) {
      setProviderError("Selected wallet provider is unavailable. Reconnect the wallet.");
      return () => { active = false; };
    }
    void liveConnector.getProvider({ chainId: STUDIO_NEXT_CHAIN_ID })
      .then((provider) => {
        if (active) setSelectedProvider((provider as InjectedProvider | undefined) ?? null);
      })
      .catch((error: unknown) => {
        if (active) setProviderError(sanitizeError(error, "wallet"));
      });
    return () => { active = false; };
  }, [connector, connectors, isConnected]);

  useEffect(() => {
    let cancelled = false;
    if (!configState.ok) return () => { cancelled = true; };
    setLoading(true);
    loadMarketSnapshot(walletAddress)
      .then((value) => {
        if (!cancelled) {
          lastSuccessfulRefreshRef.current = Date.now();
          retryCooldownRef.current = 0;
          setRetryAvailableAt(null);
          setSnapshot(value);
          setSnapshotWalletAddress(walletAddress);
          setDataError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          const message = sanitizeError(error, "read");
          if (isRateLimitError(error)) {
            const until = Date.now() + 5_000;
            retryCooldownRef.current = until;
            setRetryAvailableAt(until);
          }
          setDataError(message);
        }
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        loadingRef.current = false;
        if (refreshQueuedRef.current) {
          refreshQueuedRef.current = false;
          loadingRef.current = true;
          setRefreshToken((value) => value + 1);
        }
      });
    return () => { cancelled = true; };
  }, [refreshToken, walletAddress]);

  useEffect(() => {
    let pollTimer: number | null = null;
    const clearPoll = () => {
      if (pollTimer !== null) {
        window.clearTimeout(pollTimer);
        pollTimer = null;
      }
    };
    const refreshIfStale = () => {
      if (document.visibilityState !== "visible") return;
      if (lastSuccessfulRefreshRef.current !== 0 && Date.now() - lastSuccessfulRefreshRef.current >= 5_000) refresh();
    };
    const schedulePoll = () => {
      clearPoll();
      if (document.visibilityState !== "visible") return;
      pollTimer = window.setTimeout(() => {
        pollTimer = null;
        refresh();
        schedulePoll();
      }, 15_000);
    };
    const refreshOnVisible = () => {
      if (document.visibilityState === "visible") {
        refreshIfStale();
        schedulePoll();
      } else {
        clearPoll();
      }
    };
    window.addEventListener("focus", refreshIfStale);
    document.addEventListener("visibilitychange", refreshOnVisible);
    schedulePoll();
    return () => {
      window.removeEventListener("focus", refreshIfStale);
      document.removeEventListener("visibilitychange", refreshOnVisible);
      clearPoll();
    };
  }, [refresh]);

  useEffect(() => {
    if (retryAvailableAt === null) return;
    const timer = window.setInterval(() => setRetryClock(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [retryAvailableAt]);

  const disconnect = useCallback(() => {
    wagmiDisconnect();
    setSelectedProvider(null);
    setProviderError(null);
  }, [wagmiDisconnect]);

  const switchNetwork = useCallback(async () => {
    try {
      await switchChainAsync({ chainId: STUDIO_NEXT_CHAIN_ID });
      setProviderError(null);
    } catch (error) {
      if (isUserRejectedError(error)) {
        setProviderError(null);
        return;
      }
      setProviderError(sanitizeError(error, "wallet"));
    }
  }, [switchChainAsync]);

  const connectErrorMessage = connectError && !isUserRejectedError(connectError)
    ? sanitizeError(connectError, "wallet")
    : null;
  const wallet = useMemo<WalletState>(() => ({
    address: walletAddress,
    chainId: walletAddress && isConnected ? chainId : null,
    connected: Boolean(walletAddress && isConnected),
    providerAvailable: connectors.length > 0,
    provider: selectedProvider,
    connectorName: connector?.name ?? null,
    error: providerError ?? connectErrorMessage,
  }), [chainId, connectErrorMessage, connector, connectors.length, isConnected, providerError, selectedProvider, walletAddress, walletKey]);

  const visibleSnapshot = useMemo(() => {
    if (!snapshot || snapshotWalletAddress === walletAddress || snapshot.walletCredit === null) return snapshot;
    return { ...snapshot, walletCredit: null };
  }, [snapshot, snapshotWalletAddress, walletAddress]);

  const value = useMemo<DissentContextValue>(() => ({
    snapshot: visibleSnapshot,
    dataError,
    loading,
    health: !configState.ok ? "misconfigured" : loading ? "loading" : dataError ? "unavailable" : "healthy",
    refresh,
    retry,
    canRetry: !loading && (retryAvailableAt === null || retryClock >= retryAvailableAt),
    retryAvailableAt,
    wallet,
    disconnect,
    switchNetwork,
  }), [dataError, disconnect, loading, refresh, retry, retryAvailableAt, retryClock, switchNetwork, visibleSnapshot, wallet]);

  return <DissentContext.Provider value={value}>{children}</DissentContext.Provider>;
}

export function useDissent(): DissentContextValue {
  const value = useContext(DissentContext);
  if (!value) throw new Error("useDissent must be used within DissentProvider.");
  return value;
}
