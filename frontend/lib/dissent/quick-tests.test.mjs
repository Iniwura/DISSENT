import assert from "node:assert/strict";
import test from "node:test";
import {
  QUICK_TEST_SCENARIOS,
  calculateFundingBreakdown,
  getQuickTestEvidenceUrl,
  quickDurationSeconds,
} from "./quick-tests-core.mjs";

test("quick test scenarios are complete and distinct", () => {
  assert.equal(QUICK_TEST_SCENARIOS.length, 3);
  assert.deepEqual(QUICK_TEST_SCENARIOS.map((scenario) => scenario.slug), [
    "release-ready",
    "correction-needed",
    "unsafe-release",
  ]);
  for (const scenario of QUICK_TEST_SCENARIOS) {
    assert.ok(scenario.title);
    assert.ok(scenario.explanation.includes("Fictional demonstration scenario"));
    assert.ok(scenario.action);
    assert.ok(scenario.objective);
    assert.match(scenario.policy, /CLEAR/);
    assert.match(scenario.policy, /REVISE/);
    assert.match(scenario.policy, /BLOCK/);
    assert.ok(scenario.expectedVerdict.includes("not guaranteed"));
  }
});

test("evidence URL selection requires a configured HTTPS origin", () => {
  assert.equal(getQuickTestEvidenceUrl("release-ready"), null);
  assert.equal(getQuickTestEvidenceUrl("release-ready", "http://localhost:3000"), null);
  assert.equal(
    getQuickTestEvidenceUrl("release-ready", "https://dissent.example"),
    "https://dissent.example/quick-test-evidence/release-ready",
  );
  assert.equal(getQuickTestEvidenceUrl("unknown", "https://dissent.example"), null);
});

test("duration presets convert to exact contract seconds", () => {
  assert.equal(quickDurationSeconds("10", "minutes"), 600n);
  assert.equal(quickDurationSeconds("2", "hours"), 7200n);
  assert.equal(quickDurationSeconds("1", "days"), 86400n);
  assert.equal(quickDurationSeconds("nope", "minutes"), null);
});

test("funding derives the actual bond and total escrow", () => {
  const minimumBond = 1000n;
  const breakdown = calculateFundingBreakdown({
    bounty: 1000000000000000000n,
    external: 2000000000000000000n,
    credit: 0n,
    minimumBond,
  });
  assert.equal(breakdown.actualExecutionBond, 1000000000000000000n);
  assert.equal(breakdown.totalEscrow, 2000000000000000000n);
  assert.equal(breakdown.settledCredit, 0n);
  assert.equal(breakdown.externalGen, 2000000000000000000n);
  assert.equal(breakdown.meetsMinimum, true);
});
