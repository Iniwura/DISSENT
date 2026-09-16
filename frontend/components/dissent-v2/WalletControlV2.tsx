'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit/components';
import { Copy, LogOut, Wallet, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useDissent } from '@/components/dissent/DissentProvider';
import { STUDIO_NEXT_CHAIN_ID } from '@/lib/dissent/network';
import { shortAddress } from '@/lib/dissent/types';

export function WalletControlV2() {
  const { wallet, disconnect, switchNetwork } = useDissent();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = 'dv2-wallet-menu-' + useId().replace(/:/g, '');

  useEffect(() => {
    if (!wallet.connected) setOpen(false);
  }, [wallet.connected, wallet.address]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return <ConnectButton.Custom>
    {({ account, chain, openConnectModal, mounted }) => {
      if (!mounted) return <span className='dv2-wallet dv2-wallet-placeholder' aria-hidden='true'><Wallet size={15} /></span>;
      if (!account || !chain) return <button className='dv2-wallet' type='button' onClick={openConnectModal}><Wallet size={15} /><span>Connect wallet</span></button>;
      const wrongChain = wallet.chainId !== STUDIO_NEXT_CHAIN_ID || chain.unsupported;
      const address = wallet.address ?? account.address;
      return <div className={'dv2-wallet-wrap' + (open ? ' is-open' : '')} ref={menuRef}>
        <button ref={triggerRef} className='dv2-wallet' type='button' onClick={() => setOpen((value) => !value)} aria-label='Open wallet menu' aria-expanded={open} aria-controls={menuId}>
          <span className={'dv2-wallet-dot ' + (wrongChain ? 'is-wrong' : '')} />
          {account.displayName}
        </button>
        {open && <div id={menuId} className='dv2-wallet-popover' role='dialog' aria-label='Wallet menu'>
          <div className='dv2-wallet-popover-head'><p className='dv2-label'>Wallet</p><button className='dv2-wallet-close' type='button' onClick={() => { setOpen(false); triggerRef.current?.focus(); }} aria-label='Close wallet menu'><X size={15} /></button></div>
          <strong>{account.displayName}</strong>
          <div className='dv2-wallet-address'>
            <span className='dv2-mono'>{address}</span>
            <button type='button' aria-label='Copy complete wallet address' title='Copy complete wallet address' onClick={() => void navigator.clipboard?.writeText(address)}><Copy size={14} /></button>
          </div>
          {wrongChain ? <button className='dv2-inline-action' type='button' onClick={() => void switchNetwork()}>Switch to Studio Next</button> : <span className='dv2-wallet-network'>Studio Next ready / {STUDIO_NEXT_CHAIN_ID}</span>}
          <span className='dv2-wallet-connector'>{wallet.connectorName ?? 'Selected wallet'} / {shortAddress(address)}</span>
          <button className='dv2-inline-action dv2-inline-danger' type='button' onClick={() => { setOpen(false); disconnect(); }}><LogOut size={14} /> Disconnect</button>
        </div>}
      </div>;
    }}
  </ConnectButton.Custom>;
}
