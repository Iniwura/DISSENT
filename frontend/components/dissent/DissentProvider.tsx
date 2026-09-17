"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { configState } from "@/lib/dissent/config";
import { invalidateReadCache, loadLandingSnapshot, loadMarketSnapshot, loadTargetedProposal, loadWalletChallenges, rateLimitCooldownUntil, type ReadHealth, type WalletChallengeLoad } from "@/lib/dissent/data";
import type { MarketSnapshot, ProposalDetail } from "@/lib/dissent/types";
import {
  emptyNotificationStore,
  loadNotificationStore,
  markAllNotificationsRead,
  markNotificationRead,
  notificationScopeKey,
  observeProposalDetail,
  observeSnapshot,
  observeWalletChallenges,
  persistNotificationStore,
  type DissentNotification,
  type NotificationStore,
} from "@/lib/dissent/notifications";
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
  refreshProposal: (proposalId: string) => Promise<boolean>;
  retry: () => void;
  canRetry: boolean;
  retryAvailableAt: number | null;
  wallet: WalletState;
  walletChallenges: WalletChallengeLoad | null;
  walletChallengesLoading: boolean;
  notifications: DissentNotification[];
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  recordProposalDetail: (detail: ProposalDetail) => void;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
};

type ProviderCapableConnector = {
  getProvider: (parameters?: { chainId?: number }) => Promise<unknown>;
};

function hasProviderGetter(value: unknown): value is ProviderCapableConnector {
  return typeof value === "object" && value !== null && "getProvider" in value && typeof value.getProvider === "function";
}

const MARKET_REFRESH_STALE_MS = 30_000;
const MARKET_REFRESH_INTERVAL_MS = 30_000;

function mergeWalletChallengeLoad(previous: WalletChallengeLoad | null, next: WalletChallengeLoad): WalletChallengeLoad {
  if (next.complete || !previous) return next;
  const failed = new Set(next.failedProposalIds);
  const seen = new Set(next.challenges.map((challenge) => challenge.id));
  return {
    ...next,
    challenges: [
      ...next.challenges,
      ...previous.challenges.filter((challenge) => failed.has(challenge.proposalId) && !seen.has(challenge.id)),
    ],
  };
}

const DissentContext = createContext<DissentContextValue | null>(null);

