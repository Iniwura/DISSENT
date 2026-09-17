'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, CircleAlert, LockKeyhole, ShieldCheck, WalletCards, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useDissent, type DissentContextValue } from '@/components/dissent/DissentProvider';
import { formatMinimumWei, shortAddress, validateIdentifier, type Proposal, type ProposalDetail } from '@/lib/dissent/types';
import { DissentValidationError, sanitizeError } from '@/lib/dissent/errors';
import { parseGen, parseUint, U256_MAX, validateHttpsUrl, validateRecipient } from '@/lib/dissent/writes';
import { calculateFundingBreakdown, formatExactGen } from '@/lib/dissent/quick-tests';
import { useV2Write, writeAvailability, WriteStatus } from './ReviewComposerV2';
import { EditorialLabel, SectionMarker } from './Editorial';
import { QuickTestReviewV2 } from './QuickTestReviewV2';

type ComposerStep = 1 | 2 | 3 | 4 | 5;
type DraftKind = 'quick' | 'custom';
type SubmissionMode = 'commit' | 'revise';

type FormValues = {
  id: string;
  recipient: string;
  action: string;
  objective: string;
  policy: string;
  evidence: string;
  review: string;
  durationMode: 'preset' | 'custom';
  customDuration: string;
  durationUnit: 'minutes' | 'hours' | 'days';
  bounty: string;
  external: string;
  credit: string;
  confirm: boolean;
  error: string;
};

const MIN_SECONDS = 60n;
const MAX_SECONDS = 604800n;
const QUICK_DRAFT = {
  action: 'Release the reviewed artifact to its intended audience.',
  objective: 'Confirm the artifact is ready, accurate and safe to release.',
  policy: 'CLEAR when the evidence supports release readiness. REVISE when a material correction is required. BLOCK when release would create an unacceptable risk.',
};
const DURATIONS = [
  ['10 minutes', 600n],
  ['30 minutes', 1800n],
  ['1 hour', 3600n],
  ['6 hours', 21600n],
  ['24 hours', 86400n],
] as const;
const STEPS: { number: ComposerStep; label: string }[] = [
  { number: 1, label: 'Recipient' },
  { number: 2, label: 'Decision' },
  { number: 3, label: 'Rules' },
  { number: 4, label: 'Evidence' },
  { number: 5, label: 'Confirm' },
];

function createReviewId() {
  const date = new Date();
  const stamp = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('');
  const suffix = Math.random().toString(36).slice(2, 7);
  return 'review-' + stamp + '-' + suffix;
}

function inputValue(value: bigint): string {
  const whole = value / 1000000000000000000n;
  const fraction = (value % 1000000000000000000n).toString().padStart(18, '0').replace(/0+$/, '');
  return fraction ? whole + '.' + fraction : whole.toString();
}

function initialValues(mode: SubmissionMode, parent?: Proposal): FormValues {
  if (mode === 'revise' && parent) {
    return {
      id: parent.id + '-r1',
      recipient: parent.executionRecipient,
      action: parent.action,
      objective: parent.objective,
      policy: parent.policy,
      evidence: parent.evidenceUrl,
      review: '600',
      durationMode: 'preset',
      customDuration: '',
      durationUnit: 'minutes',
      bounty: inputValue(parent.initialBounty),
      external: '2',
      credit: '0',
      confirm: false,
      error: '',
    };
  }
  return {
    id: '',
    recipient: '',
    action: '',
    objective: '',
    policy: '',
    evidence: '',
    review: '600',
    durationMode: 'preset',
    customDuration: '',
    durationUnit: 'minutes',
    bounty: '1',
    external: '2',
    credit: '0',
    confirm: false,
    error: '',
  };
}

function Field({ label, value, onChange, placeholder, type = 'text', hint }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; hint?: string }) {
  return <label className='dv2-field'><span>{label}</span><input type={type} value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} />{hint && <small>{hint}</small>}</label>;
}

function Area({ label, value, onChange, placeholder, hint }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; hint?: string }) {
  return <label className='dv2-field dv2-field-area'><span>{label}</span><textarea value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} rows={6} />{hint && <small>{hint}</small>}</label>;
}

function StepIntro({ number, question, explanation }: { number: string; question: string; explanation: string }) {
  return <div className='dv2-compact-step-intro'><EditorialLabel>Step {number} of 05</EditorialLabel><h2>{question}</h2><p>{explanation}</p></div>;
}

