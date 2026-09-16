export type QuickTestScenario = {
  slug: "release-ready" | "correction-needed" | "unsafe-release";
  title: string;
  explanation: string;
  action: string;
  objective: string;
  policy: string;
  expectedVerdict: string;
};

export type FundingBreakdown = {
  actualBounty: bigint;
  actualExecutionBond: bigint | null;
  settledCredit: bigint;
  externalGen: bigint;
  totalEscrow: bigint;
  minimumFunding: bigint;
  fundingGap: bigint;
  meetsMinimum: boolean;
};

export const QUICK_TEST_SCENARIOS: readonly QuickTestScenario[];
export const QUICK_TEST_EVIDENCE_PATHS: Readonly<Record<string, string>>;
export function getQuickTestEvidenceUrl(slug: string, configuredOrigin?: string): string | null;
export function quickDurationSeconds(value: string, unit: string): bigint | null;
export function formatExactGen(value: bigint): string;
export function calculateFundingBreakdown(input: { bounty: bigint; external: bigint; credit: bigint; minimumBond: bigint }): FundingBreakdown;
