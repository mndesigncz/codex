'use client';

import React from 'react';
import { Icon } from '../Icons';

// Avatar člověka. Lidé si v nastavení vybírají emoji — to je jejich obsah
// a zůstává. Náhrada za chybějící avatar ale nebude další emoji (👤 vypadá
// na každém telefonu jinak), nýbrž kreslená silueta v barvě systému.

const SIZES = {
  xs: { box: 'h-6 w-6', text: 'text-xs', icon: 12 },
  sm: { box: 'h-8 w-8', text: 'text-base', icon: 15 },
  md: { box: 'h-10 w-10', text: 'text-xl', icon: 18 },
  lg: { box: 'h-14 w-14', text: 'text-3xl', icon: 24 },
  xl: { box: 'h-20 w-20', text: 'text-5xl', icon: 34 },
} as const;

export function Avatar({ emoji, size = 'md', ring = true, className = '', title }: {
  emoji?: string | null;
  size?: keyof typeof SIZES;
  ring?: boolean;
  className?: string;
  title?: string;
}) {
  const s = SIZES[size];
  const has = !!(emoji && emoji.trim());
  return (
    <span
      title={title}
      aria-hidden={title ? undefined : true}
      className={`inline-flex shrink-0 items-center justify-center rounded-full select-none leading-none ${s.box} ${s.text} ${
        ring ? 'ring-1 ring-black/10' : ''
      } ${has ? 'bg-white/60' : 'bg-black/[0.06] text-black/45'} ${className}`}
    >
      {has ? emoji : <Icon name="user" size={s.icon} />}
    </span>
  );
}

export default Avatar;
