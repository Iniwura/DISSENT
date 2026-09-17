"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, CircleAlert, LockKeyhole, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useDissent } from "@/components/dissent/DissentProvider";
import { isUserRejectedError } from "@/lib/dissent/wallet";
import { formatMinimumWei, formatWei, validateIdentifier, type Proposal, type ProposalDetail } from "@/lib/dissent/types";
import { getPendingWrite, parseGen, parseUint, reconcilePendingWrite, submitContractWrite, type DissentWriteRequest, type WriteProgress, U256_MAX, validateHttpsUrl, validateRecipient } from "@/lib/dissent/writes";
import { EditorialAction, EditorialButton, EditorialLabel, SectionMarker } from "./Editorial";
import { EditorialNotification } from "./EditorialNotification";
import { DissentValidationError, PENDING_CONFIRMATION, sanitizeError } from "@/lib/dissent/errors";

type ComposerStage = 1 | 2 | 3 | 4;
type FormValues = Record<string, string>;
type WriteRequest = Omit<DissentWriteRequest, "walletAddress" | "provider">;
const MIN_REVIEW_SECONDS = 60n;
const MAX_REVIEW_SECONDS = 604800n;

function writeAvailability(wallet: ReturnType<typeof useDissent>["wallet"]): string | null {
  if (!wallet.connected || !wallet.address) return "Connect a wallet to sign this write.";
  if (!wallet.provider) return "The selected wallet provider is unavailable.";
  if (wallet.chainId !== 61997) return "Switch the wallet to Studio Next before signing.";
  return null;
}

type ConfirmedWriteHandler = (proposalId: string, hash: string) => void;
type V2WriteOptions = {
  lockAfterConfirmation?: boolean;
};

function useV2Write(onConfirmed?: ConfirmedWriteHandler, options?: V2WriteOptions) {
  const { wallet, refresh } = useDissent();
  const lockAfterConfirmation = options?.lockAfterConfirmation ?? true;
  const [progress, setProgress] = useState<WriteProgress>({ phase: "idle", hash: null, error: null });
  const mounted = useRef(true);
  const onConfirmedRef = useRef(onConfirmed);
  useEffect(() => () => { mounted.current = false; }, []);
  useEffect(() => { onConfirmedRef.current = onConfirmed; }, [onConfirmed]);
  const notifyConfirmed = useCallback((functionName: string, proposalId: string, hash: string) => {
    if (!mounted.current || !onConfirmedRef.current || (functionName !== "commit" && functionName !== "revise")) return;
    onConfirmedRef.current(proposalId, hash);
  }, []);
  useEffect(() => {
    const pending = getPendingWrite();
    if (!pending) return;
    let cancelled = false;
    setProgress({ phase: "confirmation_pending", hash: pending.hash, error: PENDING_CONFIRMATION });
    void reconcilePendingWrite(pending).then((result) => {
      if (cancelled || !mounted.current) return;
      if (result?.status === "confirmed") {
        setProgress({ phase: "confirmed", hash: result.hash, error: null });
        refresh();
        notifyConfirmed(pending.functionName, pending.proposalId, result.hash);
      } else if (result?.status === "failed") {
        setProgress({ phase: "failed", hash: result.hash, error: result.error });
      }
    });
    return () => { cancelled = true; };
  }, [refresh]);
  const active = !["idle", "failed", "confirmed", "succeeded"].includes(progress.phase);
  const transactionLocked = active || (lockAfterConfirmation && progress.phase === "confirmed");
  const submit = useCallback(async (request: WriteRequest) => {
    if (!mounted.current || active || (lockAfterConfirmation && progress.phase === "confirmed")) return null;
    const unavailable = writeAvailability(wallet);
    if (unavailable || !wallet.provider || !wallet.address) { setProgress({ phase: "failed", hash: null, error: unavailable ?? "Wallet unavailable." }); return null; }
    try {
      const result = await submitContractWrite({ ...request, walletAddress: wallet.address, provider: wallet.provider }, setProgress);
      if (result.confirmed) {
        refresh();
        const proposalId = request.functionName === "revise" ? request.args[1] : request.args[0];
        if (typeof proposalId === "string") notifyConfirmed(request.functionName, proposalId, result.hash);
      }
      return result;
    } catch (error) {
      if (isUserRejectedError(error)) { setProgress((current) => ({ phase: "failed", hash: current.hash, error: sanitizeError(error, "wallet") })); return null; }
      setProgress((current) => ({ phase: "failed", hash: current.hash, error: sanitizeError(error, "write") }));
      return null;
    }
  }, [active, lockAfterConfirmation, notifyConfirmed, progress.phase, refresh, wallet]);
  return { progress, submit, active, transactionLocked };
}