function ModePanel({ kind, selected, onSelect }: { kind: DraftKind; selected: boolean; onSelect: () => void }) {
  const quick = kind === 'quick';
  return <button className={'dv2-mode-panel' + (selected ? ' is-selected' : '')} type='button' onClick={onSelect} aria-pressed={selected}><span className='dv2-mode-art' aria-hidden='true'>{quick ? <svg viewBox='0 0 160 100' role='presentation'><rect x='12' y='14' width='92' height='64' fill='none' stroke='currentColor' /><path d='M28 31h58M28 44h45M28 58h27' /><path d='M116 20l27 14-27 14z' fill='currentColor' /></svg> : <svg viewBox='0 0 160 100' role='presentation'><path d='M18 78V22h124v56z' fill='none' stroke='currentColor' /><path d='M18 38h124M42 22v56M89 38v40' /><circle cx='117' cy='61' r='12' fill='currentColor' /><path d='M111 61l4 4 8-9' stroke='var(--dv2-paper)' /></svg>}</span><span className='dv2-mode-copy'><EditorialLabel>{quick ? 'Quick test review' : 'Custom review'}</EditorialLabel><strong>{quick ? 'Start with a release-readiness example.' : 'Write your own decision and review rules.'}</strong><small>{quick ? 'Action, objective and policy begin as editable drafts. You supply the recipient, evidence, duration and funding.' : 'Begin with a blank decision record and define what reviewers should inspect.'}</small></span><span className='dv2-mode-select'>{selected ? <Check size={15} /> : 'Select'}</span></button>;
}

function ModeEntry({ selected, onSelect }: { selected: DraftKind | null; onSelect: (kind: DraftKind) => void }) {
  return <section className='dv2-builder-entry'><div className='dv2-entry-heading'><EditorialLabel>New review</EditorialLabel><h1>Create a review.</h1><p>Choose a starting point. Both options remain editable drafts until you approve the final wallet request.</p></div><div className='dv2-mode-grid'><ModePanel kind='quick' selected={selected === 'quick'} onSelect={() => onSelect('quick')} /><ModePanel kind='custom' selected={selected === 'custom'} onSelect={() => onSelect('custom')} /></div></section>;
}

function Progress({ step, transactionLocked, setStep }: { step: ComposerStep; transactionLocked: boolean; setStep: (step: ComposerStep) => void }) {
  return <nav className='dv2-builder-progress' aria-label='Review steps'>{STEPS.map(item => <button key={item.number} type='button' className={item.number === step ? 'is-current' : item.number < step ? 'is-complete' : ''} onClick={() => item.number <= step && setStep(item.number)} disabled={transactionLocked && item.number !== step} aria-current={item.number === step ? 'step' : undefined}><span>0{item.number}</span><strong>{item.label}</strong></button>)}</nav>;
}

function durationFromCustom(value: string, unit: string): bigint | null {
  try {
    const amount = parseUint(value, 'Custom duration');
    const multiplier = unit === 'days' ? 86400n : unit === 'hours' ? 3600n : 60n;
    const seconds = amount * multiplier;
    return seconds <= U256_MAX ? seconds : null;
  } catch {
    return null;
  }
}

function DurationPicker({ values, update }: { values: FormValues; update: (next: Partial<FormValues>) => void }) {
  const exact = values.durationMode === 'custom' ? durationFromCustom(values.customDuration, values.durationUnit) : (() => { try { return parseUint(values.review, 'Review duration'); } catch { return null; } })();
  return <div className='dv2-duration-picker'><div className='dv2-duration-options' role='group' aria-label='Challenge duration presets'>{DURATIONS.map(([label, seconds]) => <button key={label} type='button' className={values.durationMode !== 'custom' && values.review === seconds.toString() ? 'is-selected' : ''} aria-pressed={values.durationMode !== 'custom' && values.review === seconds.toString()} onClick={() => update({ review: seconds.toString(), durationMode: 'preset' })}>{label}</button>)}<button type='button' className={values.durationMode === 'custom' ? 'is-selected' : ''} aria-pressed={values.durationMode === 'custom'} onClick={() => update({ durationMode: 'custom' })}>Custom</button></div>{values.durationMode === 'custom' && <div className='dv2-custom-duration'><Field label='Amount' value={values.customDuration} onChange={value => update({ customDuration: value, review: durationFromCustom(value, values.durationUnit)?.toString() ?? '' })} type='number' placeholder='15' /><label className='dv2-field'><span>Unit</span><select value={values.durationUnit} onChange={event => { const unit = event.target.value as FormValues['durationUnit']; update({ durationUnit: unit, review: durationFromCustom(values.customDuration, unit)?.toString() ?? '' }); }}><option value='minutes'>Minutes</option><option value='hours'>Hours</option><option value='days'>Days</option></select></label></div>}<p className={exact === null ? 'dv2-duration-result is-invalid' : 'dv2-duration-result'}>{exact === null ? 'Enter a duration to see the exact contract value.' : <>Recorded as <strong>{exact.toString()} seconds</strong></>}</p></div>;
}

