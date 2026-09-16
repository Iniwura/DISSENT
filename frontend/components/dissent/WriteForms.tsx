"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ArrowUpRight, CircleAlert, Clock3, LockKeyhole, ShieldCheck } from "lucide-react";
import { useDissent } from "./DissentProvider";
import { WriteProgress } from "./WriteProgress";
import type { Proposal, ProposalDetail } from "@/lib/dissent/types";
import { formatMinimumWei, formatWei, shortAddress, validateIdentifier } from "@/lib/dissent/types";
import { parseGen, parseUint, submitContractWrite, type DissentWriteRequest, type WriteProgress as WriteProgressState, validateHttpsUrl, validateRecipient, U256_MAX } from "@/lib/dissent/writes";
import { isUserRejectedError } from "@/lib/dissent/wallet";
import { STUDIO_NEXT_CHAIN_ID } from "@/lib/dissent/network";
import { DissentValidationError, sanitizeError } from "@/lib/dissent/errors";

const MIN_REVIEW_SECONDS = 60n;
const MAX_REVIEW_SECONDS = 604800n;
type FormValues = Record<string, string>;
type ComposerStage = 1 | 2 | 3;

function useContractWrite() {
  const { wallet, refresh } = useDissent();
  const [progress, setProgress] = useState<WriteProgressState>({ phase: "idle", hash: null, error: null });
  const active = !["idle", "failed", "confirmed", "succeeded"].includes(progress.phase);

  const submit = useCallback(async (request: Omit<DissentWriteRequest, "walletAddress" | "provider">) => {
    if (active) return;
    if (!wallet.address) {
      setProgress({ phase: "failed", hash: null, error: "Connect a wallet before signing a write." });
      return;
    }
    if (wallet.chainId !== STUDIO_NEXT_CHAIN_ID) {
      setProgress({ phase: "failed", hash: null, error: `Switch the connected wallet to Studio Next chain ${STUDIO_NEXT_CHAIN_ID} before signing.` });
      return;
    }
  if (!wallet.provider) {
    setProgress({ phase: "failed", hash: null, error: "Selected wallet provider is unavailable. Reconnect the wallet." });
    return;
  }
    try {
      const result = await submitContractWrite({ ...request, walletAddress: wallet.address, provider: wallet.provider }, setProgress);
      if (result.confirmed) refresh();
    } catch (error) {
      if (isUserRejectedError(error)) {
        setProgress((current) => ({ phase: "failed", hash: current.hash, error: sanitizeError(error, "wallet") }));
        return;
      }
      setProgress((current) => ({ phase: "failed", hash: current.hash, error: sanitizeError(error, "write") }));
    }
  }, [active, refresh, wallet.address, wallet.chainId, wallet.provider]);

  return { progress, submit, active };
}

function writeAvailability(wallet: ReturnType<typeof useDissent>["wallet"]): string | null {
  if (!wallet.address) return "Connect a wallet above to sign this action.";
  if (wallet.chainId !== STUDIO_NEXT_CHAIN_ID) return `Switch the connected wallet to Studio Next chain ${STUDIO_NEXT_CHAIN_ID}.`;
  return null;
}

function validateText(value: string, fieldName: string, maximum: number): string {
  const cleaned = value.trim();
  if (!cleaned) throw new DissentValidationError(`${fieldName} is required.`);
  if ([...cleaned].length > maximum) throw new DissentValidationError(`${fieldName} is too long.`);
  return cleaned;
}

function fundingTotal(external: bigint, credit: bigint): bigint {
  if (external > U256_MAX - credit) throw new DissentValidationError("Combined funding is outside the u256 range.");
  return external + credit;
}

