"use client";

import Link from "next/link";
import { ArrowUpRight, FileSearch, Search } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { formatTimestamp, formatWei } from "@/lib/dissent/types";
import type { ProposalStatus } from "@/lib/dissent/types";
import { useDissent } from "./DissentProvider";
import { StatusBadge } from "./StatusBadge";

const filters: Array<"ALL" | ProposalStatus> = ["ALL", "OPEN", "CLEAR", "REVISE", "BLOCK", "CANCELLED", "EXECUTED"];

export function ReviewsPage() {
  const { snapshot, loading, dataError, retry, canRetry, retryAvailableAt } = useDissent();
  const [activeFilter, setActiveFilter] = useState<(typeof filters)[number]>("ALL");
  const [query, setQuery] = useState("");
  const proposals = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (snapshot?.proposals ?? []).filter((proposal) =>
      (activeFilter === "ALL" || proposal.status === activeFilter) &&
      (!normalized || (proposal.id + " " + proposal.action + " " + proposal.objective).toLowerCase().includes(normalized)),
    );
  }, [activeFilter, query, snapshot?.proposals]);

  return <div className="page-wrap reviews-page">
    <section className="page-intro" data-tour="reviews"><div><p className="eyebrow">Public market</p><h1>Live reviews</h1><p className="intro-copy">A contract-derived list of decisions, objections and verdicts. Read the record before you act.</p></div><Link className="button button-red" href="/reviews/new">Start a Review <ArrowUpRight size={16} /></Link></section>
    <section className="review-market" aria-label="Review market">
      <div className="market-heading"><div><p className="eyebrow">Ordered index</p><h2>Every proposal, in creation order.</h2></div><span className="market-count">{snapshot ? snapshot.proposalCount.toString() + " indexed" : "Reading index"}</span></div>
      {snapshot?.proposals.length !== 0 && <div className="reviews-toolbar">
        <label className="search-field"><Search size={17} aria-hidden="true" /><span className="sr-only">Search reviews</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search action, objective or ID" /></label>
        <div className="filter-group" aria-label="Filter reviews by status">{filters.map((filter) => <button className={activeFilter === filter ? "filter-button active" : "filter-button"} type="button" key={filter} onClick={() => setActiveFilter(filter)}>{filter === "ALL" ? "All" : filter}</button>)}</div>
      </div>}
      {loading && !snapshot && <div className="loading-table" aria-label="Loading reviews"><div className="loading-line" /><div className="loading-line" /><div className="loading-line" /></div>}
      {!loading && dataError && !snapshot && <EmptyState title="Reviews are unavailable" body="The public review index could not be read. Try again after the cooldown." action={<RetryButton retry={retry} canRetry={canRetry} retryAvailableAt={retryAvailableAt} />} />}
      {!loading && snapshot && proposals.length === 0 && (snapshot.proposals.length === 0 ? <div className="empty-market"><div className="empty-market-mark" aria-hidden="true">01</div><p className="eyebrow">The market starts with one decision</p><h2>Start the first review.</h2><p>Put an action, its evidence and its funding on record. A challenger can then stake a specific objection before the deadline.</p><Link className="button button-red" href="/reviews/new">Start the first review <ArrowUpRight size={16} /></Link><ol aria-label="Review sequence"><li>Commit</li><li>Challenge</li><li>Verdict</li></ol></div> : <EmptyState title="No matching reviews" body="Try another status or search term." />)}
      {snapshot && dataError && <div className="market-refresh-note" role="status"><span>Showing the last successful index.</span><RetryButton retry={retry} canRetry={canRetry} retryAvailableAt={retryAvailableAt} /></div>}
      {snapshot && proposals.length > 0 && <div className="review-table-wrap"><table className="review-table"><thead><tr><th scope="col">Review</th><th scope="col">State</th><th scope="col">Bounty</th><th scope="col">Objections</th><th scope="col">Deadline / resolution</th><th scope="col"><span className="sr-only">Open</span></th></tr></thead><tbody>{proposals.map((proposal) => <tr key={proposal.id}><td><Link className="review-title-link" href={"/reviews/" + encodeURIComponent(proposal.id)}><strong>{proposal.action}</strong><span className="mono">{proposal.id}</span><small>{proposal.objective}</small>{proposal.parentProposalId && <small className="lineage-inline">Revision {proposal.revisionNumber.toString()} · parent linked</small>}</Link></td><td data-tour="review-state"><StatusBadge status={proposal.status} /></td><td><span className="table-value">{formatWei(proposal.initialBounty)}</span><small className="table-label">initial bounty</small></td><td><span className="table-value">{proposal.challengeCount.toString()}</span><small className="table-label">{proposal.challengeCount === 1n ? "objection" : "objections"}</small></td><td><span className="table-value">{formatTimestamp(proposal.resolvedAt > 0n ? proposal.resolvedAt : proposal.challengeDeadline)}</span><small className="table-label">{proposal.resolvedAt > 0n ? "resolved" : "challenge deadline"}</small></td><td><Link className="row-arrow" href={"/reviews/" + encodeURIComponent(proposal.id)} aria-label={"Open review " + proposal.id}><ArrowUpRight size={17} /></Link></td></tr>)}</tbody></table></div>}
      {snapshot && proposals.length > 0 && <p className="review-count">Showing {proposals.length} of {snapshot.proposalCount.toString()} indexed reviews</p>}
    </section>
  </div>;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return <div className="empty-state"><FileSearch size={22} aria-hidden="true" /><h2>{title}</h2><p>{body}</p>{action}</div>;
}


function RetryButton({ retry, canRetry, retryAvailableAt }: { retry: () => void; canRetry: boolean; retryAvailableAt: number | null }) {
  const seconds = retryAvailableAt && !canRetry ? Math.max(1, Math.ceil((retryAvailableAt - Date.now()) / 1000)) : 0;
  return <button className="button button-quiet retry-button" type="button" onClick={retry} disabled={!canRetry}>{canRetry ? "Retry" : "Retry in " + seconds + "s"}</button>;
}
