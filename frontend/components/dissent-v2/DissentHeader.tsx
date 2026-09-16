'use client';

import Link from 'next/link';
import { Menu } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { configState } from '@/lib/dissent/config';
import { STUDIO_NEXT_CHAIN_ID } from '@/lib/dissent/network';
import { DissentMenu } from './DissentMenu';
import { WalletControlV2 } from './WalletControlV2';

const links = [
  { href: '/reviews', label: 'Reviews' },
  { href: '/reviews/new', label: 'Start a Review' },
  { href: '/balance', label: 'Balance' },
];

export function DissentHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  return <>
    <header className='dv2-header'>
      <Link className='dv2-wordmark' href='/' aria-label='Dissent home'><span className='dv2-wordmark-mark' aria-hidden='true'>/</span>DISSENT</Link>
      <nav className='dv2-nav' aria-label='Primary navigation'>{links.map(link => <Link key={link.href} href={link.href} className={pathname === link.href || (link.href === '/reviews' && pathname.startsWith('/reviews/') && pathname !== '/reviews/new') ? 'is-active' : ''}>{link.label}</Link>)}</nav>
      <div className='dv2-header-tools'><span className={'dv2-network-mark ' + (configState.ok ? 'is-live' : 'is-error')} title={'Studio Next chain ' + STUDIO_NEXT_CHAIN_ID}><i />Studio Next</span><WalletControlV2 /><button className='dv2-menu-button' type='button' onClick={() => setMenuOpen(true)} aria-label='Open navigation'><Menu size={20} /></button></div>
    </header>
    <DissentMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
  </>;
}
