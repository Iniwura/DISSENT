"use client";

import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import type { WriteProgress as WriteProgressState } from "@/lib/dissent/writes";

const phaseCopy: Record<WriteProgressState["phase"], string> = {
  idle: "Ready",
  checking: "Checking wallet and network",
  awaiting_signature: "Approve in your wallet",
  submitted: "Submitted / broadcast to Studio Next",
  awaiting_result: "Awaiting GenLayer result",
  accepted: "Consensus accepted; finalizing",
  finalizing: "Waiting for consensus finalization",
  confirmation_pending: "Submitted, confirmation pending.",
  confirmed: "Confirmed in contract state",
  succeeded: "Finalized successfully",
  failed: "Write failed",
};

export function WriteProgress({ progress }: { progress: WriteProgressState }) {
  if (progress.phase === "idle") return null;
  return <div className={`write-progress write-progress-${progress.phase}`} role={progress.phase === "failed" ? "alert" : "status"} aria-live="polite"><span className="write-progress-icon">{progress.phase === "failed" ? <CircleAlert size={16} /> : ["succeeded", "confirmed"].includes(progress.phase) ? <Check size={16} /> : <LoaderCircle size={16} className="spin" />}</span><div><strong>{phaseCopy[progress.phase]}</strong>{progress.hash && <small className="mono">{progress.hash}</small>}{progress.error && <p>{progress.error}</p>}</div></div>;
}