function Field({ label, value, onChange, placeholder, type = "text", hint }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; hint?: string }) {
  return <label className="dv2-field"><span>{label}</span><input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />{hint && <small>{hint}</small>}</label>;
}
function Area({ label, value, onChange, placeholder, hint }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; hint?: string }) {
  return <label className="dv2-field dv2-field-area"><span>{label}</span><textarea value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} rows={5} />{hint && <small>{hint}</small>}</label>;
}
function Summary({ title, rows, onEdit }: { title: string; rows: [string, string][]; onEdit: () => void }) {
  return <section className="dv2-form-summary"><div><EditorialLabel>{title}</EditorialLabel><button className="dv2-text-button" type="button" onClick={onEdit}>Edit</button></div><dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value.trim() || "Not entered"}</dd></div>)}</dl></section>;
}
function FundingFields({ values, setValue }: { values: FormValues; setValue: (key: string, value: string) => void }) {
  return <div className="dv2-funding-fields"><Field label="External GEN" value={values.external} onChange={(value) => setValue("external", value)} hint="Wallet value sent with the write." /><Field label="Settled credit GEN" value={values.credit} onChange={(value) => setValue("credit", value)} hint="Reusable Dissent credit." /></div>;
}
function FundingSummary({ values, required, minimumBounty, bond, note }: { values: FormValues; required: bigint | null; minimumBounty: bigint | null; bond: bigint | null; note: string }) {
  let bounty = "Not entered";
  let credit = "Not entered";
  let external = "Not entered";
  let total = "Not entered";
  try {
    const bountyWei = parseGen(values.bounty, "Bounty");
    const creditWei = parseGen(values.credit, "Settled credit GEN");
    const externalWei = parseGen(values.external, "External GEN");
    bounty = formatWei(bountyWei);
    credit = formatWei(creditWei);
    external = formatWei(externalWei);
    total = formatWei(externalWei + creditWei);
  } catch {}
  return <aside className="dv2-funding-summary"><EditorialLabel>Funding commitment</EditorialLabel><div className="dv2-funding-total">{total}</div><dl><div><dt>Review bounty</dt><dd>{bounty}</dd></div><div><dt>Execution bond</dt><dd>{bond === null ? "Loading" : formatWei(bond)}</dd></div><div><dt>Settled credit applied</dt><dd>{credit}</dd></div><div><dt>External GEN sent</dt><dd>{external}</dd></div><div><dt>Estimated network fee</dt><dd>Quoted before signing</dd></div><div><dt>Total wallet value</dt><dd>{external} + network fee</dd></div><div className="summary-total"><dt>Total contract escrow</dt><dd>{total}</dd></div><div><dt>Minimum bounty</dt><dd>{minimumBounty === null ? "Loading" : formatMinimumWei(minimumBounty)}</dd></div><div><dt>Minimum required escrow</dt><dd>{required === null ? "Loading" : formatWei(required)}</dd></div></dl><p>{note} Wallet approval is requested only when you commit the final stage.</p></aside>;
}
export function WriteStatus({ progress }: { progress: WriteProgress }) {
  if (progress.phase === "idle") return null;
  if (progress.phase === "failed" && progress.error === "The request was cancelled in your wallet.") return <EditorialNotification title="Wallet request cancelled" message="The request was cancelled in your wallet." tone="warning" />;
  const text = progress.phase === "awaiting_signature" ? "Awaiting wallet approval" : progress.phase === "submitted" ? "Submitted / broadcast" : progress.phase === "awaiting_result" ? "Awaiting GenLayer result" : progress.phase === "accepted" ? "Consensus accepted; finalizing" : progress.phase === "finalizing" ? "Finalizing" : progress.phase === "confirmation_pending" ? "Submitted, confirmation pending." : progress.phase === "confirmed" ? "Confirmed in contract state" : progress.phase === "succeeded" ? "Finalized successfully" : progress.phase === "failed" ? progress.error ?? "Something went wrong. Please try again." : "Checking fee and network";
  return <div className={"dv2-write-progress is-" + progress.phase} role={progress.phase === "failed" ? "alert" : "status"}><span>{text}</span>{progress.hash && <small className="dv2-mono">{progress.hash}</small>}</div>;
}
function StageControls({ stage, setStage, active, transactionLocked, stageReady, submitLabel }: { stage: ComposerStage; setStage: (stage: ComposerStage) => void; active: boolean; transactionLocked: boolean; stageReady: boolean; submitLabel: string }) {
  return <div className="dv2-stage-controls"><button className="dv2-text-button" type="button" onClick={() => setStage(Math.max(1, stage - 1) as ComposerStage)} disabled={stage === 1 || transactionLocked}><ArrowLeft size={15} /> Back</button>{stage < 3 ? <button className="dv2-button dv2-button-red" type="button" onClick={() => setStage((stage + 1) as ComposerStage)} disabled={!stageReady || transactionLocked}>Continue <ArrowRight size={15} /></button> : <button className="dv2-button dv2-button-red" type="submit" disabled={!stageReady || transactionLocked}>{progressLabel(active, transactionLocked, submitLabel)} <ArrowUpRight size={15} /></button>}</div>;
}
function progressLabel(active: boolean, transactionLocked: boolean, submitLabel: string): string {
  if (transactionLocked && !active) return "Confirmed";
  return active ? "Transaction in progress" : submitLabel;
}
function validateText(value: string, label: string, max: number): string {
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > max) throw new DissentValidationError(label + " is required and must be " + max + " characters or fewer.");
  return cleaned;
}
function formatInput(value: bigint): string { const whole = value / 1_000_000_000_000_000_000n; const fraction = (value % 1_000_000_000_000_000_000n).toString().padStart(18, "0").replace(/0+$/, ""); return fraction ? whole + "." + fraction : whole.toString(); }

