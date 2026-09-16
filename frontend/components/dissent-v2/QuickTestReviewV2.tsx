'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useDissent } from '@/components/dissent/DissentProvider';
import { DissentValidationError, sanitizeError } from '@/lib/dissent/errors';
import { validateIdentifier } from '@/lib/dissent/types';
import { calculateFundingBreakdown, getQuickTestEvidenceUrl, QUICK_TEST_SCENARIOS, quickDurationSeconds } from '@/lib/dissent/quick-tests';
import { parseGen, parseUint, validateRecipient } from '@/lib/dissent/writes';
import { useV2Write, writeAvailability } from './ReviewComposerV2';
import { QuickTestView } from './QuickTestView';
import type { QuickValues } from './QuickTestParts';

function createReviewId() {
  return 'quick-test-' + new Date().toISOString().slice(0, 10).replaceAll('-', '') + '-' + Math.random().toString(36).slice(2, 7);
}

export function QuickTestReviewV2({ onBack }: { onBack: () => void }) {
  const { snapshot, wallet } = useDissent();
  const { progress, submit, active, transactionLocked } = useV2Write();
  const router = useRouter();
  const [scenarioSlug, setScenarioSlug] = useState(QUICK_TEST_SCENARIOS[0].slug);
  const [values, setValues] = useState<QuickValues>({ id: '', recipient: '', review: '600', durationMode: 'preset', customDuration: '', durationUnit: 'minutes', bounty: '1', external: '1.000000000000001', credit: '0', confirm: false, error: '' });
  const scenario = QUICK_TEST_SCENARIOS.find(item => item.slug === scenarioSlug) ?? QUICK_TEST_SCENARIOS[0];
  const evidenceUrl = getQuickTestEvidenceUrl(scenario.slug, process.env.NEXT_PUBLIC_QUICK_TEST_EVIDENCE_ORIGIN ?? '');
  const availability = writeAvailability(wallet);
  const minimumBounty = snapshot?.config.minimumBounty ?? null;
  const minimumBond = snapshot?.config.minimumExecutionBond ?? null;

  useEffect(() => { setValues(current => current.id ? current : { ...current, id: createReviewId() }); }, []);
  const update = (next: Partial<QuickValues>) => setValues(current => ({ ...current, ...next, error: '' }));
  const funding = (() => { try { return calculateFundingBreakdown({ bounty: parseGen(values.bounty, 'Bounty'), external: parseGen(values.external, 'External GEN'), credit: parseGen(values.credit, 'Settled credit GEN'), minimumBond: minimumBond ?? 0n }); } catch { return null; } })();
  const duration = values.durationMode === 'custom' ? quickDurationSeconds(values.customDuration, values.durationUnit) : (() => { try { return parseUint(values.review, 'Challenge duration'); } catch { return null; } })();
  const validRecipient = (() => { try { validateRecipient(values.recipient); return true; } catch { return false; } })();
  const withinDuration = Boolean(snapshot && duration !== null && duration >= snapshot.config.minimumReviewSeconds && duration <= snapshot.config.maximumReviewSeconds);
  const enoughCredit = !snapshot || snapshot.walletCredit === null || snapshot.walletCredit === undefined || !funding || funding.settledCredit <= snapshot.walletCredit;
  const ready = Boolean(snapshot && values.id && validRecipient && evidenceUrl && withinDuration && funding?.meetsMinimum && enoughCredit && values.confirm && !availability && !transactionLocked);
  const blockedReason = transactionLocked ? 'Submission already pending or confirmed' : !wallet.connected || !wallet.address ? 'Connect a wallet' : wallet.chainId !== 61997 ? 'Switch to Studio Next' : !evidenceUrl ? 'Public test evidence is not configured' : !snapshot || !values.id || !validRecipient || !withinDuration || !values.confirm ? 'Complete the required fields' : !funding?.meetsMinimum || !enoughCredit ? 'Insufficient funding' : availability ? 'Wallet provider unavailable' : null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (!evidenceUrl) throw new DissentValidationError('Live Quick Test publishing needs a configured public HTTPS evidence origin.');
      if (!snapshot || duration === null || !withinDuration) throw new DissentValidationError('Challenge duration is outside the deployed contract bounds.');
      const id = validateIdentifier(values.id, 'Review ID');
      const recipient = validateRecipient(values.recipient);
      const bounty = parseGen(values.bounty, 'Bounty');
      const external = parseGen(values.external, 'External GEN');
      const credit = parseGen(values.credit, 'Settled credit GEN');
      if (snapshot.proposalIds.includes(id)) throw new DissentValidationError('Review ID is already in the registry.');
      if (bounty < snapshot.config.minimumBounty) throw new DissentValidationError('Bounty must meet the deployed contract minimum.');
      if (snapshot.walletCredit !== null && snapshot.walletCredit !== undefined && credit > snapshot.walletCredit) throw new DissentValidationError('Settled credit exceeds the connected account balance.');
      if (!funding?.meetsMinimum) throw new DissentValidationError('External GEN and settled credit must cover the bounty and execution bond.');
      if (!values.confirm) throw new DissentValidationError('Confirm the review and funding before publishing.');
      const result = await submit({ functionName: 'commit', args: [id, scenario.action, scenario.objective, scenario.policy, evidenceUrl, recipient, bounty, duration, credit], value: external });
      if (result?.confirmed) router.push('/reviews/' + encodeURIComponent(id) + '?tx=' + encodeURIComponent(result.hash));
    } catch (error) {
      update({ error: sanitizeError(error, 'validation') });
    }
  }

  return <QuickTestView scenario={scenario} scenarioSlug={scenarioSlug} setScenarioSlug={setScenarioSlug} values={values} update={update} evidenceUrl={evidenceUrl} snapshot={snapshot} wallet={wallet} availability={availability} blockedReason={blockedReason} minimumBounty={minimumBounty} minimumBond={minimumBond} funding={funding} validRecipient={validRecipient} progress={progress} active={active} transactionLocked={transactionLocked} ready={ready} onSubmit={onSubmit} onBack={onBack} />;
}
