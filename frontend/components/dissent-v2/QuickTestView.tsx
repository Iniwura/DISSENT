'use client';

import { ArrowLeft, ArrowUpRight, CircleAlert, LockKeyhole, WalletCards } from 'lucide-react';
import type { FormEvent } from 'react';
import type { DissentContextValue } from '@/components/dissent/DissentProvider';
import { formatMinimumWei } from '@/lib/dissent/types';
import type { FundingBreakdown, QuickTestScenario } from '@/lib/dissent/quick-tests';
import type { WriteProgress } from '@/lib/dissent/writes';
import { EditorialLabel, SectionMarker } from './Editorial';
import { QuickDuration, QuickField, QuickFundingSummary, QuickScenarioList, type QuickValues } from './QuickTestParts';

export function QuickTestView({
  scenario,
  scenarioSlug,
  setScenarioSlug,
  values,
  update,
  evidenceUrl,
  snapshot,
  wallet,
  availability,
  blockedReason,
  minimumBounty,
  minimumBond,
  funding,
  validRecipient,
  progress,
  active,
  transactionLocked,
  ready,
  onSubmit,
  onBack,
}: {
  scenario: QuickTestScenario;
  scenarioSlug: QuickTestScenario['slug'];
  setScenarioSlug: (slug: QuickTestScenario['slug']) => void;
  values: QuickValues;
  update: (next: Partial<QuickValues>) => void;
  evidenceUrl: string | null;
  snapshot: DissentContextValue['snapshot'];
  wallet: DissentContextValue['wallet'];
  availability: string | null;
  blockedReason: string | null;
  minimumBounty: bigint | null;
  minimumBond: bigint | null;
  funding: FundingBreakdown | null;
  validRecipient: boolean;
  progress: WriteProgress;
  active: boolean;
  transactionLocked: boolean;
  ready: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onBack: () => void;
}) {
  return <div className='dv2-composer dv2-composer-compact dv2-quick-test'>
    <div className='dv2-page-intro dv2-composer-intro'><SectionMarker number='02' label='Quick test' /><div><EditorialLabel>Fictional demonstration scenarios</EditorialLabel><h1>Quick test review.</h1><p>Choose a prepared example, add a recipient and publish only after reviewing the final funding request.</p></div></div>
    <form className='dv2-quick-layout' onSubmit={event => void onSubmit(event)} noValidate>
      <div className='dv2-quick-main'>
        <section className='dv2-quick-section'><EditorialLabel>01 / Example</EditorialLabel><h2>Which fictional case should we stage?</h2><QuickScenarioList selected={scenarioSlug} onSelect={setScenarioSlug} /></section>
        <section className='dv2-quick-section'><EditorialLabel>02 / Recipient and timing</EditorialLabel><h2>Where should the gated execution be credited?</h2><div className='dv2-quick-recipient'><QuickField label='Wallet address' value={values.recipient} onChange={recipient => update({ recipient })} placeholder='0x...' /><button className='dv2-inline-control' type='button' onClick={() => wallet.address && update({ recipient: wallet.address })} disabled={!wallet.address}><WalletCards size={14} />Use connected wallet</button><p className={'dv2-inline-validation' + (validRecipient ? '' : ' is-error')}>{validRecipient ? 'Recipient address is valid.' : 'Add a valid 20-byte address.'}</p></div><div className='dv2-quick-duration-block'><EditorialLabel>Challenge duration</EditorialLabel><QuickDuration values={values} update={update} /></div></section>
        <section className='dv2-quick-section'><details className='dv2-quick-details'><summary>View review details</summary><dl><div><dt>Review ID</dt><dd className='dv2-mono'>{values.id || 'Generating...'}</dd></div><div><dt>Action</dt><dd>{scenario.action}</dd></div><div><dt>Objective</dt><dd>{scenario.objective}</dd></div><div><dt>Policy</dt><dd>{scenario.policy}</dd></div><div><dt>Matching evidence</dt><dd>{evidenceUrl ? <a href={evidenceUrl} target='_blank' rel='noopener noreferrer'>{evidenceUrl}</a> : 'No public HTTPS evidence origin is configured.'}</dd></div></dl></details>{!evidenceUrl && <p className='dv2-quick-blocker' role='status'><CircleAlert size={15} />A public HTTPS origin for the matching evidence pages is not configured. Local drafting works, but live publishing is blocked until one is supplied.</p>}</section>
        <section className='dv2-quick-section'><details className='dv2-quick-details'><summary>Adjust funding</summary><div className='dv2-funding-inputs'><QuickField label='Bounty (GEN)' value={values.bounty} onChange={bounty => update({ bounty })} hint={minimumBounty === null ? 'Loading contract minimum' : 'Minimum ' + formatMinimumWei(minimumBounty)} /><QuickField label='Settled credit (GEN)' value={values.credit} onChange={credit => update({ credit })} hint='Reusable Dissent credit.' /><QuickField label='External GEN' value={values.external} onChange={external => update({ external })} hint='Wallet value sent.' /></div></details><QuickFundingSummary values={values} minimumBounty={minimumBounty} minimumBond={minimumBond} /></section>
        {values.error && <p className='dv2-form-error' role='alert'><CircleAlert size={15} />{values.error}</p>}
        {blockedReason && <p className='dv2-submit-reason' role='status'><LockKeyhole size={14} />{blockedReason}</p>}
        <label className='dv2-confirmation'><input type='checkbox' checked={values.confirm} onChange={event => update({ confirm: event.target.checked })} /><span>I have reviewed this fictional draft and funding. Ask my wallet only after I publish.</span></label>
        <div className='dv2-quick-actions'><button className='dv2-text-button' type='button' onClick={onBack} disabled={transactionLocked}><ArrowLeft size={15} />Back to review types</button><button className='dv2-button dv2-button-red' type='submit' disabled={!ready}>{active ? 'Transaction in progress' : transactionLocked ? 'Confirmed' : 'Fund and publish test review'}<ArrowUpRight size={15} /></button></div>
        {progress.phase !== 'idle' && <div className={'dv2-write-progress is-' + progress.phase} role={progress.phase === 'failed' ? 'alert' : 'status'}><span>{progress.phase === 'failed' ? progress.error ?? 'Something went wrong. Please try again.' : progress.phase}</span>{progress.hash && <small className='dv2-mono'>{progress.hash}</small>}</div>}
      </div>
      <aside className='dv2-quick-support dv2-builder-support-dark'><EditorialLabel>What happens next</EditorialLabel><h2>One prepared record.</h2><ol><li><b>01</b><span>Select a fictional demonstration case.</span></li><li><b>02</b><span>Add the recipient and challenge window.</span></li><li><b>03</b><span>Review the prepared terms and source.</span></li><li><b>04</b><span>Approve funding only at the final wallet request.</span></li></ol><p>Expected outcomes are testing expectations only. Validators evaluate the submitted action, policy and public evidence.</p></aside>
    </form>
  </div>;
}
