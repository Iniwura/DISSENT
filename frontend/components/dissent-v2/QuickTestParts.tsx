"use client";

import { formatMinimumWei } from "@/lib/dissent/types";
import { calculateFundingBreakdown, formatExactGen, QUICK_TEST_SCENARIOS, quickDurationSeconds, type QuickTestScenario } from "@/lib/dissent/quick-tests";
import { parseGen } from "@/lib/dissent/writes";

export type QuickValues = {
  id: string;
  recipient: string;
  review: string;
  durationMode: "preset" | "custom";
  customDuration: string;
  durationUnit: "minutes" | "hours" | "days";
  bounty: string;
  external: string;
  credit: string;
  confirm: boolean;
  error: string;
};

export function QuickField({ label, value, onChange, placeholder, type = "text", hint }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; hint?: string }) {
  return <label className="dv2-field"><span>{label}</span><input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />{hint && <small>{hint}</small>}</label>;
}

const PRESETS = [["10 minutes", "600"], ["30 minutes", "1800"], ["1 hour", "3600"], ["6 hours", "21600"], ["24 hours", "86400"]] as const;

export function QuickDuration({ values, update }: { values: QuickValues; update: (next: Partial<QuickValues>) => void }) {
  return <div className="dv2-quick-duration"><div className="dv2-duration-options" role="group" aria-label="Challenge duration presets">{PRESETS.map(([label, seconds]) => <button key={seconds} type="button" className={values.durationMode === "preset" && values.review === seconds ? "is-selected" : ""} aria-pressed={values.durationMode === "preset" && values.review === seconds} onClick={() => update({ review: seconds, durationMode: "preset" })}>{label}</button>)}<button type="button" className={values.durationMode === "custom" ? "is-selected" : ""} aria-pressed={values.durationMode === "custom"} onClick={() => update({ durationMode: "custom" })}>Custom</button></div>{values.durationMode === "custom" && <div className="dv2-custom-duration"><QuickField label="Amount" value={values.customDuration} onChange={(customDuration) => update({ customDuration, review: quickDurationSeconds(customDuration, values.durationUnit)?.toString() ?? "" })} type="number" placeholder="15" /><label className="dv2-field"><span>Unit</span><select value={values.durationUnit} onChange={(event) => { const durationUnit = event.target.value as QuickValues["durationUnit"]; update({ durationUnit, review: quickDurationSeconds(values.customDuration, durationUnit)?.toString() ?? "" }); }}><option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option></select></label></div>}<p className="dv2-duration-result">{values.review ? <>Recorded as <strong>{values.review} seconds</strong> on chain.</> : "Choose a duration to see the exact contract value."}</p></div>;
}

export function QuickScenarioList({ selected, onSelect }: { selected: string; onSelect: (slug: QuickTestScenario["slug"]) => void }) {
  return <div className="dv2-quick-scenarios">{QUICK_TEST_SCENARIOS.map((item, index) => <button key={item.slug} className={"dv2-quick-scenario" + (item.slug === selected ? " is-selected" : "")} type="button" onClick={() => onSelect(item.slug)} aria-pressed={item.slug === selected}><span>{item.slug === selected ? "Selected" : "Test 0" + (index + 1)}</span><strong>{item.title}</strong><small>{item.explanation}</small><em>Expected outcome for testing only: {item.expectedVerdict}</em></button>)}</div>;
}

export function QuickFundingSummary({ values, minimumBounty, minimumBond }: { values: QuickValues; minimumBounty: bigint | null; minimumBond: bigint | null }) {
  let breakdown = null;
  try { breakdown = calculateFundingBreakdown({ bounty: parseGen(values.bounty, "Bounty"), external: parseGen(values.external, "External GEN"), credit: parseGen(values.credit, "Settled credit GEN"), minimumBond: minimumBond ?? 0n }); } catch {}
  return <div className="dv2-quick-funding-summary"><div className="dv2-quick-funding-total"><span>Total escrow</span><strong>{breakdown ? formatExactGen(breakdown.totalEscrow) : "Enter funding"}</strong></div><dl><div><dt>Actual bounty</dt><dd>{breakdown ? formatExactGen(breakdown.actualBounty) : "Not set"}</dd></div><div><dt>Actual execution bond</dt><dd>{breakdown?.actualExecutionBond === null ? "Funding required" : breakdown ? formatExactGen(breakdown.actualExecutionBond) : "Not set"}</dd></div><div><dt>Settled credit applied</dt><dd>{breakdown ? formatExactGen(breakdown.settledCredit) : "Not set"}</dd></div><div><dt>External GEN sent</dt><dd>{breakdown ? formatExactGen(breakdown.externalGen) : "Not set"}</dd></div><div><dt>Minimum bounty</dt><dd>{minimumBounty === null ? "Loading" : formatMinimumWei(minimumBounty)}</dd></div><div><dt>Minimum execution bond</dt><dd>{minimumBond === null ? "Loading" : formatMinimumWei(minimumBond)}</dd></div></dl><p>Funding equals external GEN plus settled credit. The contract derives the bond as funding minus the bounty. Network fees are separate.</p></div>;
}