function Field({ label, hint, children, tour }: { label: string; hint?: string; children: ReactNode; tour?: string }) {
  return <label className="write-field" data-tour={tour}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function FieldGroup({ title, children, tour }: { title: string; children: ReactNode; tour?: string }) {
  return <fieldset className="write-field-group" data-tour={tour}><legend>{title}</legend>{children}</fieldset>;
}

function ComposerRail({ stage, onChange }: { stage: ComposerStage; onChange: (stage: ComposerStage) => void }) {
  const steps = [["01", "Decision"], ["02", "Evidence"], ["03", "Funding"]] as const;
  return <nav className="composer-rail" aria-label="Review composer stages">{steps.map(([number, label], index) => {
    const value = (index + 1) as ComposerStage;
    return <button className={stage === value ? "composer-rail-step active" : "composer-rail-step"} type="button" key={number} onClick={() => onChange(value)} aria-current={stage === value ? "step" : undefined}><span>{number}</span><strong>{label}</strong></button>;
  })}</nav>;
}

function TextInput({ value, onChange, placeholder, required = true, type = "text" }: { value: string; onChange: (value: string) => void; placeholder?: string; required?: boolean; type?: string }) {
  return <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} />;
}

function TextArea({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required rows={3} />;
}

function FormHeader({ eyebrow, title, body, icon }: { eyebrow: string; title: string; body: string; icon: ReactNode }) {
  return <div className="write-form-header"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{body}</p></div><span className="write-form-icon">{icon}</span></div>;
}

function FundingFields({ values, setValue, creditHint }: { values: FormValues; setValue: (key: string, value: string) => void; creditHint?: string }) {
  return <div className="funding-grid"><Field label="External GEN" ><TextInput value={values.external} onChange={(value) => setValue("external", value)} placeholder="0.0" /></Field><Field label="Settled credit GEN" hint={creditHint}><TextInput value={values.credit} onChange={(value) => setValue("credit", value)} placeholder="0.0" /></Field></div>;
}

function FundingSummary({ external, credit, required, note, minimumBounty, executionBond }: { external: string; credit: string; required: bigint | null; note: string; minimumBounty?: bigint; executionBond?: bigint }) {
  let externalValue = "—";
  let creditValue = "—";
  let totalValue = "—";
  let walletCommitment = "—";
  try {
    const externalWei = parseGen(external, "External GEN");
    const creditWei = parseGen(credit, "Settled credit GEN");
    externalValue = formatWei(externalWei);
    creditValue = formatWei(creditWei);
    totalValue = formatWei(fundingTotal(externalWei, creditWei));
    walletCommitment = externalValue === "0 GEN" ? "Protocol fee only" : externalValue + " + fee";
  } catch {
    // Keep a stable summary while the user is editing.
  }
  return <aside className="transaction-summary" aria-label="Transaction summary"><p className="eyebrow">Transaction summary</p><div><span>Bounty</span><strong>{required === null ? "Read from contract" : formatWei(required - (executionBond ?? 0n))}</strong></div><div><span>Minimum bounty</span><strong>{minimumBounty === undefined ? "—" : formatMinimumWei(minimumBounty)}</strong></div><div><span>Minimum execution bond</span><strong>{executionBond === undefined ? "—" : formatMinimumWei(executionBond)}</strong></div><div><span>Settled credit</span><strong>{creditValue}</strong></div><div><span>Wallet funding</span><strong>{externalValue}</strong></div><div><span>Estimated protocol fee</span><strong>Calculated at sign</strong></div><div><span>Total funding</span><strong>{totalValue}</strong></div><div className="summary-total"><span>Total wallet commitment</span><strong>{walletCommitment}</strong></div><small>{note}</small></aside>;
}

function minimumHint(label: string, value: bigint): string {
  return "Minimum " + label + ": " + formatMinimumWei(value);
}

type SummaryRow = [string, string];

function ComposerSummary({ title, rows, onEdit }: { title: string; rows: SummaryRow[]; onEdit?: () => void }) {
  return <section className="composer-summary" aria-label={title + " summary"}>
    <div className="composer-summary-heading"><h3>{title}</h3>{onEdit && <button className="text-button" type="button" onClick={onEdit}>Edit</button>}</div>
    <dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value.trim() || "Not entered"}</dd></div>)}</dl>
  </section>;
}

