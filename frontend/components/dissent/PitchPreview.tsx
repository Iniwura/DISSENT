"use client";

import Image from "next/image";
import { ExternalLink, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { VERIFIED_X_POST_AUTHOR, VERIFIED_X_POST_URL } from "@/lib/dissent/config";


export function PitchPreview() {
  const [open, setOpen] = useState(false);
  const [depth, setDepth] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const wasOpenRef = useRef(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) {
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        triggerRef.current?.focus({ preventScroll: true });
      }
      return;
    }

    wasOpenRef.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [close, open]);

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setDepth({
      x: Math.max(-8, Math.min(8, ((event.clientX - rect.left) / rect.width - 0.5) * 12)),
      y: Math.max(-6, Math.min(6, ((event.clientY - rect.top) / rect.height - 0.5) * 8)),
    });
  }

  return <>
    <button
      ref={triggerRef}
      className="pitch-visual"
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label="View the original Dissent pitch"
      style={{ "--pitch-x": `${depth.x}px`, "--pitch-y": `${depth.y}px` } as CSSProperties}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setDepth({ x: 0, y: 0 })}
      onClick={() => setOpen(true)}
    >
      <Image src="/assets/dissent-emergency-brake.png" alt="Dissent emergency-brake pitch graphic" width={1672} height={941} priority sizes="(max-width: 760px) 100vw, 68vw" />
      <span className="pitch-visual-overlay"><span>View the original pitch</span><ExternalLink size={16} aria-hidden="true" /></span>
    </button>

    {open && <div className="pitch-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <aside ref={dialogRef} className="pitch-modal" role="dialog" aria-modal="true" aria-labelledby="pitch-modal-title">
        <div className="pitch-modal-heading"><p className="eyebrow">Source preview</p><button ref={closeRef} className="icon-button" type="button" onClick={close} aria-label="Close original pitch preview"><X size={18} /></button></div>
        <h2 id="pitch-modal-title">The original pitch</h2>
        <Image src="/assets/dissent-emergency-brake.png" alt="Dissent emergency-brake pitch graphic" width={1672} height={941} sizes="(max-width: 720px) 100vw, 420px" />
        <div className="pitch-post-meta"><p className="pitch-post-author">{VERIFIED_X_POST_AUTHOR}</p><a className="button button-red" href={VERIFIED_X_POST_URL} target="_blank" rel="noopener noreferrer">Open original on X <ExternalLink size={15} /></a></div>
      </aside>
    </div>}
  </>;
}