function Summary({ title, rows, onEdit }: { title: string; rows: [string, string][]; onEdit: () => void }) {
  return <section className='dv2-form-summary'><div><EditorialLabel>{title}</EditorialLabel><button className='dv2-text-button' type='button' onClick={onEdit}>Edit</button></div><dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value.trim() || 'Not entered'}</dd></div>)}</dl></section>;
}

function SupportPanel({ confirm, values, minimumBounty, minimumBond }: { confirm: boolean; values: FormValues; minimumBounty: bigint | null; minimumBond: bigint | null }) {
  if (!confirm) return <aside className='dv2-builder-support dv2-builder-support-dark'><EditorialLabel>What happens next</EditorialLabel><h2>Review, then decide.</h2><ol><li><b>01</b><span>Publish a funded review.</span></li><li><b>02</b><span>Others can challenge during the window.</span></li><li><b>03</b><span>GenLayer records the review outcome.</span></li><li><b>04</b><span>Permitted execution or recovery follows the contract rules.</span></li></ol></aside>;
  let bounty = 'Not set';
  let bond = 'Not set';
  let external = 'Not set';
  let credit = 'Not set';
  let escrow = 'Not set';
  try {
    const parsedBounty = parseGen(values.bounty, 'Bounty');
    const parsedExternal = parseGen(values.external, 'External GEN');
    const parsedCredit = parseGen(values.credit, 'Settled credit GEN');
    const breakdown = calculateFundingBreakdown({ bounty: parsedBounty, external: parsedExternal, credit: parsedCredit, minimumBond: minimumBond ?? 0n });
    bounty = formatExactGen(breakdown.actualBounty);
    bond = breakdown.actualExecutionBond === null ? 'Funding required' : formatExactGen(breakdown.actualExecutionBond);
    external = formatExactGen(breakdown.externalGen);
    credit = formatExactGen(breakdown.settledCredit);
    escrow = formatExactGen(breakdown.totalEscrow);
  } catch {}
  return <aside className='dv2-builder-support dv2-builder-support-dark'><EditorialLabel>Funding summary</EditorialLabel><h2>Before the wallet request.</h2><dl className='dv2-support-ledger'><div><dt>Actual bounty</dt><dd>{bounty}</dd></div><div><dt>Actual execution bond</dt><dd>{bond}</dd></div><div><dt>Settled credit applied</dt><dd>{credit}</dd></div><div><dt>External GEN sent</dt><dd>{external}</dd></div><div><dt>Total escrow</dt><dd>{escrow}</dd></div><div><dt>Protocol minimum bounty</dt><dd>{minimumBounty === null ? 'Loading' : formatMinimumWei(minimumBounty)}</dd></div><div><dt>Protocol minimum bond</dt><dd>{minimumBond === null ? 'Loading' : formatMinimumWei(minimumBond)}</dd></div></dl><p>Network fees are quoted separately by GenLayer and are not part of the review escrow.</p></aside>;
}

function stageReady(step: ComposerStep, values: FormValues, dissent: DissentContextValue): boolean {
  try {
    const id = validateIdentifier(values.id, 'Review ID');
    validateRecipient(values.recipient);
    if (!dissent.snapshot || dissent.snapshot.proposalIds.includes(id)) return false;
    if (step >= 2 && (!values.action.trim() || values.action.trim().length > 2000 || !values.objective.trim() || values.objective.trim().length > 1200)) return false;
    if (step >= 3 && (!values.policy.trim() || values.policy.trim().length > 4000)) return false;
    if (step >= 4) {
      validateHttpsUrl(values.evidence);
      const seconds = values.durationMode === 'custom' ? durationFromCustom(values.customDuration, values.durationUnit) : parseUint(values.review, 'Review duration');
      if (seconds === null || seconds < MIN_SECONDS || seconds > MAX_SECONDS) return false;
    }
    if (step < 5) return true;
    const bounty = parseGen(values.bounty, 'Bounty');
    const external = parseGen(values.external, 'External GEN');
    const credit = parseGen(values.credit, 'Settled credit GEN');
    const { minimumBounty, minimumExecutionBond } = dissent.snapshot.config;
    if (credit > 0n && (dissent.snapshot.walletCredit === null || dissent.snapshot.walletCredit === undefined || credit > dissent.snapshot.walletCredit)) return false;
    return bounty >= minimumBounty && external <= U256_MAX - credit && external + credit >= bounty + minimumExecutionBond && values.confirm && !writeAvailability(dissent.wallet);
  } catch {
    return false;
  }
}