export function DissentProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
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
  const [notificationStore, setNotificationStore] = useState<NotificationStore>(emptyNotificationStore);
  const [walletChallenges, setWalletChallenges] = useState<WalletChallengeLoad | null>(null);
  const [walletChallengesLoading, setWalletChallengesLoading] = useState(false);
  const loadingRef = useRef(loading);
  const refreshQueuedRef = useRef(false);
  const retryCooldownRef = useRef(0);
  const lastSuccessfulRefreshRef = useRef(0);
  const lastRefreshRequestedRef = useRef(0);
  const previousWalletKeyRef = useRef<string | null>(null);
  const targetedRefreshesRef = useRef(new Map<string, Promise<boolean>>());
  const notificationStoreRef = useRef<NotificationStore>(emptyNotificationStore());
  const notificationScopeRef = useRef<string | null>(null);
  const notificationReadyRef = useRef(false);
  const walletChallengeLoadRef = useRef(0);
  const walletChallengesRef = useRef<WalletChallengeLoad | null>(null);
  const walletChallengeScopeRef = useRef<string | null>(null);

  const walletAddress = address ? normalizeWalletAddress(address) : null;
  const walletAddressRef = useRef(walletAddress);
  const walletKey = walletAddress && connector
    ? walletAddress + ":" + connector.id + ":" + (chainId ?? "unknown")
    : null;
  const notificationKey = notificationScopeKey(
    walletAddress,
    walletAddress && isConnected ? chainId : null,
    configState.ok ? configState.value.contractAddress : null,
  );
  const walletChallengeScope = walletAddress && isConnected
    ? "" + walletAddress.toLowerCase() + ":" + (chainId ?? "unknown") + ":" + (configState.ok ? configState.value.contractAddress.toLowerCase() : "unknown")
    : null;

  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { walletAddressRef.current = walletAddress; }, [walletAddress]);
  useEffect(() => {
    notificationScopeRef.current = notificationKey;
    notificationReadyRef.current = false;
    const next = notificationKey ? loadNotificationStore(notificationKey) : emptyNotificationStore();
    notificationStoreRef.current = next;
    setNotificationStore(next);
    notificationReadyRef.current = true;
  }, [notificationKey]);

  useEffect(() => {
    if (walletChallengeScopeRef.current === walletChallengeScope) return;
    walletChallengeScopeRef.current = walletChallengeScope;
    walletChallengeLoadRef.current += 1;
    walletChallengesRef.current = null;
    setWalletChallenges(null);
    setWalletChallengesLoading(false);
  }, [walletChallengeScope]);

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
    loadingRef.current = true;
    setRefreshToken((value) => value + 1);
  }, []);

  const retry = useCallback(() => refresh(), [refresh]);

  const refreshProposal = useCallback((proposalId: string): Promise<boolean> => {
    const canonicalProposalId = proposalId.trim();
    if (!canonicalProposalId) return Promise.resolve(false);
    const existing = targetedRefreshesRef.current.get(canonicalProposalId);
    if (existing) return existing;
    const requestedWalletAddress = walletAddress;
    const startedAt = Date.now();
    const request = loadTargetedProposal(canonicalProposalId, requestedWalletAddress, "critical")
      .then((update) => {
        if (walletAddressRef.current !== requestedWalletAddress) return false;
        setSnapshot((current) => {
          if (!current) return current;
          const proposalsById = new Map(current.proposals.map((proposal) => [proposal.id, proposal]));
          proposalsById.set(update.proposal.id, update.proposal);
          const nextIds = update.proposalIdsOffset === 0
            ? update.proposalIds
            : [...current.proposalIds.slice(0, update.proposalIdsOffset), ...update.proposalIds];
          if (!nextIds.includes(update.proposal.id)) nextIds.push(update.proposal.id);
          const uniqueIds = [...new Set(nextIds)];
          return {
            ...current,
            proposalCount: update.proposalCount,
            proposalIds: uniqueIds,
            proposals: uniqueIds.flatMap((id) => {
              const proposal = proposalsById.get(id);
              return proposal ? [proposal] : [];
            }),
            accounting: update.accounting,
            walletCredit: requestedWalletAddress ? update.walletCredit : current.walletCredit,
          };
        });
        lastSuccessfulRefreshRef.current = Date.now();
        setDataError(null);
        return true;
      })
      .catch((error: unknown) => {
        if (walletAddressRef.current === requestedWalletAddress && startedAt >= lastSuccessfulRefreshRef.current) {
          if (isRateLimitError(error)) {
            const until = Math.max(Date.now(), rateLimitCooldownUntil());
            retryCooldownRef.current = until;
            setRetryAvailableAt(until);
          }
          setDataError(sanitizeError(error, "read"));
        }
        return false;
      })
      .finally(() => {
        if (targetedRefreshesRef.current.get(canonicalProposalId) === request) targetedRefreshesRef.current.delete(canonicalProposalId);
      });
    targetedRefreshesRef.current.set(canonicalProposalId, request);
    return request;
  }, [walletAddress]);
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
    const startedAt = Date.now();
    setLoading(true);
    (pathname === "/" ? loadLandingSnapshot(walletAddress) : loadMarketSnapshot(walletAddress))
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
        if (!cancelled && startedAt >= lastSuccessfulRefreshRef.current) {
          const message = sanitizeError(error, "read");
          if (isRateLimitError(error)) {
            const until = Math.max(Date.now(), rateLimitCooldownUntil());
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
  }, [pathname, refreshToken, walletAddress]);

  useEffect(() => {
    const requestedWalletAddress = walletAddress;
    const shouldLoadWalletChallenges = pathname === "/reviews" || pathname === "/profile" || pathname === "/balance" || pathname === "/credits";
    const proposalIds = snapshot?.proposalIds;
    const loadId = ++walletChallengeLoadRef.current;
    if (!requestedWalletAddress || !isConnected || !shouldLoadWalletChallenges || !proposalIds) {
      walletChallengesRef.current = null;
      setWalletChallenges(null);
      setWalletChallengesLoading(false);
      return;
    }
    let active = true;
    setWalletChallengesLoading(true);
    void loadWalletChallenges(requestedWalletAddress, proposalIds, "interactive")
      .then((result) => {
        if (!active || loadId !== walletChallengeLoadRef.current || walletAddressRef.current !== requestedWalletAddress) return;
        const merged = mergeWalletChallengeLoad(walletChallengesRef.current, result);
        walletChallengesRef.current = merged;
        setWalletChallenges(merged);
      })
      .catch(() => {
        // Keep the last successful challenge records during a transient read failure.
      })
      .finally(() => {
        if (active && loadId === walletChallengeLoadRef.current) setWalletChallengesLoading(false);
      });
    return () => { active = false; };
  }, [isConnected, pathname, snapshot, walletAddress]);

  useEffect(() => {
    if (!walletChallenges || !walletAddress || !notificationKey || !notificationReadyRef.current) return;
    const next = observeWalletChallenges(notificationStoreRef.current, walletChallenges.challenges, walletAddress);
    if (next === notificationStoreRef.current) return;
    notificationStoreRef.current = next;
    setNotificationStore(next);
    persistNotificationStore(notificationKey, next);
  }, [notificationKey, walletAddress, walletChallenges]);

  useEffect(() => {
    if (!snapshot || !walletAddress || !notificationKey || !notificationReadyRef.current) return;
    const next = observeSnapshot(notificationStoreRef.current, snapshot, walletAddress);
    notificationStoreRef.current = next;
    setNotificationStore(next);
    persistNotificationStore(notificationKey, next);
  }, [notificationKey, snapshot, walletAddress]);

  const updateNotificationStore = useCallback((update: (current: NotificationStore) => NotificationStore) => {
    const scope = notificationScopeRef.current;
    if (!scope || !notificationReadyRef.current) return;
    const next = update(notificationStoreRef.current);
    if (next === notificationStoreRef.current) return;
    notificationStoreRef.current = next;
    setNotificationStore(next);
    persistNotificationStore(scope, next);
  }, []);

  const recordProposalDetail = useCallback((detail: ProposalDetail) => {
    const account = walletAddressRef.current;
    if (!account) return;
    updateNotificationStore((current) => observeProposalDetail(current, detail, account));
  }, [updateNotificationStore]);

  const markRead = useCallback((id: string) => {
    updateNotificationStore((current) => markNotificationRead(current, id));
  }, [updateNotificationStore]);

  const markAllRead = useCallback(() => {
    updateNotificationStore(markAllNotificationsRead);
  }, [updateNotificationStore]);

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
      if (lastSuccessfulRefreshRef.current !== 0 && Date.now() - lastSuccessfulRefreshRef.current >= MARKET_REFRESH_STALE_MS) refresh();
    };
    const schedulePoll = () => {
      clearPoll();
      if (document.visibilityState !== "visible") return;
      pollTimer = window.setTimeout(() => {
        pollTimer = null;
        refresh();
        schedulePoll();
      }, MARKET_REFRESH_INTERVAL_MS);
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
    refreshProposal,
    retry,
    canRetry: !loading && (retryAvailableAt === null || retryClock >= retryAvailableAt),
    retryAvailableAt,
    wallet,
    walletChallenges,
    walletChallengesLoading,
    notifications: notificationStore.notifications,
    markNotificationRead: markRead,
    markAllNotificationsRead: markAllRead,
    recordProposalDetail,
    disconnect,
    switchNetwork,
  }), [dataError, disconnect, loading, markAllRead, markRead, notificationStore.notifications, recordProposalDetail, refresh, refreshProposal, retry, retryAvailableAt, retryClock, switchNetwork, visibleSnapshot, wallet, walletChallenges, walletChallengesLoading]);

  return <DissentContext.Provider value={value}>{children}</DissentContext.Provider>;
}

export function useDissent(): DissentContextValue {
  const value = useContext(DissentContext);
  if (!value) throw new Error("useDissent must be used within DissentProvider.");
  return value;
}
