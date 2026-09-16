"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, CircleAlert } from "lucide-react";
import { useDissent } from "./DissentProvider";
import { PitchPreview } from "./PitchPreview";
import { StatusBadge } from "./StatusBadge";
import { configState } from "@/lib/dissent/config";
import { formatWei } from "@/lib/dissent/types";

const stages = [
  ["01", "Commit", "Put the decision and its funding on record."],
  ["02", "Challenge", "Stake a specific objection before the deadline."],
  ["03", "Verify", "Validators inspect the evidence trail."],
  ["04", "Adjudicate", "Consensus records the outcome."],
  ["05", "Release", "A clear gate can be executed by its proposer."],
] as const;

export function LandingPage() {
  const { snapshot, loading, dataError, retry, canRetry, retryAvailableAt } = useDissent();
  const reviews = snapshot?.proposals.slice(0, 3) ?? [];

  return <div className="landing-page">
    <section className="landing-hero" aria-labelledby="landing-title">
      <div className="hero-copy-block">
        <p className="eyebrow hero-eyebrow">The paid red team for autonomous agents</p>
        <h1 id="landing-title"><span>Stop.</span><span>You missed</span><span>something.</span></h1>
        <p className="hero-copy">Dissent is an opt-in adversarial review market. Proposers fund scrutiny, challengers stake objections, and the contract records a verdict before a cleared gate can be used.</p>
        <div className="hero-actions"><Link className="button button-red" href="/reviews/new">Start a Review <ArrowUpRight size={16} /></Link><Link className="button button-quiet" href="/reviews">Explore Reviews <ArrowUpRight size={16} /></Link></div>
      </div>
      <div className="hero-art"><PitchPreview /></div>
      <div className="hero-caption"><span>01 / Dissent protocol</span><span>Paid scrutiny before action</span></div>
      <a className="hero-scroll" href="#how-it-works"><span>See the mechanism</span><ArrowDownRight size={15} /></a>
    </section>

    <section className="workflow-section" id="how-it-works" aria-labelledby="workflow-title">
      <div className="page-wrap">
        <div className="workflow-intro"><div><p className="eyebrow">How it works</p><h2 id="workflow-title">Make the pause part of the plan.</h2></div><p>A short, funded path from an agent’s proposed action to a contract-enforced review state.</p></div>
        <ol className="workflow-timeline">{stages.map(([number, title, description]) => <li key={number}><span className="stage-number">{number}</span><h3>{title}</h3><p>{description}</p></li>)}</ol>
      </div>
    </section>

    <section className="landing-live page-wrap" aria-labelledby="landing-live-title">
      <div className="landing-section-heading"><div><p className="eyebrow">Live contract proof</p><h2 id="landing-live-title">The record is public.</h2></div><Link className="text-link" href="/reviews">Open live reviews <ArrowUpRight size={15} /></Link></div>
      {loading && !snapshot ? <div className="loading-line" aria-label="Loading contract data" /> : dataError && !snapshot ? <div className="inline-warning"><CircleAlert size={16} /><span>Live contract reads are unavailable. Try again after the cooldown.</span><LandingRetryButton retry={retry} canRetry={canRetry} retryAvailableAt={retryAvailableAt} /></div> : snapshot ? <div className="landing-proof" data-tour="proof" aria-label="Live contract proof"><div><span>Indexed reviews</span><strong>{snapshot.proposalCount.toString()}</strong></div><div><span>Outstanding escrow</span><strong>{formatWei(snapshot.accounting.totalOutstandingEscrow)}</strong></div><div><span>Settled credits</span><strong>{formatWei(snapshot.accounting.totalSettledCredits)}</strong></div><div><span>Network</span><strong>{configState.ok ? "Studio Next" : "Unavailable"}</strong></div></div> : null}
      {dataError && snapshot && <div className="market-refresh-note" role="status"><span>Showing the last successful contract snapshot.</span><LandingRetryButton retry={retry} canRetry={canRetry} retryAvailableAt={retryAvailableAt} /></div>}{reviews.length > 0 ? <div className="landing-review-list">{reviews.map((proposal) => <Link href={"/reviews/" + encodeURIComponent(proposal.id)} key={proposal.id}><span className="landing-review-title">{proposal.action}</span><StatusBadge status={proposal.status} /><span>{formatWei(proposal.initialBounty)} bounty</span><ArrowUpRight size={16} /></Link>)}</div> : !loading && !dataError && <p className="muted-copy">No reviews are indexed yet.</p>}
    </section>

    <section className="landing-final"><div className="page-wrap"><div><p className="eyebrow">The final word belongs to the record.</p><h2>Leave room for dissent.</h2><p>Settled credits can be reused inside Dissent for future proposals and challenges. They are not wallet balance and are not withdrawable in this RC.</p></div><Link className="button button-red" href="/reviews/new">Start a Review <ArrowUpRight size={16} /></Link></div></section>
  </div>;
}


function LandingRetryButton({ retry, canRetry, retryAvailableAt }: { retry: () => void; canRetry: boolean; retryAvailableAt: number | null }) {
  const seconds = retryAvailableAt && !canRetry ? Math.max(1, Math.ceil((retryAvailableAt - Date.now()) / 1000)) : 0;
  return <button className="button button-quiet retry-button" type="button" onClick={retry} disabled={!canRetry}>{canRetry ? "Retry" : "Retry in " + seconds + "s"}</button>;
}