export function ReviewBuilderV2({ mode, parent, initialKind, onBackToEntry, lockAfterConfirmation = true }: { mode: SubmissionMode; parent?: Proposal; initialKind?: DraftKind; onBackToEntry?: () => void; lockAfterConfirmation?: boolean }) {
  const dissent = useDissent();
  const { snapshot, wallet } = dissent;
  const router = useRouter();
  const navigateAfterConfirmation = useCallback((reviewId: string) => {
    router.push("/reviews/" + encodeURIComponent(reviewId));
  }, [router]);
  const { progress, submit, active, transactionLocked } = useV2Write(navigateAfterConfirmation, { lockAfterConfirmation });
  const seededId = useRef(mode === 'revise');
  const [step, setStep] = useState<ComposerStep>(1);
  const [selected, setSelected] = useState<DraftKind | null>(mode === 'revise' ? 'custom' : initialKind ?? null);
  const [editingId, setEditingId] = useState(false);
  const [values, setValues] = useState<FormValues>(() => initialValues(mode, parent));
  const minimumBounty = snapshot?.config.minimumBounty ?? null;
  const minimumBond = snapshot?.config.minimumExecutionBond ?? null;
  const availability = writeAvailability(wallet);

  useEffect(() => {
    if (mode === 'commit' && !seededId.current && !values.id) {
      seededId.current = true;
      setValues(current => current.id ? current : { ...current, id: createReviewId() });
    }
  }, [mode, values.id]);

  const setValue = (key: keyof FormValues, value: string | boolean) => setValues(current => ({ ...current, [key]: value, error: '' }));
  const updateValues = (next: Partial<FormValues>) => setValues(current => ({ ...current, ...next, error: '' }));
  const duplicate = Boolean(snapshot?.proposalIds.includes(values.id.trim()));
  const recipientMessage = !values.recipient.trim() ? 'Add the address that should receive a permitted execution.' : (() => { try { return 'Confirmed recipient ' + shortAddress(validateRecipient(values.recipient)); } catch (error) { return sanitizeError(error, 'validation'); } })();
  const fundingBreakdown = useMemo(() => { try { return calculateFundingBreakdown({ bounty: parseGen(values.bounty, 'Bounty'), external: parseGen(values.external, 'External GEN'), credit: parseGen(values.credit, 'Settled credit GEN'), minimumBond: minimumBond ?? 0n }); } catch { return null; } }, [minimumBond, values.bounty, values.credit, values.external]);
  const ready = stageReady(step, values, dissent);

  const chooseMode = (kind: DraftKind) => {
    if (kind === 'quick' && onBackToEntry) {
      onBackToEntry();
      return;
    }
    setSelected(kind);
    if (kind === 'quick') updateValues({ action: values.action.trim() ? values.action : QUICK_DRAFT.action, objective: values.objective.trim() ? values.objective : QUICK_DRAFT.objective, policy: values.policy.trim() ? values.policy : QUICK_DRAFT.policy });
    setStep(1);
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const id = validateIdentifier(values.id, mode === 'commit' ? 'Review ID' : 'Revision review ID');
      const recipient = validateRecipient(values.recipient);
      const action = values.action.trim();
      const objective = values.objective.trim();
      const policy = values.policy.trim();
      const evidence = validateHttpsUrl(values.evidence);
      const bounty = parseGen(values.bounty, 'Bounty');
      const review = values.durationMode === 'custom' ? durationFromCustom(values.customDuration, values.durationUnit) : parseUint(values.review, 'Review duration');
      const external = parseGen(values.external, 'External GEN');
      const credit = parseGen(values.credit, 'Settled credit GEN');
      if (snapshot?.proposalIds.includes(id)) throw new DissentValidationError('Review ID is already in the registry.');
      if (!action || action.length > 2000) throw new DissentValidationError('Action is required and must be 2,000 characters or fewer.');
      if (!objective || objective.length > 1200) throw new DissentValidationError('Intended outcome is required and must be 1,200 characters or fewer.');
      if (!policy || policy.length > 4000) throw new DissentValidationError('Rules are required and must be 4,000 characters or fewer.');
      if (review === null || review < MIN_SECONDS || review > MAX_SECONDS) throw new DissentValidationError('Challenge duration must be between 60 and 604800 seconds.');
      if (bounty < (minimumBounty ?? 0n)) throw new DissentValidationError('Bounty must meet the deployed contract minimum.');
      if (snapshot?.walletCredit !== null && snapshot?.walletCredit !== undefined && credit > snapshot.walletCredit) throw new DissentValidationError('Settled credit exceeds the connected account balance.');
      if (external > U256_MAX - credit || external + credit < bounty + (minimumBond ?? 0n)) throw new DissentValidationError('External GEN and settled credit must cover the bounty and execution bond.');
      if (!values.confirm) throw new DissentValidationError('Confirm the review and funding before publishing.');
      await submit({ functionName: mode, args: mode === 'commit' ? [id, action, objective, policy, evidence, recipient, bounty, review, credit] : [parent?.id ?? '', id, action, objective, policy, evidence, recipient, bounty, review, credit], value: external });
    } catch (error) {
      setValues(current => ({ ...current, error: sanitizeError(error, 'validation') }));
    }
  }

  if (mode === 'commit' && selected === null) return <ModeEntry selected={selected} onSelect={chooseMode} />;
  const question = step === 1 ? 'Who should receive the gated execution?' : step === 2 ? 'What action should be reviewed?' : step === 3 ? 'What makes this action acceptable?' : step === 4 ? 'What should reviewers inspect?' : 'Ready to fund and publish?';
  const explanation = step === 1 ? 'Choose the destination now; drafting does not require a wallet connection.' : step === 2 ? 'State the action and the intended outcome in plain language.' : step === 3 ? 'Give validators one clear, editable rule for CLEAR, REVISE or BLOCK.' : step === 4 ? 'Anchor the review to public evidence and choose the challenge window.' : 'Check the complete record and funding before the explicit wallet request.';
  const stepBody = step === 1 ? <><div className='dv2-recipient-field'><Field label='Wallet address' value={values.recipient} onChange={value => setValue('recipient', value)} placeholder='0x...' /><button className='dv2-inline-control' type='button' onClick={() => wallet.address && setValue('recipient', wallet.address)} disabled={!wallet.address}><WalletCards size={14} />Use connected wallet</button><p className={recipientMessage.startsWith('Confirmed') ? 'dv2-inline-validation' : 'dv2-inline-validation is-error'}>{recipientMessage}</p></div><div className='dv2-id-control'>{editingId ? <Field label='Review ID' value={values.id} onChange={value => setValue('id', value)} hint='Must be unique in the deployed registry.' /> : <><span>Review ID</span><strong>{values.id || 'Generating a review ID...'}</strong><button className='dv2-text-button' type='button' onClick={() => setEditingId(true)}>Edit review ID</button></>}</div>{duplicate && <p className='dv2-inline-validation is-error'>This review ID is already in the registry.</p>}</> : step === 2 ? <><Field label='Action' value={values.action} onChange={value => setValue('action', value)} placeholder='Approve the release of the reviewed artifact.' hint='Example: release, authorize or publish a specific action.' /><Field label='Intended outcome' value={values.objective} onChange={value => setValue('objective', value)} placeholder='The artifact is accurate, safe and ready for its audience.' hint='What should a successful decision protect?' /><p className='dv2-field-examples'><span>Examples</span>Release a report; authorize an agent action; publish a governance decision.</p></> : step === 3 ? <><Area label='Review rules' value={values.policy} onChange={value => setValue('policy', value)} placeholder='CLEAR when... REVISE when... BLOCK when...' hint='Keep the acceptance rule specific to the action and evidence.' /><details className='dv2-policy-guidance'><summary>Show CLEAR / REVISE / BLOCK guidance</summary><div><p><strong>CLEAR</strong> when the evidence supports the action.</p><p><strong>REVISE</strong> when a material correction is needed.</p><p><strong>BLOCK</strong> when the action conflicts with evidence or constraints.</p><button type='button' onClick={() => setValue('policy', QUICK_DRAFT.policy)}>Use editable quick-test policy</button></div></details></> : step === 4 ? <><div className='dv2-evidence-field'><Field label='Public HTTPS evidence URL' value={values.evidence} onChange={value => setValue('evidence', value)} placeholder='https://source.example/record' hint='Use a public HTTPS source. No credentials or fragments.' />{values.evidence.trim() && (() => { try { const url = validateHttpsUrl(values.evidence); return <a className='dv2-evidence-preview' href={url} target='_blank' rel='noopener noreferrer'><span>HTTPS URL format checked</span><strong>{url}</strong><ArrowUpRight size={14} /></a>; } catch { return <p className='dv2-inline-validation is-error'>Enter a valid HTTPS evidence URL.</p>; } })()}</div><div className='dv2-duration-block'><EditorialLabel>Challenge duration</EditorialLabel><p className='dv2-field-lead'>How long should the market have to raise a material objection?</p><DurationPicker values={values} update={updateValues} /></div></> : <><Summary title='Review record' rows={[['Review ID', values.id], ['Recipient', values.recipient], ['Action', values.action], ['Intended outcome', values.objective], ['Rules', values.policy], ['Evidence', values.evidence], ['Challenge duration', values.review + ' seconds']]} onEdit={() => setStep(1)} /><div className='dv2-confirm-funding'><div className='dv2-confirm-heading'><EditorialLabel>Funding</EditorialLabel><button className='dv2-text-button' type='button' onClick={() => setStep(5)}>Edit</button></div><dl><div><dt>Review bounty</dt><dd>{fundingBreakdown ? formatExactGen(fundingBreakdown.actualBounty) : 'Not entered'}</dd></div><div><dt>Actual execution bond</dt><dd>{fundingBreakdown?.actualExecutionBond === null ? 'Funding required' : fundingBreakdown ? formatExactGen(fundingBreakdown.actualExecutionBond) : 'Loading'}</dd></div><div><dt>Settled credit applied</dt><dd>{fundingBreakdown ? formatExactGen(fundingBreakdown.settledCredit) : 'Not entered'}</dd></div><div><dt>External GEN</dt><dd>{fundingBreakdown ? formatExactGen(fundingBreakdown.externalGen) : 'Not entered'}</dd></div><div><dt>Total escrow</dt><dd>{fundingBreakdown ? formatExactGen(fundingBreakdown.totalEscrow) : 'Loading'}</dd></div><div><dt>Protocol minimums</dt><dd>{minimumBounty === null || minimumBond === null ? 'Loading' : formatMinimumWei(minimumBounty) + ' bounty / ' + formatMinimumWei(minimumBond) + ' bond'}</dd></div></dl><div className='dv2-funding-inputs'><Field label='Bounty (GEN)' value={values.bounty} onChange={value => setValue('bounty', value)} hint={minimumBounty === null ? 'Loading contract minimum' : 'Minimum ' + formatMinimumWei(minimumBounty)} /><Field label='Settled credit (GEN)' value={values.credit} onChange={value => setValue('credit', value)} hint='Reusable Dissent credit.' /><Field label='External GEN' value={values.external} onChange={value => setValue('external', value)} hint='Wallet value sent with the write.' /></div><label className='dv2-confirmation'><input type='checkbox' checked={values.confirm} onChange={event => setValue('confirm', event.target.checked)} /><span>I have reviewed the record and funding. Ask my wallet to approve only after I click publish.</span></label>{availability && <p className='dv2-form-availability'><LockKeyhole size={14} />{availability}</p>}</div></>;
  return <div className='dv2-composer dv2-composer-compact'><div className='dv2-page-intro dv2-composer-intro'><SectionMarker number={mode === 'commit' ? '02' : '03'} label={mode === 'commit' ? 'New review' : 'Revision'} /><div><EditorialLabel>{selected === 'quick' ? 'Quick test review' : 'Custom review'}</EditorialLabel><h1>{mode === 'commit' ? 'Create a review.' : 'Submit a revision.'}</h1></div></div><form className='dv2-composer-form dv2-compact-form' onSubmit={event => void onSubmit(event)} noValidate><Progress step={step} transactionLocked={transactionLocked} setStep={setStep} /><div className='dv2-builder-layout'><div className='dv2-builder-main'><StepIntro number={'0' + step} question={question} explanation={explanation} /><div className='dv2-step-fields'>{stepBody}</div>{values.error && <p className='dv2-form-error' role='alert'><CircleAlert size={15} />{values.error}</p>}<div className='dv2-stage-controls'><button className='dv2-text-button' type='button' onClick={() => step === 1 ? (mode === 'commit' ? (onBackToEntry ? onBackToEntry() : setSelected(null)) : undefined) : setStep((step - 1) as ComposerStep)} disabled={transactionLocked}><ArrowLeft size={15} />{step === 1 && mode === 'commit' ? 'Change starting point' : 'Back'}</button>{step < 5 ? <button className='dv2-button dv2-button-red' type='button' onClick={() => setStep((step + 1) as ComposerStep)} disabled={!ready || transactionLocked}>Continue <ArrowRight size={15} /></button> : <button className='dv2-button dv2-button-red' type='submit' disabled={!ready || transactionLocked || Boolean(availability)}>{active ? 'Transaction in progress' : transactionLocked ? 'Confirmed' : 'Fund and publish review'} <ArrowUpRight size={15} /></button>}</div>{progress.phase !== 'idle' && <WriteStatus progress={progress} />}</div><SupportPanel confirm={step === 5} values={values} minimumBounty={minimumBounty} minimumBond={minimumBond} /></div></form></div>;
}

