const U256_MAX = (1n << 256n) - 1n;

export const QUICK_TEST_SCENARIOS = Object.freeze([
  {
    slug: "release-ready",
    title: "Release ready",
    explanation: "Fictional demonstration scenario: the evidence packet supports releasing a reviewed artifact.",
    action: "Publish the reviewed release candidate to its intended audience.",
    objective: "Confirm the release candidate is accurate, approved and safe to publish.",
    policy: "CLEAR when the evidence confirms accuracy, approval and release safety. REVISE when a material correction or approval is missing. BLOCK when the evidence shows a material safety or authorization failure.",
    expectedVerdict: "CLEAR (fictional testing expectation only; not guaranteed)",
  },
  {
    slug: "correction-needed",
    title: "Correction needed",
    explanation: "Fictional demonstration scenario: the evidence packet contains a material issue that should be fixed before release.",
    action: "Publish the reviewed release candidate to its intended audience.",
    objective: "Confirm the release candidate is accurate, approved and safe to publish.",
    policy: "CLEAR only when the material issue is corrected and approval is documented. REVISE when a material factual correction or approval step is missing. BLOCK when the unresolved issue would make release unsafe or unauthorized.",
    expectedVerdict: "REVISE (fictional testing expectation only; not guaranteed)",
  },
  {
    slug: "unsafe-release",
    title: "Unsafe release",
    explanation: "Fictional demonstration scenario: the evidence packet records an unresolved safety or authorization risk.",
    action: "Publish the reviewed release candidate to its intended audience.",
    objective: "Confirm the release candidate is accurate, approved and safe to publish.",
    policy: "CLEAR only when the evidence confirms accuracy, approval and release safety. REVISE when the risk is specific and can be corrected before release. BLOCK when a material safety or authorization failure remains unresolved.",
    expectedVerdict: "BLOCK (fictional testing expectation only; not guaranteed)",
  },
]);

export const QUICK_TEST_EVIDENCE_PATHS = Object.freeze({
  "release-ready": "/quick-test-evidence/release-ready",
  "correction-needed": "/quick-test-evidence/correction-needed",
  "unsafe-release": "/quick-test-evidence/unsafe-release",
});

export function getQuickTestEvidenceUrl(slug, configuredOrigin = "") {
  const path = QUICK_TEST_EVIDENCE_PATHS[slug];
  if (!path) return null;
  const origin = String(configuredOrigin || "").trim().replace(/\/+$/, "");
  if (!origin) return null;
  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === 'test' || hostname.endsWith('.test') || hostname.includes(':')) return null;
    const octets = hostname.split('.');
    if (octets.length === 4 && octets.every((part) => /^\d+$/.test(part))) {
      const [first, second] = octets.map(Number);
      if (first === 0 || first === 10 || first === 127 || (first === 169 && second === 254) ||
          (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168)) return null;
    }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) return null;
    return origin + path;
  } catch {
    return null;
  }
}

export function quickDurationSeconds(value, unit) {
  const cleaned = String(value || "").trim();
  if (!/^\d+$/.test(cleaned)) return null;
  const amount = BigInt(cleaned);
  const multiplier = unit === "days" ? 86400n : unit === "hours" ? 3600n : 60n;
  const seconds = amount * multiplier;
  return seconds <= U256_MAX ? seconds : null;
}

export function formatExactGen(value) {
  if (value > 0n && value < 1000000000000000n) return value.toLocaleString('en-US') + ' wei';
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 1000000000000000000n;
  const remainder = (absolute % 1000000000000000000n).toString().padStart(18, "0").replace(/0+$/, "");
  return (negative ? "-" : "") + whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (remainder ? "." + remainder : "") + " GEN";
}

export function calculateFundingBreakdown({ bounty, external, credit, minimumBond }) {
  const totalFunding = external + credit;
  const actualExecutionBond = totalFunding >= bounty ? totalFunding - bounty : null;
  const minimumFunding = bounty + minimumBond;
  return {
    actualBounty: bounty,
    actualExecutionBond,
    settledCredit: credit,
    externalGen: external,
    totalEscrow: totalFunding,
    minimumFunding,
    fundingGap: totalFunding < minimumFunding ? minimumFunding - totalFunding : 0n,
    meetsMinimum: actualExecutionBond !== null && actualExecutionBond >= minimumBond,
  };
}