function ComposerStageControls({ stage, onChange, active, disabled, label, detail, buttonLabel }: { stage: ComposerStage; onChange: (stage: ComposerStage) => void; active: boolean; disabled: boolean; label: string; detail: string; buttonLabel: string }) {
  return <div className="composer-stage-controls">
    {stage > 1 ? <button className="text-button" type="button" onClick={() => onChange((stage - 1) as ComposerStage)} disabled={active}>Back</button> : <span />}
    {stage < 3 ? <button className="button button-quiet" type="button" onClick={() => onChange((stage + 1) as ComposerStage)} disabled={active}>Continue <ArrowUpRight size={15} /></button> : <SubmitRow label={label} detail={detail} buttonLabel={buttonLabel} active={active} disabled={disabled} />}
  </div>;
}

export function StartReviewForm() {
  const { snapshot, wallet } = useDissent();
  const { progress, submit, active } = useContractWrite();
  const [values, setValues] = useState<FormValues>({ id: "", action: "", objective: "", policy: "", evidence: "https://", recipient: "", bounty: "1", review: "600", external: "2", credit: "0" });
  const [stage, setStage] = useState<ComposerStage>(1);
  const setValue = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const availability = writeAvailability(wallet);
  const minimumBond = snapshot?.config.minimumExecutionBond ?? 0n;
  const minimumBounty = snapshot?.config.minimumBounty ?? 0n;
  const requiredFunding = useMemo(() => { if (!snapshot) return null; try { return parseGen(values.bounty, "Bounty") + minimumBond; } catch { return minimumBounty + minimumBond; } }, [minimumBond, minimumBounty, snapshot, values.bounty]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const id = validateIdentifier(values.id, "Proposal ID");
      const action = validateText(values.action, "Action", 2000);
      const objective = validateText(values.objective, "Objective", 1200);
      const policy = validateText(values.policy, "Policy", 4000);
      const evidence = validateHttpsUrl(values.evidence);
      const recipient = validateRecipient(values.recipient);
      const bounty = parseGen(values.bounty, "Bounty");
      const review = parseUint(values.review, "Review duration");
      const external = parseGen(values.external, "External GEN");
      const credit = parseGen(values.credit, "Settled credit GEN");
      const totalFunding = fundingTotal(external, credit);
      if (bounty < minimumBounty) throw new DissentValidationError("Bounty must be at least " + formatWei(minimumBounty) + ".");
      if (review < MIN_REVIEW_SECONDS || review > MAX_REVIEW_SECONDS) throw new DissentValidationError("Review duration must be between 60 and 604800 seconds.");
      if (snapshot?.walletCredit !== null && snapshot?.walletCredit !== undefined && credit > snapshot.walletCredit) throw new DissentValidationError("Settled credit exceeds the connected account balance.");
      if (totalFunding < bounty + minimumBond) throw new DissentValidationError("Funding must cover bounty plus at least " + formatWei(minimumBond) + " execution bond.");
      await submit({ functionName: "commit", args: [id, action, objective, policy, evidence, recipient, bounty, review, credit], value: external });
    } catch (error) {
      setValues((current) => ({ ...current, _error: sanitizeError(error, "validation") }));
    }
  }

  const error = values._error;
  return <section className="write-form-section" id="start-a-review">
    <FormHeader eyebrow="New review" title="Start a Review" body="Enter the decision, evidence and funding." icon={<ArrowUpRight size={20} />} />
    <form className="write-form composer-form" data-stage={stage} onSubmit={onSubmit} noValidate>
      <ComposerRail stage={stage} onChange={setStage} />
      <div className="write-form-layout">
        <div className="write-form-fields">
          {stage === 1 && <>
            <FieldGroup title="Record">
              <div className="write-grid">
                <Field label="Proposal ID"><TextInput value={values.id} onChange={(value) => setValue("id", value)} placeholder="agent-review-2026-01" /></Field>
                <Field label="Execution recipient"><TextInput value={values.recipient} onChange={(value) => setValue("recipient", value)} placeholder="0x..." /></Field>
                <Field label="Review seconds"><TextInput value={values.review} onChange={(value) => setValue("review", value)} type="number" /></Field>
              </div>
            </FieldGroup>
            <FieldGroup title="Decision" tour="decision">
              <div className="write-grid">
                <Field label="Action"><TextInput value={values.action} onChange={(value) => setValue("action", value)} placeholder="What would the agent do?" /></Field>
                <Field label="Objective"><TextInput value={values.objective} onChange={(value) => setValue("objective", value)} placeholder="What outcome is intended?" /></Field>
              </div>
              <Field label="Policy"><TextArea value={values.policy} onChange={(value) => setValue("policy", value)} placeholder="What must the decision satisfy?" /></Field>
            </FieldGroup>
          </>}
          {stage === 2 && <>
            <ComposerSummary title="Decision" rows={[["Action", values.action], ["Objective", values.objective], ["Policy", values.policy]]} onEdit={() => setStage(1)} />
            <FieldGroup title="Evidence">
              <Field label="Evidence URL" tour="evidence-anchor"><TextInput value={values.evidence} onChange={(value) => setValue("evidence", value)} placeholder="https://example.com/evidence" /></Field>
            </FieldGroup>
          </>}
          {stage === 3 && <>
            <ComposerSummary title="Decision" rows={[["Action", values.action], ["Objective", values.objective], ["Policy", values.policy]]} onEdit={() => setStage(1)} />
            <ComposerSummary title="Evidence" rows={[["Evidence URL", values.evidence]]} onEdit={() => setStage(2)} />
            <FieldGroup title="Funding" tour="funding">
              <div className="write-grid">
                <Field label="Bounty" hint={snapshot ? minimumHint("bounty", minimumBounty) : undefined}><TextInput value={values.bounty} onChange={(value) => setValue("bounty", value)} /></Field>
                <FundingFields values={values} setValue={setValue} creditHint={snapshot?.walletCredit === null ? "Connect wallet to read credit" : "Reusable Dissent credit"} />
              </div>
            </FieldGroup>
          </>}
        </div>
        {stage === 3 && <FundingSummary external={values.external} credit={values.credit} required={requiredFunding} minimumBounty={snapshot ? minimumBounty : undefined} executionBond={snapshot ? minimumBond : undefined} note="Wallet GEN and settled credit can be combined." />}
      </div>
      {error && <div className="write-validation" role="alert"><CircleAlert size={15} />{error}</div>}
      <ComposerStageControls stage={stage} onChange={setStage} active={active} disabled={Boolean(availability)} label="Review" detail="Wallet approval is required." buttonLabel="Commit review" />
      {availability && <p className="write-availability"><LockKeyhole size={14} /> {availability}</p>}
      <WriteProgress progress={progress} />
    </form>
  </section>;
}