function composerStageReady(stage: ComposerStage, values: FormValues, walletCredit: bigint | null | undefined, minimumBounty: bigint, minimumBond: bigint): boolean {
  try {
    validateIdentifier(values.id, "Proposal ID");
    validateText(values.action, "Action", 2000);
    validateText(values.objective, "Objective", 1200);
    validateText(values.policy, "Policy", 4000);
    validateRecipient(values.recipient);
    const review = parseUint(values.review, "Review duration");
    if (review < MIN_REVIEW_SECONDS || review > MAX_REVIEW_SECONDS) return false;
    if (stage >= 2) validateHttpsUrl(values.evidence);
    if (stage < 3) return true;
    const bounty = parseGen(values.bounty, "Bounty");
    const external = parseGen(values.external, "External GEN");
    const credit = parseGen(values.credit, "Settled credit GEN");
    if (bounty < minimumBounty || (walletCredit !== null && walletCredit !== undefined && credit > walletCredit)) return false;
    if (external > U256_MAX - credit || external + credit < bounty + minimumBond) return false;
    return true;
  } catch {
    return false;
  }
}

export function ReviewComposerV2({ mode, parent, lockAfterConfirmation = true }: { mode: "commit" | "revise"; parent?: Proposal; lockAfterConfirmation?: boolean }) {
  const { snapshot, wallet } = useDissent();
  const { progress, submit, active, transactionLocked } = useV2Write(undefined, { lockAfterConfirmation });
  const router = useRouter();
  const minimumBond = snapshot?.config.minimumExecutionBond ?? 0n;
  const minimumBounty = snapshot?.config.minimumBounty ?? 0n;
  const [stage, setStage] = useState<ComposerStage>(1);
  const [values, setValues] = useState<FormValues>(() => parent ? { id: parent.id + "-r1", action: parent.action, objective: parent.objective, policy: parent.policy, evidence: parent.evidenceUrl, recipient: parent.executionRecipient, bounty: formatInput(parent.initialBounty), review: "600", external: "2", credit: "0" } : { id: "", action: "", objective: "", policy: "", evidence: "https://", recipient: "", bounty: "1", review: "600", external: "2", credit: "0" });
  useEffect(() => { if (mode === "commit") setValues((current) => current.id ? current : { ...current, id: "review-" + Date.now().toString(36) }); }, [mode]);
  const setValue = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value, _error: "" }));
  const availability = writeAvailability(wallet);
  const required = useMemo(() => { try { return parseGen(values.bounty, "Bounty") + minimumBond; } catch { return minimumBounty + minimumBond; } }, [minimumBounty, minimumBond, values.bounty]);
  const stageReady = useMemo(() => composerStageReady(stage, values, snapshot?.walletCredit, minimumBounty, minimumBond), [minimumBond, minimumBounty, snapshot?.walletCredit, stage, values]);
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const id = validateIdentifier(values.id, mode === "commit" ? "Proposal ID" : "Revision proposal ID");
      const action = validateText(values.action, "Action", 2000);
      const objective = validateText(values.objective, "Objective", 1200);
      const policy = validateText(values.policy, "Policy", 4000);
      const evidence = validateHttpsUrl(values.evidence);
      const recipient = validateRecipient(values.recipient);
      const bounty = parseGen(values.bounty, "Bounty");
      const review = parseUint(values.review, "Review duration");
      const external = parseGen(values.external, "External GEN");
      const credit = parseGen(values.credit, "Settled credit GEN");
      if (bounty < minimumBounty) throw new DissentValidationError("Bounty must be at least " + formatWei(minimumBounty) + ".");
      if (review < MIN_REVIEW_SECONDS || review > MAX_REVIEW_SECONDS) throw new DissentValidationError("Review duration must be between 60 and 604800 seconds.");
      if (snapshot?.walletCredit !== null && snapshot?.walletCredit !== undefined && credit > snapshot.walletCredit) throw new DissentValidationError("Settled credit exceeds the connected account balance.");
      if (external + credit < bounty + minimumBond) throw new DissentValidationError("Funding must cover bounty plus at least " + formatWei(minimumBond) + " execution bond.");
      const result = await submit({ functionName: mode === "commit" ? "commit" : "revise", args: mode === "commit" ? [id, action, objective, policy, evidence, recipient, bounty, review, credit] : [parent?.id ?? "", id, action, objective, policy, evidence, recipient, bounty, review, credit], value: external });
      if (result?.confirmed) router.push("/reviews/" + encodeURIComponent(id) + "?tx=" + encodeURIComponent(result.hash));
    } catch (error) { setValues((current) => ({ ...current, _error: sanitizeError(error, "validation") })); }
  }
  const title = mode === "commit" ? "Start a review" : "Submit a revision";
  return <div className="dv2-composer"><div className="dv2-page-intro dv2-composer-intro"><SectionMarker number={mode === "commit" ? "02" : "03"} label={mode === "commit" ? "New proposal" : "Revision"} /><div><EditorialLabel>{mode === "commit" ? "Decision / evidence / funding" : "Direct replacement"}</EditorialLabel><h1>{title}.</h1><p>{mode === "commit" ? "Put a decision on record with a funded review." : "Replace " + (parent?.id ?? "the parent proposal") + " with a fresh funded review."}</p></div></div><form className="dv2-composer-form" onSubmit={(event) => void onSubmit(event)} noValidate><div className="dv2-composer-progress" aria-label="Composer progress"><span className={stage === 1 ? "is-active" : ""}>01 Decision</span><span className={stage === 2 ? "is-active" : ""}>02 Evidence</span><span className={stage === 3 ? "is-active" : ""}>03 Funding</span></div><div className="dv2-composer-grid"><div className="dv2-composer-fields">
    {stage === 1 && <fieldset className="dv2-fieldset"><legend>Decision</legend><div className="dv2-field-grid"><Field label={mode === "commit" ? "Proposal ID" : "New proposal ID"} value={values.id} onChange={(value) => setValue("id", value)} placeholder="review-2026-01" hint="A unique label for this on-chain record." /><Field label="Execution recipient" value={values.recipient} onChange={(value) => setValue("recipient", value)} placeholder="0x..." hint="The address credited when the clear gate is executed." /><Field label="Challenge window (seconds)" value={values.review} onChange={(value) => setValue("review", value)} type="number" hint="Example: 600 seconds / 10 minutes." /></div><Field label="Action" value={values.action} onChange={(value) => setValue("action", value)} placeholder="What will the agent do?" hint="Example: publish the approved report." /><Field label="Objective" value={values.objective} onChange={(value) => setValue("objective", value)} placeholder="What outcome is intended?" hint="Example: confirm the source before release." /><Area label="Policy" value={values.policy} onChange={(value) => setValue("policy", value)} placeholder="What must the decision satisfy?" hint="Write the rule validators should apply to the evidence and proposed action." /></fieldset>}
    {stage === 2 && <><Summary title="Decision" rows={[["Proposal ID", values.id], ["Action", values.action], ["Objective", values.objective], ["Policy", values.policy], ["Execution recipient", values.recipient], ["Challenge window", values.review + " seconds"]]} onEdit={() => setStage(1)} /><fieldset className="dv2-fieldset"><legend>Evidence</legend><Field label="Public HTTPS evidence URL" value={values.evidence} onChange={(value) => setValue("evidence", value)} placeholder="https://source.example/record" hint="Use a public HTTPS source validators can inspect. No credentials or fragments." /></fieldset></>}
    {stage === 3 && <><Summary title="Decision" rows={[["Proposal ID", values.id], ["Action", values.action], ["Objective", values.objective], ["Policy", values.policy], ["Execution recipient", values.recipient], ["Challenge window", values.review + " seconds"]]} onEdit={() => setStage(1)} /><Summary title="Evidence" rows={[["Evidence URL", values.evidence]]} onEdit={() => setStage(2)} /><fieldset className="dv2-fieldset"><legend>Funding</legend><div className="dv2-field-grid"><Field label="Review bounty" value={values.bounty} onChange={(value) => setValue("bounty", value)} hint={snapshot ? "Minimum bounty: " + formatMinimumWei(minimumBounty) : "Loading contract minimum"} /><FundingFields values={values} setValue={setValue} /></div></fieldset></>}
    {values._error && <p className="dv2-form-error" role="alert"><CircleAlert size={15} />{values._error}</p>}{availability && <p className="dv2-form-availability"><LockKeyhole size={14} />{availability}</p>}<StageControls stage={stage} setStage={setStage} active={active} transactionLocked={transactionLocked} stageReady={stageReady} submitLabel={mode === "commit" ? "Commit review" : "Submit revision"} /><WriteStatus progress={progress} /></div>{stage === 3 && <FundingSummary values={values} required={snapshot ? required : null} minimumBounty={snapshot ? minimumBounty : null} bond={snapshot ? minimumBond : null} note="External GEN and settled credit are combined before the wallet signs." />}</div></form></div>;
}

