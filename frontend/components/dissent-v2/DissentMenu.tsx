"use client";

import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";

export function DissentMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <div className="dv2-menu" role="dialog" aria-modal="true" aria-labelledby="dv2-menu-title">
    <div className="dv2-menu-inner">
      <div className="dv2-menu-head"><span className="dv2-menu-wordmark">DISSENT</span><button className="dv2-icon-button" type="button" onClick={onClose} aria-label="Close navigation"><X size={20} /></button></div>
      <div className="dv2-menu-grid">
        <div><p className="dv2-label">Navigation</p><h2 id="dv2-menu-title">Make room<br />for dissent.</h2></div>
        <nav aria-label="Menu navigation" className="dv2-menu-links">
          <Link href="/reviews" onClick={onClose}><span>01</span>Reviews<ArrowUpRight size={18} /></Link>
          <Link href="/reviews/new" onClick={onClose}><span>02</span>Start a Review<ArrowUpRight size={18} /></Link>
          <Link href="/balance" onClick={onClose}><span>03</span>Balance<ArrowUpRight size={18} /></Link>
        </nav>
      </div>
      <div className="dv2-menu-foot"><span>STUDIO NEXT / CHAIN 61997</span><span>PUBLIC READS / WALLET OPTIONAL</span></div>
    </div>
  </div>;
}
