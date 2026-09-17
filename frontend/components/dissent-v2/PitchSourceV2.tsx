"use client";

import { createPortal } from "react-dom";
import { ArrowUpRight, Copy, ExternalLink, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { VERIFIED_X_POST_AUTHOR, VERIFIED_X_POST_URL } from "@/lib/dissent/config";

function getPostId(url: string): string | null {
  try {
    const match = new URL(url).pathname.match(/\/status\/(\d+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function PitchSourceV2() {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const postId = getPostId(VERIFIED_X_POST_URL);
  const embedUrl = postId ? `https://platform.twitter.com/embed/Tweet.html?id=${encodeURIComponent(postId)}&dnt=true` : null;

  useEffect(() => {
    if (!open) { triggerRef.current?.focus({ preventScroll: true }); return; }
    panelRef.current?.scrollTo({ top: 0, left: 0 });
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return <>
    <button ref={triggerRef} className="dv2-source-trigger" type="button" onClick={() => setOpen(true)}><span className="dv2-source-seal">X</span><span><b>Read the original source</b><small>{VERIFIED_X_POST_AUTHOR} / verified reference</small></span><ArrowUpRight size={16} /></button>
    {open && typeof document !== "undefined" ? createPortal(
      <div className="dv2-source-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
        <aside ref={panelRef} className="dv2-source-panel" role="dialog" aria-modal="true" aria-labelledby="dv2-source-title">
          <div className="dv2-source-panel-head"><span className="dv2-label">Source record / 001</span><button ref={closeRef} className="dv2-icon-button" type="button" onClick={() => setOpen(false)} aria-label="Close original source"><X size={20} /></button></div>
          <h2 id="dv2-source-title">The original<br />signal.</h2>
          {VERIFIED_X_POST_URL ? <a className="dv2-source-direct" href={VERIFIED_X_POST_URL} target="_blank" rel="noopener noreferrer">Open original on X <ExternalLink size={15} /></a> : <p className="dv2-source-note">Original post link unavailable.</p>}
          {embedUrl ? <div className="dv2-source-embed"><iframe title="Original Dissent source post" src={embedUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" /></div> : null}
          <p className="dv2-source-note">Dissent preserves a verified source link without inventing post text, date or engagement data.</p>
          {VERIFIED_X_POST_URL && <button className="dv2-source-copy" type="button" onClick={() => void navigator.clipboard?.writeText(VERIFIED_X_POST_URL)}><Copy size={14} /> Copy source URL</button>}
        </aside>
      </div>,
      document.body,
    ) : null}
  </>;
}