export function StartReviewFormV2() {
  const [kind, setKind] = useState<DraftKind | null>(null);
  if (kind === 'quick') return <QuickTestReviewV2 onBack={() => setKind(null)} />;
  if (kind === 'custom') return <ReviewBuilderV2 mode='commit' initialKind='custom' onBackToEntry={() => setKind(null)} />;
  return <ModeEntry selected={kind} onSelect={setKind} />;
}
export function ReviseFormV2({ parent }: { parent: Proposal }) { return <ReviewBuilderV2 mode='revise' parent={parent} lockAfterConfirmation={false} />; }

function ChallengeCountdown({ deadline, now }: { deadline: bigint; now: bigint }) {
  const remaining = deadline > now ? deadline - now : 0n;
  if (remaining === 0n) return <section className='dv2-challenge-countdown is-closed' aria-label='Challenge window closed'><EditorialLabel>Challenge window</EditorialLabel><strong>Challenge window closed</strong></section>;
  const days = remaining / 86400n;
  const hours = (remaining % 86400n) / 3600n;
  const minutes = (remaining % 3600n) / 60n;
  const seconds = remaining % 60n;
  return <section className='dv2-challenge-countdown' aria-label={days + ' days, ' + hours + ' hours, ' + minutes + ' minutes, ' + seconds + ' seconds remaining'}><EditorialLabel>Challenge window</EditorialLabel><div className='dv2-countdown-digits'><span><strong>{padCountdown(days)}</strong><small>days</small></span><span><strong>{padCountdown(hours)}</strong><small>hours</small></span><span><strong>{padCountdown(minutes)}</strong><small>minutes</small></span><span><strong>{padCountdown(seconds)}</strong><small>seconds</small></span></div></section>;
}
function padCountdown(value: bigint) { return value.toString().padStart(2, '0'); }

