"use client";

import { Bell, Check, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useDissent } from "@/components/dissent/DissentProvider";
import type { DissentNotification } from "@/lib/dissent/notifications";

function formatNotificationTime(timestamp: number): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
}

function NotificationItem({ item, onRead, onClose }: { item: DissentNotification; onRead: (id: string) => void; onClose: () => void }) {
  return <li className={item.read ? "dv2-inbox-item" : "dv2-inbox-item is-unread"}>
    <Link href={`/reviews/${encodeURIComponent(item.proposalId)}`} onClick={() => { onRead(item.id); onClose(); }}>
      <span className="dv2-inbox-item-rule" aria-hidden="true" />
      <span className="dv2-inbox-item-copy"><strong>{item.title}</strong><span>{item.message}</span><time dateTime={new Date(item.createdAt).toISOString()}>{formatNotificationTime(item.createdAt)}</time></span>
      {!item.read && <span className="dv2-inbox-unread" aria-label="Unread" />}
    </Link>
  </li>;
}

export function NotificationsPanel() {
  const { wallet, notifications, markNotificationRead, markAllNotificationsRead } = useDissent();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const unreadCount = notifications.reduce((count, item) => count + (item.read ? 0 : 1), 0);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return <div className="dv2-inbox">
    <button ref={triggerRef} className="dv2-inbox-trigger" type="button" aria-expanded={open} aria-controls="dissent-notifications-panel" onClick={() => setOpen((value) => !value)}>
      <Bell size={15} aria-hidden="true" /><span>Notifications</span>{unreadCount > 0 && <b aria-label={`${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`}>{unreadCount > 99 ? "99+" : unreadCount}</b>}
    </button>
    {open && <section ref={panelRef} id="dissent-notifications-panel" className="dv2-inbox-panel" role="dialog" aria-labelledby="dissent-notifications-title" tabIndex={-1}>
      <div className="dv2-inbox-head"><div><span className="dv2-label">Account activity</span><h2 id="dissent-notifications-title">Notifications</h2></div><button className="dv2-inbox-close" type="button" onClick={() => { setOpen(false); triggerRef.current?.focus(); }} aria-label="Close notifications"><X size={16} /></button></div>
      {wallet.address ? <>
        <div className="dv2-inbox-actions"><span>{unreadCount ? `${unreadCount} unread` : "All caught up"}</span><button type="button" onClick={markAllNotificationsRead} disabled={!unreadCount}><Check size={13} />Mark all read</button></div>
        {notifications.length ? <ul className="dv2-inbox-list">{notifications.map((item) => <NotificationItem key={item.id} item={item} onRead={markNotificationRead} onClose={() => setOpen(false)} />)}</ul> : <p className="dv2-inbox-empty">No account activity has been recorded yet.</p>}
      </> : <p className="dv2-inbox-empty">Connect a wallet to see notifications for its reviews and challenges.</p>}
    </section>}
  </div>;
}