export function StartReviewFormV2() { return <ReviewComposerV2 mode="commit" />; }
export function ReviseFormV2({ parent }: { parent: Proposal }) { return <ReviewComposerV2 mode="revise" parent={parent} lockAfterConfirmation={false} />; }

export function ChallengeFormV2({ proposal, lockAfterConfirmation = true }: { proposal: Proposal; lockAfterConfirmation?: boolean }) {
  const { snapshot, wallet } = useDissent();
  const { progress, submit, active, transactionLocked } = useV2Write(undefined, { lockAfterConfirmation });
  const [values, setValues] = useState({ id: proposal.id + "-objection-1", objection: "", evidence: "https://", external: "0.1", credit: "0", error: "" });
  const minimumStake = snapshot?.config.minimumStake ?? 0n;
  const availability = writeAvailability(wallet);
  const setValue = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value, error: "" }));
  async function onSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); try { const id = validateIdentifier(values.id, "Challenge ID"); const objection = validateText(values.objection, "Objection", 2000); const evidence = validateHttpsUrl(values.evidence); const external = parseGen(values.external, "External GEN"); const credit = parseGen(values.credit, "Settled credit GEN"); if (snapshot?.walletCredit !== null && snapshot?.walletCredit !== undefined && credit > snapshot.walletCredit) throw new DissentValidationError("Settled credit exceeds the connected account balance."); if (external + credit < minimumStake) throw new DissentValidationError("Stake must be at least " + formatWei(minimumStake) + "."); await submit({ functionName: "challenge", args: [proposal.id, id, objection, evidence, credit], value: external }); } catch (error) { setValues((current) => ({ ...current, error: sanitizeError(error, "validation") })); } }
  return <form className="dv2-challenge-form" onSubmit={(event) => void onSubmit(event)} noValidate><EditorialLabel>Material objection</EditorialLabel><h3>Challenge this review.</h3><div className="dv2-field-grid"><Field label="Challenge ID" value={values.id} onChange={(value) => setValue("id", value)} /><Field label="Evidence URL" value={values.evidence} onChange={(value) => setValue("evidence", value)} /></div><Area label="Objection" value={values.objection} onChange={(value) => setValue("objection", value)} placeholder="What material flaw should validators inspect?" /><div className="dv2-field-grid"><Field label="External GEN" value={values.external} onChange={(value) => setValue("external", value)} hint={snapshot ? "Minimum challenge stake: " + formatMinimumWei(minimumStake) : "Loading contract minimum"} /><Field label="Settled credit GEN" value={values.credit} onChange={(value) => setValue("credit", value)} /></div>{values.error && <p className="dv2-form-error" role="alert"><CircleAlert size={15} />{values.error}</p>}<button className="dv2-button dv2-button-red" type="submit" disabled={Boolean(availability) || transactionLocked}>{progressLabel(active, transactionLocked, "Submit challenge")}<ArrowUpRight size={15} /></button>{availability && <p className="dv2-form-availability"><LockKeyhole size={14} />{availability}</p>}<WriteStatus progress={progress} /></form>;
}

