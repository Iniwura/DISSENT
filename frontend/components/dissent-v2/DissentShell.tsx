'use client';

import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { configState } from '@/lib/dissent/config';
import { useDissent } from '@/components/dissent/DissentProvider';
import { DissentFooter } from './DissentFooter';
import { DissentHeader } from './DissentHeader';
import { sanitizeError } from '@/lib/dissent/errors';
import { EditorialNotification } from './EditorialNotification';

export function DissentShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const { wallet, snapshot, loading, dataError, retry, canRetry, retryAvailableAt } = useDissent();
  const [dismissedNotice, setDismissedNotice] = useState<string | null>(null);
  const retrySeconds = retryAvailableAt && !canRetry ? Math.max(1, Math.ceil((retryAvailableAt - Date.now()) / 1000)) : 0;
  const notice = !configState.ok
    ? { key: 'config:' + configState.message, title: 'Public reads unavailable', message: sanitizeError(configState.message, 'read'), tone: 'error' as const, action: undefined }
    : wallet.error
      ? { key: 'wallet:' + wallet.error, title: wallet.error === 'The request was cancelled in your wallet.' ? 'Wallet request cancelled' : 'Wallet needs attention', message: wallet.error, tone: 'warning' as const, action: undefined }
      : loading && snapshot
        ? { key: 'updating', title: 'Live data', message: 'Updating...', tone: 'info' as const, action: undefined }
        : dataError && snapshot
          ? { key: 'busy:' + dataError, title: 'Network busy', message: 'Network busy - showing last updated data.', tone: 'warning' as const, action: <button className='dv2-notification-action' type='button' onClick={retry} disabled={!canRetry}><RefreshCw size={14} />{canRetry ? 'Retry' : 'Retry in ' + retrySeconds + 's'}</button> }
          : dataError
            ? { key: 'unavailable:' + dataError, title: 'Live data unavailable', message: sanitizeError(dataError, 'read'), tone: 'error' as const, action: <button className='dv2-notification-action' type='button' onClick={retry} disabled={!canRetry}><RefreshCw size={14} />{canRetry ? 'Retry' : 'Retry in ' + retrySeconds + 's'}</button> }
            : null;
  const noticeKey = notice?.key ?? null;
  useEffect(() => { setDismissedNotice(null); }, [noticeKey]);
  return <div className='dv2-shell'><DissentHeader />{notice && noticeKey !== dismissedNotice && <EditorialNotification title={notice.title} message={notice.message} tone={notice.tone} action={notice.action} onDismiss={() => setDismissedNotice(notice.key)} />}<main>{children}</main><DissentFooter /></div>;
}