function ChallengeDialogV2({ proposal }: { proposal: Proposal }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => closeRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); return; }
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current ? Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href]')) : [];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', onKeyDown);
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
  const close = () => setOpen(false);
  return <><button ref={triggerRef} className='dv2-button dv2-button-red dv2-challenge-trigger' type='button' onClick={() => setOpen(true)} aria-haspopup='dialog' aria-expanded={open}>Challenge this review <ArrowRight size={15} /></button><div className='dv2-dialog-backdrop' hidden={!open} onMouseDown={event => { if (event.target === event.currentTarget) close(); }}><div ref={dialogRef} className='dv2-dialog' role='dialog' aria-modal='true' aria-labelledby={titleId} onMouseDown={event => event.stopPropagation()}><div className='dv2-dialog-head'><div><EditorialLabel>Material objection</EditorialLabel><h2 id={titleId}>Challenge this review.</h2></div><button ref={closeRef} className='dv2-dialog-close' type='button' onClick={close} aria-label='Close challenge form'><X size={17} /></button></div><ChallengeFormV2 proposal={proposal} lockAfterConfirmation={false} /></div></div></>;
}
export function ChallengeFormV2({ proposal, lockAfterConfirmation = true }: { proposal: Proposal; lockAfterConfirmation?: boolean }) {
  const dissent = useDissent();
  const { snapshot, wallet } = dissent;
  const { progress, submit, active, transactionLocked } = useV2Write(undefined, { lockAfterConfirmation });
  const [values, setValues] = useState({ id: proposal.id + '-objection-1', objection: '', evidence: '', external: '0.1', credit: '0', error: '' });
  const minimumStake = snapshot?.config.minimumStake ?? 0n;
  const availability = writeAvailability(wallet);
  const setValue = (key: keyof typeof values, value: string) => setValues(current => ({ ...current, [key]: value, error: '' }));
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const id = validateIdentifier(values.id, 'Challenge ID');
      const objection = values.objection.trim();
      const evidence = validateHttpsUrl(values.evidence);
      const external = parseGen(values.external, 'External GEN');
      const credit = parseGen(values.credit, 'Settled credit GEN');
      if (!objection || objection.length > 2000) throw new DissentValidationError('Objection is required and must be 2,000 characters or fewer.');
      if (snapshot?.walletCredit !== null && snapshot?.walletCredit !== undefined && credit > snapshot.walletCredit) throw new DissentValidationError('Settled credit exceeds the connected account balance.');
      if (external + credit < minimumStake) throw new DissentValidationError('Stake must meet the contract minimum.');
      await submit({ functionName: 'challenge', args: [proposal.id, id, objection, evidence, credit], value: external });
    } catch (error) {
      setValues(current => ({ ...current, error: sanitizeError(error, 'validation') }));
    }
  }
  return <form className='dv2-challenge-form' onSubmit={event => void onSubmit(event)} noValidate><EditorialLabel>Material objection</EditorialLabel><h3>Challenge this review.</h3><div className='dv2-field-grid'><Field label='Challenge ID' value={values.id} onChange={value => setValue('id', value)} /><Field label='Evidence URL' value={values.evidence} onChange={value => setValue('evidence', value)} /></div><Area label='Objection' value={values.objection} onChange={value => setValue('objection', value)} placeholder='What material flaw should validators inspect?' /><div className='dv2-field-grid'><Field label='External GEN' value={values.external} onChange={value => setValue('external', value)} hint={'Minimum challenge stake: ' + formatMinimumWei(minimumStake)} /><Field label='Settled credit GEN' value={values.credit} onChange={value => setValue('credit', value)} /></div>{values.error && <p className='dv2-form-error' role='alert'><CircleAlert size={15} />{values.error}</p>}<button className='dv2-button dv2-button-red' type='submit' disabled={Boolean(availability) || transactionLocked}>{active ? 'Transaction in progress' : transactionLocked ? 'Confirmed' : 'Submit challenge'}<ArrowUpRight size={15} /></button>{availability && <p className='dv2-form-availability'><LockKeyhole size={14} />{availability}</p>}{progress.phase !== 'idle' && <div className='dv2-write-progress' role={progress.phase === 'failed' ? 'alert' : 'status'}><span>{progress.phase === 'failed' ? progress.error ?? 'Something went wrong. Please try again.' : progress.phase}</span></div>}</form>;
}

