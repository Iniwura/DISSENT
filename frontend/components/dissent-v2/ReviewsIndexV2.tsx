"use client";

import Link from "next/link";
import { ArrowUpRight, CircleAlert, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useDissent } from "@/components/dissent/DissentProvider";
import { formatTimestamp, formatWei } from "@/lib/dissent/types";
import { EditorialAction, EditorialButton, EditorialLabel, GridFrame, SectionMarker } from "./Editorial";

const filters = ["Open bounties", "Closing soon", "Challenged", "Awaiting verdict", "Resolved", "My activity"] as const;
type ReviewFilter = (typeof filters)[number];
const CLOSING_SOON_SECONDS = 24 * 60 * 60;

function remainingSeconds(deadline: bigint, now: number) {
  const remaining = deadline - BigInt(now);
  return remaining > 0n ? remaining : 0n;
}

function formatCountdown(deadline: bigint, now: number) {
  const remaining = remainingSeconds(deadline, now);
  if (remaining === 0n) return "Challenge window closed";
  const days = remaining / 86400n;
  const hours = (remaining % 86400n) / 3600n;
  const minutes = (remaining % 3600n) / 60n;
  const seconds = remaining % 60n;
  if (days > 0n) return `${days.toString()}d ${hours.toString().padStart(2, "0")}h remaining`;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")} remaining`;
}

export function ReviewsIndexV2() {
  const { snapshot, loading, dataError, retry, canRetry, wallet, walletChallenges } = useDissent();
  const [filter, setFilter] = useState<ReviewFilter>("Open bounties");
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const challengedProposalIds = useMemo(
    () => new Set((walletChallenges?.challenges ?? []).map((challenge) => challenge.proposalId)),
    [walletChallenges?.challenges],
  );

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const address = wallet.address?.toLowerCase();
    return (snapshot?.proposals ?? []).filter((proposal) => {
      const remaining = remainingSeconds(proposal.challengeDeadline, now);
      const matchesFilter =
        filter === "Open bounties"
          ? proposal.status === "OPEN" && remaining > 0n
          : filter === "Closing soon"
            ? proposal.status === "OPEN" && remaining > 0n && remaining <= BigInt(CLOSING_SOON_SECONDS)
            : filter === "Challenged"
              ? proposal.challengeCount > 0n
              : filter === "Awaiting verdict"
                ? proposal.status === "OPEN" && remaining === 0n
                : filter === "Resolved"
                  ? proposal.status !== "OPEN"
                  : Boolean(address && (proposal.proposer.toLowerCase() === address || challengedProposalIds.has(proposal.id)));
      const matchesQuery = !normalizedQuery || [proposal.id, proposal.action, proposal.objective].some((value) => value.toLowerCase().includes(normalizedQuery));
      return matchesFilter && matchesQuery;
    });
  }, [challengedProposalIds, filter, now, query, snapshot?.proposals, wallet.address]);

  const emptyTitle = filter === "My activity" && !wallet.address
    ? "Connect a wallet to view your activity."
    : snapshot?.proposals.length
      ? "No matching bounties."
      : "The marketplace is empty.";
  const emptyCopy = filter === "My activity" && !wallet.address
    ? "Public reviews remain available without a wallet. Connect only when you want wallet-specific activity."
    : snapshot?.proposals.length
      ? "Change the search or marketplace filter."
      : "The first funded review will appear here as a live bounty.";

  return (
    <div className="dv2-page dv2-registry-page">
      <GridFrame>
        <div className="dv2-page-intro">
          <SectionMarker number="01" label="Public registry" />
          <div>
            <EditorialLabel>Bounty marketplace</EditorialLabel>
            <h1>Reviews.</h1>
            <p>Inspect funded decisions, challenge open windows and follow contract-recorded verdicts.</p>
          </div>
          <EditorialButton href="/reviews/new">Start a Review</EditorialButton>
        </div>

        <div className="dv2-registry-tools">
          <label>
            <span className="dv2-label">Search the record</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Proposal ID, action or objective" />
          </label>
          <div className="dv2-filter-row" aria-label="Filter reviews">
            {filters.map((item) => (
              <button className={item === filter ? "is-selected" : ""} key={item} type="button" onClick={() => setFilter(item)}>
                {item}
              </button>
            ))}
          </div>
        </div>

        {loading && !snapshot ? (
          <div className="dv2-loading" role="status" aria-label="Loading live review market"><i /><i /><i /></div>
        ) : dataError && !snapshot ? (
          <div className="dv2-empty">
            <CircleAlert size={18} />
            <p>Live contract reads are unavailable. No local demo data is shown.</p>
            <EditorialAction onClick={retry} disabled={!canRetry}><RotateCcw size={14} />{canRetry ? "Retry" : "Retry unavailable"}</EditorialAction>
          </div>
        ) : rows.length === 0 ? (
          <div className="dv2-zero dv2-zero-wide">
            <span>000</span>
            <h2>{emptyTitle}</h2>
            <p>{emptyCopy}</p>
            {!snapshot?.proposals.length && <EditorialButton href="/reviews/new">Start a Review</EditorialButton>}
          </div>
        ) : (
          <div className="dv2-registry">
            <div className="dv2-registry-head">
              <span>Review / action</span>
              <span>Verdict</span>
              <span>Bounty</span>
              <span>Challenges</span>
              <span>Challenge window</span>
              <span />
            </div>
            {rows.map((proposal, index) => (
              <Link
                className="dv2-registry-row"
                href={"/reviews/" + encodeURIComponent(proposal.id)}
                key={proposal.id}
                aria-label={(proposal.status === "OPEN" && remainingSeconds(proposal.challengeDeadline, now) > 0n ? "Inspect and challenge" : "Inspect") + " review " + proposal.id}
              >
                <span className="dv2-registry-id">
                  <b>{String(index + 1).padStart(3, "0")}</b>
                  <strong>{proposal.action}</strong>
                  <small>{proposal.objective}</small>
                  <small>{proposal.id}{proposal.parentProposalId ? "   revision " + proposal.revisionNumber.toString() : ""}</small>
                </span>
                <span className={"dv2-status dv2-status-" + proposal.status.toLowerCase()}>{proposal.status}</span>
                <span className="dv2-tabular">{formatWei(proposal.initialBounty)}</span>
                <span className="dv2-tabular">{proposal.challengeCount.toString()}</span>
                <span className="dv2-deadline">
                  <strong>{proposal.status === "OPEN" ? formatCountdown(proposal.challengeDeadline, now) : proposal.status}</strong>
                  <small>{formatTimestamp(proposal.challengeDeadline)}</small>
                </span>
                <span className="dv2-market-cta">{proposal.status === "OPEN" && remainingSeconds(proposal.challengeDeadline, now) > 0n ? "Inspect & challenge" : "Inspect review"} <ArrowUpRight size={14} aria-hidden="true" /></span>
              </Link>
            ))}
          </div>
        )}

        {wallet.address && walletChallenges && !walletChallenges.complete && <p className="dv2-stale-note" role="status">Some wallet activity reads are unavailable; showing confirmed activity only.</p>}
        {dataError && snapshot && <p className="dv2-stale-note" role="status">Showing the last finalized snapshot while the latest read is unavailable.</p>}
      </GridFrame>
    </div>
  );
}
