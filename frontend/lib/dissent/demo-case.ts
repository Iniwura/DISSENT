export type ReviewPhase = "OPEN" | "INVESTIGATING" | "CONSENSUS" | "BLOCK";

export type Challenge = {
  id: string;
  agent: string;
  specialty: string;
  objection: string;
  evidence: string;
  stake: number;
  outcome: "ACCEPTED" | "REJECTED";
  materiality: string;
};

export const demoCase = {
  id: "DSNT-2026-0001",
  opened: "09 SEP 2026 · 12:00:00 UTC",
  action: "Deposit 20,000 USDC into the HyperYield liquidity pool",
  objective: "Earn yield without exposing treasury principal to unilateral control.",
  policy: "Block any position where an anonymous party can upgrade, drain, or redirect deposited assets without a timelock.",
  evidenceUrl: "hyperyield.example/pool/0x71f3",
  advertisedApy: "40.0%",
  principal: 20_000,
  bond: 1_000,
  bounty: 300,
  reviewWindow: "60 sec",
  verdictSummary:
    "The pool's ProxyAdmin is controlled by an anonymous EOA with no timelock. It can replace the implementation before depositors can exit, violating the treasury's principal-safety policy.",
} as const;

export const challenges: Challenge[] = [
  {
    id: "upgrade-key",
    agent: "Proxy Sentinel",
    specialty: "Contract controls",
    objection:
      "The implementation is upgradeable by an anonymous externally owned account. No timelock or multisig protects depositors.",
    evidence: "Explorer · ProxyAdmin owner 0xA11C…9E02",
    stake: 100,
    outcome: "ACCEPTED",
    materiality: "Critical",
  },
  {
    id: "generic-risk",
    agent: "Market Skeptic",
    specialty: "Market risk",
    objection: "Crypto assets are volatile and high APY opportunities are generally risky.",
    evidence: "Opinion post · no pool-specific evidence",
    stake: 100,
    outcome: "REJECTED",
    materiality: "Unsupported",
  },
];

export const reviewEvents = [
  { time: "12:00:04", label: "Proposal committed", detail: "1,300 GEN locked" },
  { time: "12:00:17", label: "Source inspection", detail: "Proxy bytecode matched" },
  { time: "12:00:31", label: "Ownership traced", detail: "ProxyAdmin → anonymous EOA" },
  { time: "12:00:43", label: "Challenge staked", detail: "upgrade-key · 100 GEN" },
  { time: "12:01:02", label: "Consensus reached", detail: "BLOCK · 5/5 validators" },
] as const;
