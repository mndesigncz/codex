import React from 'react';
import { Icon } from '../Icons';

// Štítek stavu. Pět tónů, jedna velikost, jeden tvar — chip říká „čeká",
// „hotovo", „chyba" všude stejně: v seznamu směn, u rezervace i u kuponu.

export type ChipTone = 'ok' | 'wait' | 'bad' | 'info' | 'muted' | 'ink';

export function Chip({ tone = 'muted', icon, children, className = '', size = 'md' }: {
  tone?: ChipTone; icon?: string; children: React.ReactNode; className?: string; size?: 'sm' | 'md';
}) {
  return (
    <span className={`chip chip-${tone} ${size === 'sm' ? 'chip-sm' : ''} ${className}`}>
      {icon && <Icon name={icon} size={size === 'sm' ? 11 : 13} className="shrink-0" />}
      {children}
    </span>
  );
}

export default Chip;
