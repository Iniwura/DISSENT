'use client';

import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import type { ReactNode } from 'react';

export type EditorialNotificationTone = 'error' | 'warning' | 'info' | 'success';

const icons = {
  error: AlertCircle,
  warning: AlertCircle,
  info: Info,
  success: CheckCircle2,
};

export function EditorialNotification({ title, message, tone = 'warning', action, onDismiss }: { title: string; message: string; tone?: EditorialNotificationTone; action?: ReactNode; onDismiss?: () => void }) {
  const Icon = icons[tone];
  return <section className={'dv2-notification dv2-notification-' + tone} role={tone === 'error' ? 'alert' : 'status'} aria-live={tone === 'info' ? 'polite' : 'assertive'} aria-atomic='true'>
    <span className='dv2-notification-icon' aria-hidden='true'><Icon size={15} /></span>
    <div className='dv2-notification-copy'><strong>{title}</strong><p>{message}</p></div>
    {action}
    {onDismiss && <button className='dv2-notification-dismiss' type='button' onClick={onDismiss} aria-label='Dismiss notification'><X size={15} /></button>}
  </section>;
}