export function ReviseForm({ parent }: { parent: Proposal }) {
  const { snapshot, wallet } = useDissent();
  const { progress, submit, active } = useContractWrite();
  const [values, setValues] = useState<FormValues>({ id: parent.id + "-r1", action: parent.action, objective: parent.objective, policy: parent.policy, evidence: parent.evidenceUrl, recipient: parent.executionRecipient, bounty: formatForInput(parent.initialBounty), review: "600", external: "2", credit: "0" });
  const [stage, setStage] = useState<ComposerStage>(1);
  const setValue = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const availability = writeAvailability(wallet);
  const minimumBond = snapshot?.config.minimumExecutionBond ?? 0n;
  const minimumBounty = snapshot?.config.minimumBounty ?? 0n;
  const requiredFunding = useMemo(() => { if (!snapshot) return null; try { return parseGen(values.bounty, "Bounty") + minimumBond; } catch { return minimumBounty + minimumBond; } }, [minimumBond, minimumBounty, snapshot, values.bounty]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const id = validateIdentifier(values.id, "Revision proposal ID");
      const action = validateText(values.action, "Action", 2000);
      const objective = validateText(values.objective, "Objective", 1200);
      const policy = validateText(values.policy, "Policy", 4000);
      const evidence = validateHttpsUrl(values.evidence);
      const recipient = validateRecipient(values.recipient);
      const bounty = parseGen(values.bounty, "Bounty");
      const review = parseUint(values.review, "Review duration");
      const external = parseGen(values.external, "External GEN");
      const credit = parseGen(values.credit, "Settled credit GEN");
      const totalFunding = fundingTotal(external, credit);
      if (bounty < minimumBounty) throw new DissentValidationError("Bounty must be at least " + formatWei(minimumBounty) + ".");
      if (review < MIN_REVIEW_SECONDS || review > MAX_REVIEW_SECONDS) throw new DissentValidationError("Review duration must be between 60 and 604800 seconds.");
      if (snapshot?.walletCredit !== null && snapshot?.walletCredit !== undefined && credit > snapshot.walletCredit) throw new DissentValidationError("Settled credit exceeds the connected account balance.");
      if (totalFunding < bounty + minimumBond) throw new DissentValidationError("Funding must cover bounty plus at least " + formatWei(minimumBond) + " execution bond.");
      await submit({ functionName: "revise", args: [parent.id, id, action, objective, policy, evidence, recipient, bounty, review, credit], value: external });
    } catch (error) {
      setValues((current) => ({ ...current, _error: sanitizeError(error, "validation") }));
    }
  }

  return <section className="write-form-section">
    <FormHeader eyebrow="Revision" title="Revise this review" body="A revision starts a fresh review with new funding." icon={<ArrowUpRight size={20} />} />
    <form className="write-form composer-form" data-stage={stage} onSubmit={onSubmit} noValidate>
      <ComposerRail stage={stage} onChange={setStage} />
      <div className="write-form-layout">
        <div className="write-form-fields">
          {stage === 1 && <>
            <FieldGroup title="Replacement record">
              <div className="write-grid">
                <Field label="New proposal ID"><TextInput value={values.id} onChange={(value) => setValue("id", value)} /></Field>
                <Field label="Execution recipient"><TextInput value={values.recipient} onChange={(value) => setValue("recipient", value)} /></Field>
                <Field label="Review seconds"><TextInput value={values.review} onChange={(value) => setValue("review", value)} type="number" /></Field>
              </div>
            </FieldGroup>
            <FieldGroup title="Decision" tour="decision">
              <div className="write-grid">
                <Field label="Action"><TextInput value={values.action} onChange={(value) => setValue("action", value)} /></Field>
                <Field label="Objective"><TextInput value={values.objective} onChange={(value) => setValue("objective", value)} /></Field>
              </div>
              <Field label="Policy"><TextArea value={values.policy} onChange={(value) => setValue("policy", value)} /></Field>
            </FieldGroup>
          </>}
          {stage === 2 && <>
            <ComposerSummary title="Decision" rows={[["Action", values.action], ["Objective", values.objective], ["Policy", values.policy]]} onEdit={() => setStage(1)} />
            <FieldGroup title="Evidence">
              <Field label="Evidence URL"><TextInput value={values.evidence} onChange={(value) => setValue("evidence", value)} /></Field>
            </FieldGroup>
          </>}
          {stage === 3 && <>
            <ComposerSummary title="Decision" rows={[["Action", values.action], ["Objective", values.objective], ["Policy", values.policy]]} onEdit={() => setStage(1)} />
            <ComposerSummary title="Evidence" rows={[["Evidence URL", values.evidence]]} onEdit={() => setStage(2)} />
            <FieldGroup title="Funding">
              <div className="write-grid">
                <Field label="Bounty" hint={snapshot ? minimumHint("bounty", minimumBounty) : undefined}><TextInput value={values.bounty} onChange={(value) => setValue("bounty", value)} /></Field>
                <FundingFields values={values} setValue={setValue} />
              </div>
            </FieldGroup>
          </>}
        </div>
        {stage === 3 && <FundingSummary external={values.external} credit={values.credit} required={requiredFunding} minimumBounty={snapshot ? minimumBounty : undefined} executionBond={snapshot ? minimumBond : undefined} note="The parent escrow is not reused." />}
      </div>
      {values._error && <div className="write-validation" role="alert"><CircleAlert size={15} />{values._error}</div>}
      <ComposerStageControls stage={stage} onChange={setStage} active={active} disabled={Boolean(availability)} label="Parent proposal" detail={parent.id} buttonLabel="Submit revision" />
      <WriteProgress progress={progress} />
      {availability && <p className="write-availability"><LockKeyhole size={14} /> {availability}</p>}
    </form>
  </section>;
}

