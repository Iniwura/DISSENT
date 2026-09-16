"use client";

import { ArrowUpRight, CreditCard, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useDissent } from "./DissentProvider";
import { formatWei, shortAddress } from "@/lib/dissent/types";

export function CreditsPage() {
  const { snapshot, wallet } = useDissent();
  const connected = Boolean(wallet.address);
  const credit = snapshot?.walletCredit;

  return <div className="page-wrap balance-page">
    <section className="page-intro balance-intro" data-tour="balance"><div><p className="eyebrow">Internal ledger</p><h1>Dissent balance</h1><p className="intro-copy">Settled credits are reusable inside Dissent for future proposals, revisions and challenges.</p></div>{!connected && <Link className="text-link" href="/reviews">Read public reviews <ArrowUpRight size={15} /></Link>}</section>
    <section className="balance-overview" aria-label="Available Dissent credit"><div className="balance-overview-top"><div><p className="eyebrow">Available credit</p><span>{connected ? shortAddress(wallet.address ?? "") : "Wallet not connected"}</span></div><span className="balance-lock"><LockKeyhole size={14} /> Internal only</span></div><strong>{connected ? credit === null || credit === undefined ? "Loading…" : formatWei(credit) : "—"}</strong><p>Not wallet GEN. There is no cashout path in this RC.</p></section>
    <div className="balance-grid"><section className="balance-ledger"><div className="ledger-heading"><div><p className="eyebrow">Wallet-specific view</p><h2>Credit ledger</h2></div><CreditCard size={19} aria-hidden="true" /></div>{connected ? <><div className="ledger-row"><span>Settled credit</span><strong>{credit === null || credit === undefined ? "Loading…" : formatWei(credit)}</strong><small>{shortAddress(wallet.address ?? "")}</small></div><div className="ledger-empty"><span>History</span><p>The contract exposes the current balance, not a per-transaction event history. No entries are inferred here.</p></div></> : <div className="balance-connect"><CreditCard size={22} aria-hidden="true" /><h2>Connect to read your ledger.</h2><p>Public review data stays available without a wallet. Connecting is explicit and does not submit a transaction.</p></div>}</section><aside className="balance-explainer"><p className="eyebrow">Permitted uses</p><h2>Keep scrutiny moving.</h2><p>Use settled credit as part or all of the funding for:</p><div className="credit-rule"><span>01</span><strong>New proposals</strong></div><div className="credit-rule"><span>02</span><strong>Direct revisions</strong></div><div className="credit-rule"><span>03</span><strong>Challenge stakes</strong></div><p className="balance-warning">Credits are reusable inside Dissent, but not wallet-withdrawable.</p></aside></div>
  </div>;
}
