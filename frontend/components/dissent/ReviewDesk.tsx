"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight, Check, CircleDollarSign, Clock3, ExternalLink,
  Fingerprint, LockKeyhole, OctagonX, Play, Radar, ShieldAlert,
} from "lucide-react";
import { challenges, demoCase, reviewEvents, type ReviewPhase } from "@/lib/dissent/demo-case";
import { DissentMark } from "./DissentMark";

const phaseLabels: Record<ReviewPhase, string> = {
  OPEN: "Challenge window open",
  INVESTIGATING: "Agents investigating",
  CONSENSUS: "Validators deliberating",
  BLOCK: "Execution blocked",
};

const amount = (value: number) => new Intl.NumberFormat("en-US").format(value);

function Signal({ label, value, red = false }: { label: string; value: string; red?: boolean }) {
  return <div className="signal"><span>{label}</span><strong className={red ? "red" : ""}>{value}</strong></div>;
}

function StatusRail({ phase }: { phase: ReviewPhase }) {
  const steps: ReviewPhase[] = ["OPEN", "INVESTIGATING", "CONSENSUS", "BLOCK"];
  const current = steps.indexOf(phase);
  return (
    <ol className="status-rail" aria-label="Review progress">
      {steps.map((step, index) => (
        <li className={index <= current ? "reached" : ""} key={step}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <b>{step === "BLOCK" ? "VERDICT" : step}</b>
        </li>
      ))}
    </ol>
  );
}

export function ReviewDesk() {
  const [phase, setPhase] = useState<ReviewPhase>("OPEN");
  const [eventCount, setEventCount] = useState(1);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  function schedule(delay: number, action: () => void) {
    timers.current.push(window.setTimeout(action, delay));
  }

  function runReview() {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setPhase("INVESTIGATING");
    setEventCount(2);
    schedule(850, () => setEventCount(3));
    schedule(1_700, () => setEventCount(4));
    schedule(2_550, () => setPhase("CONSENSUS"));
    schedule(3_100, () => setEventCount(5));
    schedule(3_700, () => setPhase("BLOCK"));
  }

  const resolved = phase === "BLOCK";
  const activeChallenges = phase === "OPEN" ? [] : challenges;

  return (
    <main className="desk-shell">
      <header className="topbar">
        <DissentMark />
        <div className="topbar-center"><span className="network-dot" />LOCAL PROTOCOL · GENLAYER READY</div>
        <button className="wallet-button" type="button">0x7A3F…91C2 <ArrowUpRight size={14} /></button>
      </header>

      <section className="case-strip">
        <div>
          <span className="eyebrow">ACTIVE REVIEW / {demoCase.id}</span>
          <h1>The action happens only if it survives dissent.</h1>
        </div>
        <div className={`phase-stamp phase-${phase.toLowerCase()}`}>
          {resolved ? <OctagonX size={20} /> : <Radar size={20} />}
          <span>{phaseLabels[phase]}</span>
        </div>
      </section>

      <StatusRail phase={phase} />

      <section className="metrics" aria-label="Case economics">
        <Signal label="TREASURY ACTION" value={`$${amount(demoCase.principal)}`} />
        <Signal label="ADVERTISED APY" value={demoCase.advertisedApy} red />
        <Signal label="EXECUTION BOND" value={`${amount(demoCase.bond)} GEN`} />
        <Signal label="REVIEW BOUNTY" value={`${amount(demoCase.bounty)} GEN`} />
        <Signal label="WINDOW" value={resolved ? "CLOSED" : demoCase.reviewWindow.toUpperCase()} red />
      </section>

      <div className="workspace-grid">
        <section className="primary-column">
          <article className="panel proposal-panel">
            <div className="panel-heading">
              <div><span className="section-code">01 / PROPOSAL</span><h2>{demoCase.action}</h2></div>
              <LockKeyhole size={24} />
            </div>
            <dl className="brief-grid">
              <div><dt>OBJECTIVE</dt><dd>{demoCase.objective}</dd></div>
              <div><dt>OPERATING POLICY</dt><dd>{demoCase.policy}</dd></div>
            </dl>
            <a className="evidence-link" href="https://example.com" target="_blank" rel="noreferrer">
              <Fingerprint size={16} /><span>PRIMARY EVIDENCE</span><b>{demoCase.evidenceUrl}</b><ExternalLink size={14} />
            </a>
          </article>

          <section className="challenges-section">
            <div className="section-title-row">
              <div><span className="section-code">02 / ADVERSARIAL REVIEW</span><h2>Independent challenges</h2></div>
              <span>{activeChallenges.length.toString().padStart(2, "0")} SUBMISSIONS</span>
            </div>
            {activeChallenges.length === 0 ? (
              <button className="empty-review" onClick={runReview} type="button">
                <span className="scan-icon"><Play size={20} fill="currentColor" /></span>
                <span><b>Run the treasury case</b><small>Launch two independent challenger agents</small></span>
                <kbd>LOCAL DEMO</kbd>
              </button>
            ) : (
              <div className="challenge-stack">
                {activeChallenges.map((challenge, index) => (
                  <article className={`challenge-card challenge-${challenge.outcome.toLowerCase()}`} key={challenge.id}>
                    <div className="challenge-index">0{index + 1}</div>
                    <div className="challenge-body">
                      <div className="agent-row">
                        <span className="agent-avatar">{challenge.agent.slice(0, 2).toUpperCase()}</span>
                        <div><h3>{challenge.agent}</h3><p>{challenge.specialty}</p></div>
                        <span className="stake"><CircleDollarSign size={14} /> {challenge.stake} GEN STAKED</span>
                      </div>
                      <p className="objection">{challenge.objection}</p>
                      <div className="challenge-footer">
                        <span><Fingerprint size={14} /> {challenge.evidence}</span>
                        {resolved ? (
                          <b className={`outcome outcome-${challenge.outcome.toLowerCase()}`}>
                            {challenge.outcome === "ACCEPTED" ? <Check size={14} /> : <OctagonX size={14} />}
                            {challenge.outcome} · {challenge.materiality}
                          </b>
                        ) : <b className="pending">UNDER REVIEW</b>}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>

        <aside className="side-column">
          <section className={`verdict-panel ${resolved ? "is-blocked" : ""}`}>
            <span className="section-code">03 / GENLAYER VERDICT</span>
            <div className="verdict-symbol">
              {resolved ? <OctagonX size={54} strokeWidth={1.25} /> : <ShieldAlert size={48} strokeWidth={1.25} />}
            </div>
            <h2>{resolved ? "BLOCK" : phase === "CONSENSUS" ? "DELIBERATING" : "PENDING"}</h2>
            <p>{resolved ? demoCase.verdictSummary : "The challenge window must close before validators independently resolve the evidence."}</p>
            <div className="consensus-line"><span>VALIDATOR CONSENSUS</span><b>{resolved ? "5 / 5" : "— / 5"}</b></div>
          </section>

          <section className="panel event-panel">
            <div className="section-title-row compact">
              <div><span className="section-code">LIVE TRACE</span><h2>Machine activity</h2></div><Clock3 size={17} />
            </div>
            <ol className="event-list">
              {reviewEvents.slice(0, eventCount).map((event, index) => (
                <li key={event.time}>
                  <span className="event-node">{index + 1}</span>
                  <div><b>{event.label}</b><small>{event.detail}</small></div>
                  <time>{event.time}</time>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>

      <footer className="desk-footer"><span>DISSENT PROTOCOL / PROOF OF MATERIAL RISK</span><span>BUILT FOR GENLAYER AGENT TANK</span></footer>
    </main>
  );
}