export function ChallengeForm({ proposal }: { proposal: Proposal }) {
  const { snapshot, wallet } = useDissent();
  const { progress, submit, active } = useContractWrite();
  const [values, setValues] = useState<FormValues>({ id: `${proposal.id}-objection-1`, objection: "", evidence: "https://", external: "0.1", credit: "0" });
  const setValue = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const availability = writeAvailability(wallet);
  const minimumStake = snapshot?.config.minimumStake ?? 0n;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const id = validateIdentifier(values.id, "Challenge ID");
      const objection = validateText(values.objection, "Objection", 2000);
      const evidence = validateHttpsUrl(values.evidence);
      const external = parseGen(values.external, "External GEN");
      const credit = parseGen(values.credit, "Settled credit GEN");
      if (snapshot?.walletCredit !== null && snapshot?.walletCredit !== undefined && credit > snapshot.walletCredit) throw new DissentValidationError("Settled credit exceeds the connected account balance.");
      if (fundingTotal(external, credit) < minimumStake) throw new DissentValidationError("Stake must be at least " + formatWei(minimumStake) + ".");
      await submit({ functionName: "challenge", args: [proposal.id, id, objection, evidence, credit], value: external });
    } catch (error) {
      setValues((current) => ({ ...current, _error: sanitizeError(error, "validation") }));
    }
  }

  return <section className="write-form-section compact-write-form"><FormHeader eyebrow="Challenge" title="Challenge this review" body="State the objection and fund its stake." icon={<ShieldCheck size={20} />} /><form className="write-form" onSubmit={onSubmit} noValidate><div className="write-form-layout"><div className="write-form-fields"><FieldGroup title="Objection record"><div className="write-grid"><Field label="Challenge ID"><TextInput value={values.id} onChange={(value) => setValue("id", value)} /></Field><Field label="Evidence URL"><TextInput value={values.evidence} onChange={(value) => setValue("evidence", value)} /></Field></div><Field label="Objection"><TextArea value={values.objection} onChange={(value) => setValue("objection", value)} placeholder="What material flaw should validators inspect?" /></Field></FieldGroup><FieldGroup title="Funding"><FundingFields values={values} setValue={setValue} creditHint={snapshot?.walletCredit === null ? "Connect wallet to read credit" : undefined} /></FieldGroup></div><FundingSummary external={values.external} credit={values.credit} required={snapshot ? minimumStake : null} note="The verdict determines stake settlement." /></div>{values._error && <div className="write-validation" role="alert"><CircleAlert size={15} />{values._error}</div>}<SubmitRow label="Minimum challenge stake" detail={formatMinimumWei(minimumStake)} buttonLabel="Submit challenge" active={active} disabled={Boolean(availability)} />{availability && <p className="write-availability"><LockKeyhole size={14} /> {availability}</p>}<WriteProgress progress={progress} /></form></section>;
}

