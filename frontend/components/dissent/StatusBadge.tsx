import type { ProposalStatus } from "@/lib/dissent/types";

const statusCopy: Record<string, string> = {
  OPEN: "Open review",
  CLEAR: "Cleared",
  REVISE: "Revision required",
  BLOCK: "Blocked",
  CANCELLED: "Cancelled",
  EXECUTED: "Executed",
};

export function StatusBadge({ status }: { status: ProposalStatus | string }) {
  return <span className={`status-badge status-${status.toLowerCase()}`}>{statusCopy[status] ?? status}</span>;
}

export function statusDescription(status: string): string {
  return {
    OPEN: "Evidence window is open",
    CLEAR: "Review gate is clear; proposer can execute",
    REVISE: "Proposer must submit a fresh revision",
    BLOCK: "Execution is blocked",
    CANCELLED: "Escrow recovered after the recovery delay",
    EXECUTED: "Execution gate was consumed",
  }[status] ?? "Contract-derived status";
}
