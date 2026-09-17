import type { MarketSnapshot, ProposalDetail } from "./types";

export const NOTIFICATION_STORAGE_VERSION = 1;
const MAX_STORED_NOTIFICATIONS = 200;

export type DissentNotificationKind =
  | "challenge-received"
  | "challenge-resolved"
  | "review-resolved"
  | "challenge-window-closed";

export type DissentNotification = {
  id: string;
  kind: DissentNotificationKind;
  title: string;
  message: string;
  proposalId: string;
  createdAt: number;
  read: boolean;
};

type ProposalObservation = {
  status: string;
  challengeCount: string;
  challengeDeadline: string;
  observedAt: number;
};

type ChallengeObservation = {
  proposalId: string;
  challenger: string;
  status: string;
};

export type NotificationStore = {
  version: number;
  initialized: boolean;
  proposals: Record<string, ProposalObservation>;
  challenges: Record<string, ChallengeObservation>;
  notifications: DissentNotification[];
};

export function emptyNotificationStore(): NotificationStore {
  return { version: NOTIFICATION_STORAGE_VERSION, initialized: false, proposals: {}, challenges: {}, notifications: [] };
}

export function notificationScopeKey(walletAddress: string | null, chainId: number | null, contractAddress: string | null): string | null {
  if (!walletAddress || !contractAddress) return null;
  return `dissent-notifications-v${NOTIFICATION_STORAGE_VERSION}:${walletAddress.toLowerCase()}:${chainId ?? "unknown"}:${contractAddress.toLowerCase()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readProposalObservations(value: unknown): Record<string, ProposalObservation> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([id, item]) => {
    if (!isRecord(item) || typeof item.status !== "string" || typeof item.challengeCount !== "string" ||
        typeof item.challengeDeadline !== "string" || typeof item.observedAt !== "number") return [];
    return [[id, {
      status: item.status,
      challengeCount: item.challengeCount,
      challengeDeadline: item.challengeDeadline,
      observedAt: item.observedAt,
    }]];
  }));
}

function readChallengeObservations(value: unknown): Record<string, ChallengeObservation> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([id, item]) => {
    if (!isRecord(item) || typeof item.proposalId !== "string" || typeof item.challenger !== "string" || typeof item.status !== "string") return [];
    return [[id, { proposalId: item.proposalId, challenger: item.challenger, status: item.status }]];
  }));
}

function readNotifications(value: unknown): DissentNotification[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.kind !== "string" ||
        typeof item.title !== "string" || typeof item.message !== "string" ||
        typeof item.proposalId !== "string" || typeof item.createdAt !== "number") return [];
    return [{
      id: item.id,
      kind: item.kind as DissentNotificationKind,
      title: item.title,
      message: item.message,
      proposalId: item.proposalId,
      createdAt: item.createdAt,
      read: item.read === true,
    }];
  }).slice(0, MAX_STORED_NOTIFICATIONS);
}

export function loadNotificationStore(scopeKey: string): NotificationStore {
  if (typeof window === "undefined") return emptyNotificationStore();
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(scopeKey) ?? "null");
    if (!isRecord(parsed) || parsed.version !== NOTIFICATION_STORAGE_VERSION) return emptyNotificationStore();
    return {
      version: NOTIFICATION_STORAGE_VERSION,
      initialized: parsed.initialized === true,
      proposals: readProposalObservations(parsed.proposals),
      challenges: readChallengeObservations(parsed.challenges),
      notifications: readNotifications(parsed.notifications),
    };
  } catch {
    return emptyNotificationStore();
  }
}

export function persistNotificationStore(scopeKey: string, store: NotificationStore): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(scopeKey, JSON.stringify(store));
  } catch {
    // Storage is optional; notifications remain available for this session.
  }
}

function statusName(value: string): string {
  return value.trim().toUpperCase();
}

function addressName(value: string): string {
  return value.trim().toLowerCase();
}

function addNotification(store: NotificationStore, notification: DissentNotification): NotificationStore {
  if (store.notifications.some((item) => item.id === notification.id)) return store;
  return { ...store, notifications: [notification, ...store.notifications].slice(0, MAX_STORED_NOTIFICATIONS) };
}

function notification(kind: DissentNotificationKind, id: string, title: string, message: string, proposalId: string, createdAt: number): DissentNotification {
  return { id, kind, title, message, proposalId, createdAt, read: false };
}

export function observeSnapshot(store: NotificationStore, snapshot: MarketSnapshot, walletAddress: string, now = Date.now()): NotificationStore {
  const currentAddress = addressName(walletAddress);
  let next = store;
  for (const proposal of snapshot.proposals) {
    const previous = store.proposals[proposal.id];
    const currentStatus = statusName(proposal.status);
    const currentCount = proposal.challengeCount.toString();
    const currentDeadline = proposal.challengeDeadline.toString();
    if (store.initialized && addressName(proposal.proposer) === currentAddress && previous) {
      if (BigInt(currentCount) > BigInt(previous.challengeCount)) {
        next = addNotification(next, notification(
          "challenge-received",
          `review:${proposal.id}:challenge:${currentCount}`,
          "Your review received a challenge",
          `A new challenge was recorded for ${proposal.id}.`,
          proposal.id,
          now,
        ));
      }
      if (previous.status !== currentStatus && ["CLEAR", "REVISE", "BLOCK"].includes(currentStatus)) {
        next = addNotification(next, notification(
          "review-resolved",
          `review:${proposal.id}:resolved:${currentStatus}:${proposal.resolvedAt.toString()}`,
          `Your review resolved ${currentStatus}`,
          `The contract recorded a ${currentStatus} verdict for ${proposal.id}.`,
          proposal.id,
          now,
        ));
      }
      const deadline = BigInt(currentDeadline);
      if (previous.status === "OPEN" && previous.challengeDeadline === currentDeadline &&
          BigInt(previous.challengeDeadline) > BigInt(Math.floor(previous.observedAt / 1000)) &&
          BigInt(Math.floor(now / 1000)) >= deadline) {
        next = addNotification(next, notification(
          "challenge-window-closed",
          `review:${proposal.id}:window-closed:${currentDeadline}`,
          "Your challenge window closed",
          `The challenge window for ${proposal.id} is closed. This is not a verdict.`,
          proposal.id,
          now,
        ));
      }
    }
    next = {
      ...next,
      proposals: {
        ...next.proposals,
        [proposal.id]: { status: currentStatus, challengeCount: currentCount, challengeDeadline: currentDeadline, observedAt: now },
      },
    };
  }
  return next.initialized ? next : { ...next, initialized: true };
}

export function observeProposalDetail(store: NotificationStore, detail: ProposalDetail, walletAddress: string, now = Date.now()): NotificationStore {
  const currentAddress = addressName(walletAddress);
  let next = store;
  for (const challenge of detail.challenges) {
    const currentStatus = statusName(challenge.status);
    const previous = store.challenges[challenge.id];
    if (store.initialized && previous && previous.status !== currentStatus &&
        addressName(challenge.challenger) === currentAddress && ["ACCEPTED", "REJECTED"].includes(currentStatus)) {
      next = addNotification(next, notification(
        "challenge-resolved",
        `challenge:${challenge.id}:resolved:${currentStatus}`,
        `Your challenge was ${currentStatus.toLowerCase()}`,
        `The contract recorded your challenge as ${currentStatus.toLowerCase()} for ${detail.proposal.id}.`,
        detail.proposal.id,
        now,
      ));
    }
    next = {
      ...next,
      challenges: {
        ...next.challenges,
        [challenge.id]: { proposalId: challenge.proposalId, challenger: challenge.challenger, status: currentStatus },
      },
    };
  }
  return next;
}

export function markNotificationRead(store: NotificationStore, id: string): NotificationStore {
  if (!store.notifications.some((item) => item.id === id && !item.read)) return store;
  return { ...store, notifications: store.notifications.map((item) => item.id === id ? { ...item, read: true } : item) };
}

export function markAllNotificationsRead(store: NotificationStore): NotificationStore {
  if (!store.notifications.some((item) => !item.read)) return store;
  return { ...store, notifications: store.notifications.map((item) => ({ ...item, read: true })) };
}
