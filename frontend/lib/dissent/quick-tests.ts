export type QuickTestScenario = { slug: "release-ready" | "correction-needed" | "unsafe-release"; title: string; explanation: string; action: string; objective: string; policy: string; expectedVerdict: string };
export type FundingBreakdown = { actualBounty: bigint; actualExecutionBond: bigint | null; settledCredit: bigint; externalGen: bigint; totalEscrow: bigint; minimumFunding: bigint; fundingGap: bigint; meetsMinimum: boolean };
import { QUICK_TEST_SCENARIOS as scenarioData, QUICK_TEST_EVIDENCE_PATHS as evidencePaths, getQuickTestEvidenceUrl as evidenceUrl, quickDurationSeconds as durationSeconds, formatExactGen as exactGen, calculateFundingBreakdown as fundingBreakdown } from './quick-tests-core.mjs';
export const calculateFundingBreakdown = fundingBreakdown as (input: { bounty: bigint; external: bigint; credit: bigint; minimumBond: bigint }) => FundingBreakdown;
export const formatExactGen = exactGen;
export const quickDurationSeconds = durationSeconds;
export const getQuickTestEvidenceUrl = evidenceUrl;
export const QUICK_TEST_EVIDENCE_PATHS = evidencePaths;
export const QUICK_TEST_SCENARIOS: readonly QuickTestScenario[] = scenarioData as readonly QuickTestScenario[];
