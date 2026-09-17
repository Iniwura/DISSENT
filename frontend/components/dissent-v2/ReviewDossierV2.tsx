"use client";

import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Check, Copy, ExternalLink, GitBranch, ShieldAlert, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDissent } from "@/components/dissent/DissentProvider";
import { loadProposalDetail } from "@/lib/dissent/data";
import { formatTimestamp, formatWei, safeEvidenceUrl, type Challenge, type Proposal, type ProposalDetail } from "@/lib/dissent/types";
import { STUDIO_NEXT_EXPLORER_URL } from "@/lib/dissent/network";
import { ProposalActionsV2 } from "./ReviewBuilderV2";
import { EditorialButton, EditorialLabel, GridFrame, SectionMarker } from "./Editorial";

export function ReviewDossierV2({ proposalId }: { proposalId: string }) {
  const { snapshot } = useDissent();
  const [detail, setDetail] = useState<ProposalDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [txHash, setTxHash] = useState<string | null>(null);
  const detailLoadedRef = useRef(false);
  const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  useEffect(() => { const value = new URLSearchParams(window.location.search).get("tx"); if (value && /^0x[0-9a-fA-F]+$/.test(value)) setTxHash(value); }, []);
  useEffect(() => { const updateNow = () => setNow(BigInt(Math.floor(Date.now() / 1000))); const timer = window.setInterval(updateNow, 1000); document.addEventListener('visibilitychange', updateNow); return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', updateNow); }; }, []);
  useEffect(() => {
    detailLoadedRef.current = false;
    setDetail(null);
    setError(null);
    setLoading(true);
  }, [proposalId]);
  useEffect(() => {
    let active = true;
    if (!detailLoadedRef.current) setLoading(true);
    loadProposalDetail(proposalId, snapshot?.proposals.find((item) => item.id === proposalId)).then((value) => {
      if (active) {
        detailLoadedRef.current = true;
        setDetail(value);
        setError(null);
      }
    }).catch(() => {
      if (!active) return;
      setError("Live review data is temporarily unavailable.");
      if (!detailLoadedRef.current) setDetail(null);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [proposalId, snapshot]);
  if (loading) return <div className="dv2-page"><GridFrame><div className="dv2-dossier-loading"><i /><i /><i /></div></GridFrame></div>;
  if (!detail) return <div className="dv2-page"><GridFrame><Link className="dv2-back" href="/reviews"><ArrowLeft size={15} /> Back to reviews</Link><div className="dv2-not-found"><SectionMarker number="404" label="Registry lookup" /><h1>{error === "Live review data is temporarily unavailable." ? "Review unavailable." : "Review not found."}</h1><p>{error ?? "No proposal with that ID is present in the deployed review registry."}</p><EditorialButton href="/reviews">Return to reviews</EditorialButton></div></GridFrame></div>;
  const { proposal, challenges } = detail;
  const deadlineLabel = proposal.status === "OPEN" ? now < proposal.challengeDeadline ? formatRemaining(proposal.challengeDeadline - now) + " remaining" : "Deadline reached" : "Review resolved";
  return <div className="dv2-page dv2-dossier-page"><GridFrame>{error && <p className="dv2-stale-note" role="status">{error}</p>}<Link className="dv2-back" href="/reviews"><ArrowLeft size={15} /> Back to reviews</Link><div className="dv2-dossier-head"><div><div className="dv2-head-meta"><SectionMarker number={proposal.revisionNumber > 0n ? "R" + proposal.revisionNumber.toString() : "001"} label="Review dossier" /><CopyValue value={proposal.id} label="proposal ID" /></div><EditorialLabel>{proposal.status} / {formatTimestamp(proposal.challengeDeadline)}</EditorialLabel><h1>{proposal.action}</h1><p>{proposal.objective}</p></div><div className="dv2-dossier-stamp"><span className={"dv2-status dv2-status-" + proposal.status.toLowerCase()}>{proposal.status}</span><small>{proposal.resolution || "Open review record"}</small></div></div><div className="dv2-dossier-layout"><main className="dv2-dossier-main"><EvidenceBlock proposal={proposal} /><section className="dv2-dossier-section"><SectionMarker number="01" label="Decision" /><h2>What is being reviewed?</h2><dl className="dv2-dossier-list"><Info label="Action" value={proposal.action} /><Info label="Objective" value={proposal.objective} /><Info label="Policy" value={proposal.policy} /><Info label="Proposer" value={proposal.proposer} mono copyLabel="proposer address" /><Info label="Execution recipient" value={proposal.executionRecipient} mono copyLabel="execution recipient" /></dl></section><section className="dv2-dossier-section"><div className="dv2-section-line"><div><SectionMarker number="02" label="Objections" /><h2>{challenges.length} challenge{challenges.length === 1 ? "" : "s"}</h2></div><Users size={19} /></div>{challenges.length ? <div className="dv2-challenge-list">{challenges.map((challenge) => <ChallengeBlock challenge={challenge} key={challenge.id} />)}</div> : <p className="dv2-muted">No objections are indexed for this proposal.</p>}</section><section className="dv2-dossier-section"><div className="dv2-section-line"><div><SectionMarker number="03" label="Deliberation" /><h2>Validator observations</h2></div><ShieldAlert size={19} /></div>{proposal.observationError ? <p className="dv2-form-error" role="alert"><ShieldAlert size={15} />{proposal.observationError}</p> : proposal.evidenceObservations?.length ? <div className="dv2-observation-list">{proposal.evidenceObservations.map((observation) => <div key={observation.id + "-" + observation.contentHash}><span className={"dv2-observation-dot is-" + observation.status} /><strong>{observation.id}</strong><span>{observation.status}</span><CopyValue value={observation.contentHash} label="observation hash" /></div>)}</div> : <p className="dv2-muted">No finalized observation payload is stored for this state.</p>}</section></main><aside className="dv2-dossier-rail"><div className="dv2-rail-sticky"><section className="dv2-rail-block"><EditorialLabel>Current state</EditorialLabel><strong className={"dv2-status dv2-status-" + proposal.status.toLowerCase()}>{proposal.status}</strong><p>{statusDescription(proposal.status)}</p></section>{txHash && <section className="dv2-rail-block"><EditorialLabel>Write record</EditorialLabel><a className="dv2-lineage-link" href={STUDIO_NEXT_EXPLORER_URL + "tx/" + txHash} target="_blank" rel="noopener noreferrer"><span>Transaction<strong>{txHash}</strong></span><ArrowUpRight size={14} /></a></section>}<ProposalActionsV2 detail={detail} /><section className="dv2-rail-block"><EditorialLabel>Escrow</EditorialLabel><strong className="dv2-rail-total">{formatWei(proposal.outstandingBounty + proposal.outstandingBond)}</strong><dl className="dv2-rail-list"><div><dt>Bounty</dt><dd>{formatWei(proposal.outstandingBounty)}</dd></div><div><dt>Execution bond</dt><dd>{formatWei(proposal.outstandingBond)}</dd></div></dl></section><section className="dv2-rail-block"><EditorialLabel>Timeline</EditorialLabel><Timeline label="Opened" value={formatTimestamp(proposal.openedAt)} /><Timeline label="Deadline" value={formatTimestamp(proposal.challengeDeadline)} /><Timeline label="Time remaining" value={deadlineLabel} /><Timeline label="Resolved" value={formatTimestamp(proposal.resolvedAt)} /><Timeline label="Executed" value={formatTimestamp(proposal.executedAt)} /></section><section className="dv2-rail-block"><EditorialLabel>Lineage</EditorialLabel>{proposal.parentProposalId ? <LineageLink label="Parent proposal" id={proposal.parentProposalId} /> : <p className="dv2-muted">Original in this lineage.</p>}{proposal.supersededBy && <LineageLink label="Superseded by" id={proposal.supersededBy} />}</section></div></aside></div></GridFrame></div>;
}

function EvidenceBlock({ proposal }: { proposal: Proposal }) { const url = safeEvidenceUrl(proposal.evidenceUrl); return <section className="dv2-evidence-block"><div><SectionMarker number="00" label="Primary evidence" /><ExternalLink size={18} /></div><h2>Source anchor</h2>{url ? <a href={url} target="_blank" rel="noopener noreferrer"><span className="dv2-mono">{compactUrl(url)}</span><ArrowUpRight size={15} /></a> : <span className="dv2-invalid">Unavailable or invalid source</span>}<p>External evidence may change between reviews; finalized observation hashes belong to the contract record.</p></section>; }
function compactUrl(value: string) { try { const url = new URL(value); return url.hostname + (url.pathname === "/" ? "" : url.pathname) + url.search; } catch { return value; } }
function Info({ label, value, mono = false, copyLabel }: { label: string; value: string; mono?: boolean; copyLabel?: string }) { return <div><dt>{label}</dt><dd className={mono ? "dv2-mono" : ""}>{value}{copyLabel && <CopyValue value={value} label={copyLabel} />}</dd></div>; }
function ChallengeBlock({ challenge }: { challenge: Challenge }) { return <article className="dv2-challenge"><div className="dv2-challenge-head"><CopyValue value={challenge.id} label="challenge ID" /><span className={"dv2-status dv2-status-" + challenge.status.toLowerCase()}>{challenge.status}</span></div><p>{challenge.objection}</p><div className="dv2-challenge-meta"><CopyValue value={challenge.challenger} label="challenger address" /><span>{formatWei(challenge.outstandingStake)} outstanding stake</span></div>{challenge.reasoning && <details><summary>Validator reasoning</summary><p>{challenge.reasoning}</p></details>}</article>; }
function Timeline({ label, value }: { label: string; value: string }) { return <div className="dv2-timeline"><span>{label}</span><strong>{value}</strong></div>; }
function LineageLink({ label, id }: { label: string; id: string }) { return <Link className="dv2-lineage-link" href={"/reviews/" + encodeURIComponent(id)}><span>{label}<strong>{id}</strong></span><GitBranch size={14} /></Link>; }
function CopyValue({ value, label }: { value: string; label: string }) { const [copied, setCopied] = useState(false); const copy = () => { const result = navigator.clipboard?.writeText(value); if (result) void result.then(() => setCopied(true)); }; return <button className="dv2-copy" type="button" onClick={copy} aria-label={copied ? label + " copied" : "Copy complete " + label} title={"Copy complete " + label}><span>{value.length > 20 ? value.slice(0, 10) + "  / " + value.slice(-8) : value}</span>{copied ? <Check size={12} /> : <Copy size={12} />}</button>; }
function statusDescription(status: string) { return { OPEN: "Awaiting a deadline or recovery path.", CLEAR: "The proposer may consume the execution gate.", REVISE: "The proposer may create one direct replacement.", BLOCK: "The proposal cannot proceed.", CANCELLED: "Escrow was recovered after prolonged liveness failure.", EXECUTED: "The clear gate has been consumed." }[status] ?? "Recorded contract state."; }
function formatRemaining(seconds: bigint) { const days = seconds / 86400n; const hours = (seconds % 86400n) / 3600n; const minutes = (seconds % 3600n) / 60n; if (days > 0n) return days + "d " + hours + "h"; if (hours > 0n) return hours + "h " + minutes + "m"; return minutes + "m"; }