export function SimpleWriteButtonV2({ functionName, proposalId, label, note, lockAfterConfirmation = true }: { functionName: 'adjudicate' | 'execute' | 'cancel'; proposalId: string; label: string; note: string; lockAfterConfirmation?: boolean }) {
  const { wallet } = useDissent();
  const { progress, submit, active, transactionLocked } = useV2Write(undefined, { lockAfterConfirmation });
  const availability = writeAvailability(wallet);
  return <div className='dv2-simple-write'><button className='dv2-button dv2-button-red' type='button' onClick={() => void submit({ functionName, args: [proposalId], value: 0n })} disabled={Boolean(availability) || transactionLocked}>{active ? 'Transaction in progress' : transactionLocked ? 'Confirmed' : label}<ArrowUpRight size={15} /></button><p>{note}</p>{availability && <span className='dv2-form-availability'><LockKeyhole size={14} />{availability}</span>}{progress.phase !== 'idle' && <div className='dv2-write-progress' role={progress.phase === 'failed' ? 'alert' : 'status'}><span>{progress.phase === 'failed' ? progress.error ?? 'Something went wrong. Please try again.' : progress.phase}</span></div>}</div>;
}

export function ProposalActionsV2({ detail }: { detail: ProposalDetail }) {
  const { proposal } = detail;
  const { snapshot, wallet } = useDissent();
  const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  useEffect(() => { const timer = window.setInterval(() => setNow(BigInt(Math.floor(Date.now() / 1000))), 1000); return () => window.clearInterval(timer); }, []);
  const proposer = Boolean(wallet.address) && wallet.address?.toLowerCase() === proposal.proposer.toLowerCase();
  const afterDeadline = now >= proposal.challengeDeadline;
  const recovery = now >= proposal.challengeDeadline + (snapshot?.config.cancellationGraceSeconds ?? 604800n);
  return <section className='dv2-action-rail'><EditorialLabel>Permitted action</EditorialLabel><h2>What happens next?</h2><ChallengeCountdown deadline={proposal.challengeDeadline} now={now} />{proposal.status === 'OPEN' && !afterDeadline && !proposer && <ChallengeDialogV2 proposal={proposal} />}{proposal.status === 'OPEN' && !afterDeadline && proposer && <p className='dv2-muted'>The proposer cannot challenge its own review.</p>}{proposal.status === 'OPEN' && afterDeadline && <SimpleWriteButtonV2 functionName='adjudicate' proposalId={proposal.id} label='Adjudicate review' note='Permissionless after the challenge deadline; validator consensus decides the outcome.' lockAfterConfirmation={false} />}{proposal.status === 'OPEN' && recovery && <SimpleWriteButtonV2 functionName='cancel' proposalId={proposal.id} label='Recover unresolved escrow' note='Permissionless recovery after the configured grace period; no model or web execution is used.' lockAfterConfirmation={false} />}{proposal.status === 'REVISE' && proposer && !proposal.supersededBy && <details className='dv2-disclosure'><summary>Submit a revision <ArrowRight size={15} /></summary><ReviseFormV2 parent={proposal} /></details>}{proposal.status === 'REVISE' && !proposer && !proposal.supersededBy && <p className='dv2-muted'>Only the original proposer can create the direct replacement.</p>}{proposal.status === 'CLEAR' && detail.canExecute && proposer && <SimpleWriteButtonV2 functionName='execute' proposalId={proposal.id} label='Execute review gate' note={'Proposer-only. The outstanding bond becomes settled credit for ' + proposal.executionRecipient + '.'} lockAfterConfirmation={false} />}{proposal.status === 'CLEAR' && detail.canExecute && !proposer && <p className='dv2-muted'>Only the proposer can consume this execution gate.</p>}{['BLOCK', 'CANCELLED', 'EXECUTED'].includes(proposal.status) && <p className='dv2-terminal'><ShieldCheck size={15} />Terminal state. Replay is rejected by the contract.</p>}</section>;
}
