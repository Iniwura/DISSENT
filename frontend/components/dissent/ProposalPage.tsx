"use client";

import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Check, Copy, ExternalLink, GitBranch, ShieldAlert, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { loadProposalDetail } from "@/lib/dissent/data";
import type { Challenge, Proposal, ProposalDetail } from "@/lib/dissent/types";
import { formatTimestamp, formatWei, safeEvidenceUrl, shortAddress } from "@/lib/dissent/types";
import { StatusBadge, statusDescription } from "./StatusBadge";
import { ProposalActions } from "./WriteForms";
import { useDissent } from "./DissentProvider";

export function ProposalPage({ proposalId }: { proposalId: string }) {
  const { snapshot, loading: marketLoading } = useDissent();
  const [detail, setDetail] = useState<ProposalDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (marketLoading && !snapshot) {
      setLoading(true);
      return () => { active = false; };
    }
    if (snapshot && !snapshot.proposalIds.includes(proposalId)) {
      setDetail(null);
      setError("Proposal ID is absent from the deployed review index.");
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    loadProposalDetail(proposalId)
      .then((value) => { if (active) { setDetail(value); setError(null); } })
      .catch((reason) => { if (active) { if (process.env.NODE_ENV !== "production") console.error("[dissent] proposal read failed", reason); setError("Proposal ID is absent from the deployed review index."); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [marketLoading, proposalId, snapshot]);

  if (loading) return <div className="page-wrap"><div className="detail-loading"><div className="loading-line" /><div className="loading-line" /><div className="loading-line" /></div></div>;
  if (error || !detail) return <div className="page-wrap"><Link className="back-link" href="/reviews"><ArrowLeft size={15} /> Back to live reviews</Link><ProposalEmptyState title="Review not found" body={"No proposal with ID " + proposalId + " is present in the deployed review index."} /></div>;

  const { proposal, challenges } = detail;
  return <div className="page-wrap detail-page">
    <Link className="back-link" href="/reviews"><ArrowLeft size={15} /> Back to live reviews</Link>
    <section className="detail-hero"><div><div className="eyebrow proposal-id-label"><span>Proposal</span><CopyValue value={proposal.id} label="proposal ID" /></div><h1>{proposal.action}</h1><p>{proposal.objective}</p></div></section>

    <div className="detail-grid evidence-workspace">
      <main className="detail-main evidence-main">
        <EvidenceCard proposal={proposal} />
        <section className="detail-card proposal-brief"><div className="card-heading"><div><p className="eyebrow">Decision</p><h2>What is being reviewed?</h2></div><ShieldAlert size={19} aria-hidden="true" /></div><dl className="detail-list"><InfoItem label="Action" value={proposal.action} /><InfoItem label="Objective" value={proposal.objective} /><InfoItem label="Policy" value={proposal.policy} /><InfoItem label="Proposer" value={proposal.proposer} mono copyLabel="proposer address" /><InfoItem label="Execution recipient" value={proposal.executionRecipient} mono copyLabel="execution recipient" /></dl></section>
        <section className="detail-card" data-tour="challenges"><div className="card-heading"><div><p className="eyebrow">Challenges</p><h2>{challenges.length} objection{challenges.length === 1 ? "" : "s"}</h2></div><Users size={19} aria-hidden="true" /></div>{challenges.length === 0 ? <p className="muted-copy">No objections have been indexed for this proposal.</p> : <div className="challenge-list">{challenges.map((challenge) => <ChallengeCard challenge={challenge} key={challenge.id} />)}</div>}</section>
        <section className="detail-card"><div className="card-heading"><div><p className="eyebrow">Validator observations</p><h2>Finalized evidence checks</h2></div><ShieldAlert size={19} aria-hidden="true" /></div>{proposal.observationError ? <div className="inline-warning"><ShieldAlert size={16} /> {proposal.observationError}</div> : proposal.evidenceObservations && proposal.evidenceObservations.length > 0 ? <div className="observation-list">{proposal.evidenceObservations.map((observation) => <div className="observation" key={`${observation.id}-${observation.contentHash}`}><span className={`observation-dot observation-${observation.status}`} /><div><strong>{observation.id}</strong><small>{observation.status}</small></div><CopyValue value={observation.contentHash} /></div>)}</div> : <p className="muted-copy">No finalized observation payload is stored for this state.</p>}</section>
      </main>
      <aside className="detail-side">
        <section className="detail-card state-card"><p className="eyebrow">Current state</p><div className="state-card-status"><StatusBadge status={proposal.status} /><strong>{statusDescription(proposal.status)}</strong></div></section>
        <div data-tour="review-actions"><ProposalActions detail={detail} /></div>
        <section className="detail-card money-card"><p className="eyebrow">Escrow</p><div className="money-total">{formatWei(proposal.outstandingBounty + proposal.outstandingBond)}</div><small>Outstanding on this proposal</small><div className="money-breakdown"><div><span>Bounty</span><strong>{formatWei(proposal.outstandingBounty)}</strong></div><div><span>Execution bond</span><strong>{formatWei(proposal.outstandingBond)}</strong></div></div></section>
        <section className="detail-card timeline-card"><p className="eyebrow">Timeline</p><Timeline label="Opened" value={formatTimestamp(proposal.openedAt)} /><Timeline label="Challenge deadline" value={formatTimestamp(proposal.challengeDeadline)} /><Timeline label="Resolved" value={formatTimestamp(proposal.resolvedAt)} /><Timeline label="Executed" value={formatTimestamp(proposal.executedAt)} /></section>
        <section className="detail-card lineage-card"><p className="eyebrow">Revision lineage</p>{proposal.parentProposalId ? <LineageLink label="Parent proposal" id={proposal.parentProposalId} /> : <p className="muted-copy">Original proposal in this lineage.</p>}{proposal.supersededBy && <LineageLink label="Superseded by" id={proposal.supersededBy} />}</section>
      </aside>
    </div>
  </div>;
}


function InfoItem({ label, value, mono = false, copyLabel }: { label: string; value: string; mono?: boolean; copyLabel?: string }) {
  return <div><dt>{label}</dt><dd className={mono ? "mono" : ""}><span className="identifier-value">{value}</span>{copyLabel && <CopyValue value={value} label={copyLabel} />}</dd></div>;
}

function EvidenceCard({ proposal }: { proposal: Proposal }) {
  const url = safeEvidenceUrl(proposal.evidenceUrl);
  return <section className="detail-card evidence-card" data-tour="evidence"><div className="card-heading"><div><p className="eyebrow">Primary evidence</p><h2>Source anchor</h2></div><ExternalLink size={19} aria-hidden="true" /></div>{url ? <a className="evidence-anchor" href={url} target="_blank" rel="noopener noreferrer"><span className="mono">{compactEvidenceUrl(proposal.evidenceUrl)}</span><ArrowUpRight size={15} /></a> : <div className="evidence-anchor invalid-evidence"><span className="mono">{proposal.evidenceUrl}</span><ShieldAlert size={15} /></div>}<p className="muted-copy">External evidence may change between reviews.</p></section>;
}

function ChallengeCard({ challenge }: { challenge: Challenge }) {
  return <article className="challenge-item"><div className="challenge-top"><CopyValue value={challenge.id} label="challenge ID" /><StatusBadge status={challenge.status || "OPEN"} /></div><p>{challenge.objection}</p><div className="challenge-meta"><CopyValue value={challenge.challenger} label="challenger address" /><span>{formatWei(challenge.outstandingStake)} outstanding stake</span></div>{challenge.reasoning && <details className="reasoning"><summary>Validator reasoning</summary><p>{challenge.reasoning}</p></details>}</article>;
}

function Timeline({ label, value }: { label: string; value: string }) {
  return <div className="timeline-row"><span>{label}</span><strong>{value}</strong></div>;
}

function LineageLink({ label, id }: { label: string; id: string }) {
  return <Link className="lineage-link" href={`/reviews/${encodeURIComponent(id)}`}><span>{label}<strong>{id}</strong></span><ArrowUpRight size={15} /></Link>;
}

function compactEvidenceUrl(value: string): string {
  try {
    const parsed = new URL(value);
    return `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}${parsed.search}`;
  } catch {
    return value;
  }
}

function CopyValue({ value, label = "identifier" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return <button className="hash-button" type="button" title={`Copy complete ${label}`} aria-label={copied ? `${label} copied` : `Copy complete ${label}`} onClick={() => void copy()}><span className="mono">{value.slice(0, 12)}…</span>{copied ? <Check size={13} /> : <Copy size={13} />}</button>;
}

function ProposalEmptyState({ title, body }: { title: string; body: string }) {
  return <section className="empty-state"><ShieldAlert size={24} aria-hidden="true" /><h3>{title}</h3><p>{body}</p></section>;
}
