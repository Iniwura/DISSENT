"use client";

import { ArrowUpRight, Copy, ExternalLink, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { VERIFIED_X_POST_AUTHOR, VERIFIED_X_POST_URL } from "@/lib/dissent/config";

export function PitchSourceV2() {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) { triggerRef.current?.focus({ preventScroll: true }); return; }
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return <>
    <button ref={triggerRef} className="dv2-source-trigger" type="button" onClick={() => setOpen(true)}><span className="dv2-source-seal">X</span><span><b>Read the original source</b><small>{VERIFIED_X_POST_AUTHOR} / verified reference</small></span><ArrowUpRight size={16} /></button>
    {open && <div className="dv2-source-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><aside className="dv2-source-panel" role="dialog" aria-modal="true" aria-labelledby="dv2-source-title"><div className="dv2-source-panel-head"><span className="dv2-label">Source record / 001</span><button ref={closeRef} className="dv2-icon-button" type="button" onClick={() => setOpen(false)} aria-label="Close original source"><X size={20} /></button></div><h2 id="dv2-source-title">The original<br />signal.</h2><p className="dv2-source-author">{VERIFIED_X_POST_AUTHOR}</p><div className="dv2-source-document"><span className="dv2-document-line dv2-document-line-wide" /><span className="dv2-document-line" /><span className="dv2-document-line dv2-document-line-short" /><span className="dv2-document-redact" /><span className="dv2-document-line" /><span className="dv2-document-line dv2-document-line-wide" /></div><p className="dv2-source-note">Dissent preserves a verified source link without inventing post text, date or engagement data.</p><a className="dv2-button dv2-button-red" href={VERIFIED_X_POST_URL} target="_blank" rel="noopener noreferrer">Open original on X <ExternalLink size={15} /></a><button className="dv2-source-copy" type="button" onClick={() => void navigator.clipboard?.writeText(VERIFIED_X_POST_URL)}><Copy size={14} /> Copy source URL</button></aside></div>}
  </>;
}