export function SimpleWriteButtonV2({ functionName, proposalId, label, note, lockAfterConfirmation = true }: { functionName: "adjudicate" | "execute" | "cancel"; proposalId: string; label: string; note: string; lockAfterConfirmation?: boolean }) {
  const { wallet } = useDissent();
  const { progress, submit, active, transactionLocked } = useV2Write(undefined, { lockAfterConfirmation });
  const availability = writeAvailability(wallet);
  return <div className="dv2-simple-write"><button className="dv2-button dv2-button-red" type="button" onClick={() => void submit({ functionName, args: [proposalId], value: 0n })} disabled={Boolean(availability) || transactionLocked}>{progressLabel(active, transactionLocked, label)}<ArrowUpRight size={15} /></button><p>{note}</p>{availability && <span className="dv2-form-availability"><LockKeyhole size={14} />{availability}</span>}<WriteStatus progress={progress} /></div>;
}

export function ProposalActionsV2({ detail }: { detail: ProposalDetail }) {
  const { proposal } = detail;
  const { snapshot, wallet } = useDissent();
  const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  useEffect(() => { const timer = window.setInterval(() => setNow(BigInt(Math.floor(Date.now() / 1000))), 1000); return () => window.clearInterval(timer); }, []);
  const isProposer = Boolean(wallet.address) && wallet.address?.toLowerCase() === proposal.proposer.toLowerCase();
  const afterDeadline = now >= proposal.challengeDeadline;
  const grace = snapshot?.config.cancellationGraceSeconds ?? 604800n;
  const recovery = now >= proposal.challengeDeadline + grace;
  return <section className="dv2-action-rail"><EditorialLabel>Permitted action</EditorialLabel><h2>What happens next?</h2>{proposal.status === "OPEN" && !afterDeadline && !isProposer && <details className="dv2-disclosure"><summary>Challenge this review <ArrowRight size={15} /></summary><ChallengeFormV2 proposal={proposal} lockAfterConfirmation={false} /></details>}{proposal.status === "OPEN" && !afterDeadline && isProposer && <p className="dv2-muted">The proposer cannot challenge its own review.</p>}{proposal.status === "OPEN" && afterDeadline && <SimpleWriteButtonV2 functionName="adjudicate" proposalId={proposal.id} label="Adjudicate review" note="Permissionless after the challenge deadline; validator consensus decides the outcome." lockAfterConfirmation={false} />}{proposal.status === "OPEN" && recovery && <SimpleWriteButtonV2 functionName="cancel" proposalId={proposal.id} label="Recover unresolved escrow" note="Permissionless recovery after the configured grace period; no model or web execution is used." lockAfterConfirmation={false} />}{proposal.status === "REVISE" && isProposer && !proposal.supersededBy && <details className="dv2-disclosure"><summary>Submit a revision <ArrowRight size={15} /></summary><ReviseFormV2 parent={proposal} /></details>}{proposal.status === "REVISE" && !isProposer && !proposal.supersededBy && <p className="dv2-muted">Only the original proposer can create the direct replacement.</p>}{proposal.status === "CLEAR" && detail.canExecute && isProposer && <SimpleWriteButtonV2 functionName="execute" proposalId={proposal.id} label="Execute review gate" note={"Proposer-only. The outstanding bond becomes settled credit for " + proposal.executionRecipient + "."} lockAfterConfirmation={false} />}{proposal.status === "CLEAR" && detail.canExecute && !isProposer && <p className="dv2-muted">Only the proposer can consume this execution gate.</p>}{["BLOCK", "CANCELLED", "EXECUTED"].includes(proposal.status) && <p className="dv2-terminal"><ShieldCheck size={15} />Terminal state. Replay is rejected by the contract.</p>}</section>;
}
export { writeAvailability, useV2Write };
