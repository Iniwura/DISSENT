"use client";

import Link from "next/link";
import { ArrowUpRight, CircleAlert, LockKeyhole, Wallet } from "lucide-react";
import { useMemo } from "react";
import { useDissent } from "@/components/dissent/DissentProvider";
import { formatWei, type Challenge } from "@/lib/dissent/types";
import { EditorialLabel, GridFrame, SectionMarker } from "./Editorial";

const terminalStatuses = ["CLEAR", "REVISE", "BLOCK", "CANCELLED", "EXECUTED"] as const;
type ChallengeLoadState = {
  status: "idle" | "loading" | "complete" | "partial" | "error";
  records: Challenge[];
};

export function BalanceLedgerV2() {
  const { snapshot, wallet, loading, dataError, walletChallenges, walletChallengesLoading } = useDissent();
  const credit = snapshot?.walletCredit;
  const ownedReviews = useMemo(
    () => snapshot?.proposals.filter((proposal) => Boolean(wallet.address && proposal.proposer.toLowerCase() === wallet.address.toLowerCase())) ?? [],
    [snapshot?.proposals, wallet.address],
  );
  const outcomeCounts = useMemo(
    () => terminalStatuses.map((status) => ({ status, count: ownedReviews.filter((proposal) => proposal.status === status).length })).filter((item) => item.count > 0),
    [ownedReviews],
  );
  const challengeLoad: ChallengeLoadState = !wallet.connected
    ? { status: "idle", records: [] }
    : walletChallenges
      ? { status: walletChallenges.complete ? "complete" : "partial", records: walletChallenges.challenges }
      : walletChallengesLoading
        ? { status: "loading", records: [] }
        : { status: "error", records: [] };
  const challengeCount = challengeLoad.status === "complete"
    ? challengeLoad.records.length.toString()
    : challengeLoad.status === "loading"
      ? "Loading..."
      : "Unavailable";

  return (
    <div className="dv2-page dv2-balance-page">
      <GridFrame>
        <div className="dv2-page-intro">
          <SectionMarker number="04" label="Account profile" />
          <div>
            <EditorialLabel>Profile</EditorialLabel>
            <h1>Your record.</h1>
            <p>Wallet activity, settled credit and outcomes recorded by Dissent.</p>
          </div>
        </div>

        {!wallet.connected ? (
          <div className="dv2-disconnected">
            <Wallet size={20} />
            <h2>Connect when you want to inspect your profile.</h2>
            <p>Public reviews stay wallet-free. A connected wallet is required for account-specific credit and activity.</p>
          </div>
        ) : loading && !snapshot ? (
          <div className="dv2-loading" role="status" aria-label="Loading profile"><i /><i /><i /></div>
        ) : dataError && !snapshot ? (
          <div className="dv2-empty">
            <CircleAlert size={18} />
            <p>Account profile data is unavailable right now.</p>
          </div>
        ) : (
          <>
            <section className="dv2-balance-hero">
              <div>
                <EditorialLabel>Settled credit</EditorialLabel>
                <strong>{credit === null || credit === undefined ? "-" : formatWei(credit)}</strong>
                <span>Reusable inside Dissent. Not wallet cash. {wallet.address}</span>
              </div>
              <div className="dv2-balance-lock">
                <LockKeyhole size={20} />
                <span>Use it for supported proposals and challenges.<br />There is no cashout path in this RC.</span>
              </div>
            </section>

            <section className="dv2-profile-stats" aria-label="Wallet profile summary">
              <div className="dv2-profile-stat">
                <EditorialLabel>Connected wallet</EditorialLabel>
                <strong className="dv2-profile-address">{wallet.address}</strong>
                <small>Current account on Studio Next.</small>
              </div>
              <div className="dv2-profile-stat">
                <EditorialLabel>Reviews created</EditorialLabel>
                <strong>{ownedReviews.length}</strong>
                <small>From the current public proposal index.</small>
              </div>
              <div className="dv2-profile-stat">
                <EditorialLabel>Challenges submitted</EditorialLabel>
                <strong>{challengeCount}</strong>
                <small>{challengeLoad.status === "complete" ? "Filtered by this wallet's challenger address." : challengeLoad.status === "partial" ? "Some challenge reads failed; the count is not complete." : challengeLoad.status === "error" ? "Challenge records are temporarily unavailable." : "Loaded from the contract's challenge index."}</small>
              </div>
            </section>

            <section className="dv2-profile-challenges" aria-labelledby="dv2-profile-challenges-title">
              <div className="dv2-ledger-head">
                <EditorialLabel>Submitted challenges</EditorialLabel>
                <span id="dv2-profile-challenges-title">{challengeLoad.status === "complete" ? String(challengeLoad.records.length).padStart(2, "0") : "-"}</span>
              </div>
              {challengeLoad.status === "complete" && challengeLoad.records.length === 0 ? (
                <p className="dv2-profile-unavailable">No challenge records are associated with this wallet in the loaded proposal index.</p>
              ) : challengeLoad.records.length > 0 ? (
                challengeLoad.records.map((challenge) => (
                  <div className="dv2-profile-challenge" key={challenge.id}>
                    <div>
                      <EditorialLabel>{challenge.status}</EditorialLabel>
                      <p>{challenge.objection}</p>
                    </div>
                    <Link href={"/reviews/" + encodeURIComponent(challenge.proposalId)} aria-label={"Open review " + challenge.proposalId}>
                      Review <ArrowUpRight size={14} aria-hidden="true" />
                    </Link>
                  </div>
                ))
              ) : (
                <p className="dv2-profile-unavailable">{challengeLoad.status === "loading" ? "Loading challenge records..." : "Challenge records are unavailable; no count is shown."}</p>
              )}
              {challengeLoad.status === "partial" && challengeLoad.records.length > 0 && <p className="dv2-profile-unavailable">Some proposal challenge indexes could not be read. Showing confirmed records only.</p>}
            </section>

            <div className="dv2-ledger-layout">
              <section className="dv2-ledger">
                <div className="dv2-ledger-head"><EditorialLabel>Available outcomes</EditorialLabel><span>{String(outcomeCounts.length).padStart(2, "0")}</span></div>
                {outcomeCounts.length === 0 ? (
                  <div className="dv2-ledger-row is-muted"><span>-</span><strong>No recorded outcomes</strong><small>Your created reviews will appear here as the contract records them.</small></div>
                ) : outcomeCounts.map(({ status, count }, index) => (
                  <div className="dv2-ledger-row" key={status}><span>{String(index + 1).padStart(2, "0")}</span><strong>{status}</strong><small>{count} review{count === 1 ? "" : "s"} currently recorded with this outcome.</small></div>
                ))}
                <div className="dv2-ledger-row"><span>{String(outcomeCounts.length + 1).padStart(2, "0")}</span><strong>Reusable credit</strong><small>Settled credit can fund supported Dissent proposals and challenges.</small></div>
              </section>
              <aside className="dv2-credit-note">
                <EditorialLabel>Profile note</EditorialLabel>
                <p>Reviews created is derived from the loaded on-chain proposal index. Challenge submissions are filtered from each indexed challenge record and never inferred from proposal challenge counts.</p>
              </aside>
            </div>
          </>
        )}
      </GridFrame>
    </div>
  );
}