function SubmitRow({ label, detail, buttonLabel, active, disabled }: { label: string; detail: string; buttonLabel: string; active: boolean; disabled: boolean }) {
  return <div className="write-submit-row"><div><strong>{label}</strong><small>{detail}</small></div><button className="button button-red" type="submit" disabled={disabled || active}>{active ? "Transaction in progress" : buttonLabel} <ArrowUpRight size={15} /></button></div>;
}

export function SimpleWriteButton({ functionName, proposalId, label, unavailableMessage }: { functionName: "adjudicate" | "execute" | "cancel"; proposalId: string; label: string; unavailableMessage?: string }) {
  const { wallet } = useDissent();
  const { progress, submit, active } = useContractWrite();
  const availability = writeAvailability(wallet);
  return <div className="simple-write"><button className="button button-red" type="button" onClick={() => void submit({ functionName, args: [proposalId], value: 0n })} disabled={Boolean(availability) || active}>{active ? "Transaction in progress" : label} <ArrowUpRight size={15} /></button>{unavailableMessage && <small>{unavailableMessage}</small>}{availability && <small className="write-availability"><LockKeyhole size={14} /> {availability}</small>}<WriteProgress progress={progress} /></div>;
}

export function ProposalActions({ detail }: { detail: ProposalDetail }) {
  const { proposal } = detail;
  const { wallet } = useDissent();
  const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  useEffect(() => { const timer = window.setInterval(() => setNow(BigInt(Math.floor(Date.now() / 1000))), 1000); return () => window.clearInterval(timer); }, []);
  const isProposer = Boolean(wallet.address) && wallet.address?.toLowerCase() === proposal.proposer.toLowerCase();
  const afterDeadline = now >= proposal.challengeDeadline;
  const recoveryAt = proposal.challengeDeadline + 604800n;
  const afterRecovery = now >= recoveryAt;
  const actionState = proposal.status === "OPEN" ? afterRecovery ? "Recovery is available for this unresolved review." : afterDeadline ? "Adjudication is available; cancellation remains held until the seven-day recovery boundary." : "Challenges remain open until the challenge deadline." : proposal.status === "REVISE" ? proposal.supersededBy ? "A replacement is already linked; this review cannot be revised again." : "Only the original proposer can submit one funded replacement." : proposal.status === "CLEAR" && detail.canExecute ? "Only the proposer can execute this cleared gate." : `No further action is available from ${proposal.status}.`;

  return <section className="detail-card write-actions"><div className="card-heading"><div><p className="eyebrow">Review gate</p><h2>Actions</h2></div><Clock3 size={19} aria-hidden="true" /></div><p className="muted-copy">{actionState}</p>{proposal.status === "OPEN" && !afterDeadline && !isProposer && <details className="action-disclosure"><summary>Challenge this review</summary><ChallengeForm proposal={proposal} /></details>}{proposal.status === "OPEN" && !afterDeadline && isProposer && <p className="write-availability"><LockKeyhole size={14} /> Proposers cannot challenge their own review.</p>}{proposal.status === "OPEN" && afterDeadline && <SimpleWriteButton functionName="adjudicate" proposalId={proposal.id} label="Adjudicate review" unavailableMessage="Permissionless after the challenge deadline; validator consensus decides the outcome." />}{proposal.status === "OPEN" && afterRecovery && <SimpleWriteButton functionName="cancel" proposalId={proposal.id} label="Recover unresolved escrow" unavailableMessage="Permissionless seven-day liveness recovery; no model or web execution is used." />}{proposal.status === "REVISE" && isProposer && !proposal.supersededBy && <details className="action-disclosure"><summary>Submit a revision</summary><ReviseForm parent={proposal} /></details>}{proposal.status === "CLEAR" && detail.canExecute && isProposer && <SimpleWriteButton functionName="execute" proposalId={proposal.id} label="Execute review gate" unavailableMessage={`Proposer-only. Bond goes to ${shortAddress(proposal.executionRecipient)} as settled Dissent credit.`} />}{proposal.status === "REVISE" && !isProposer && !proposal.supersededBy && <p className="write-availability"><LockKeyhole size={14} /> Only the proposer can create the direct replacement.</p>}{proposal.status === "CLEAR" && detail.canExecute && !isProposer && <p className="write-availability"><LockKeyhole size={14} /> Only the proposer can consume the execution gate.</p>}{proposal.status === "CLEAR" && !detail.canExecute && <p className="write-availability"><LockKeyhole size={14} /> This CLEAR record has no outstanding execution bond to consume.</p>}{["BLOCK", "CANCELLED", "EXECUTED"].includes(proposal.status) && <p className="terminal-action-note"><ShieldCheck size={14} /> Terminal review state. The contract rejects replayed settlement actions.</p>}</section>;
}

function formatForInput(value: bigint): string {
  const whole = value / 1_000_000_000_000_000_000n;
  const fraction = (value % 1_000_000_000_000_000_000n).toString().padStart(18, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
