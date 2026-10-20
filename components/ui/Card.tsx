import React from 'react';

// Plochy Managera 2. Karta je bílá s vláskovou linkou a měkkým stínem —
// jediný kontejner obsahu v aplikaci. Jamka (Well) je tónovaný blok UVNITŘ
// karty pro vnořený obsah; karta v kartě se nedělá.

type Tone = 'default' | 'accent' | 'wait' | 'danger' | 'info';
const TONE: Record<Tone, string> = {
  default: 'card',
  accent: 'card card-accent',
  wait: 'card card-wait',
  danger: 'card card-danger',
  info: 'card card-info',
};
// v4 (spec P1): hrana karty → L obsahu 16 na telefonu, 20 od sm — pro kartu i widget
// jakékoli velikosti (dřív md 20 i na telefonu a malý widget 16: obsah dvou karet pod
// sebou skákal o 4 px). `sm` zůstává 16 všude (hustá dlaždice, řádek v kartě).
const PAD = { none: '', sm: 'p-4', md: 'p-4 sm:p-5', lg: 'p-6 sm:p-7' } as const;

export function Card({ tone = 'default', pad = 'md', as: Tag = 'section', className = '', children, ...rest }: {
  tone?: Tone; pad?: keyof typeof PAD; as?: 'section' | 'div' | 'article' | 'li' | 'form';
  className?: string; children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, 'className' | 'children'>) {
  return <Tag className={`${TONE[tone]} ${PAD[pad]} ${className}`} {...(rest as any)}>{children}</Tag>;
}

export function Well({ pad = 'sm', className = '', children, as: Tag = 'div', ...rest }: {
  pad?: keyof typeof PAD; className?: string; children: React.ReactNode; as?: 'div' | 'li' | 'button';
} & Omit<React.HTMLAttributes<HTMLElement>, 'className' | 'children'>) {
  return <Tag className={`well ${PAD[pad]} ${className}`} {...(rest as any)}>{children}</Tag>;
}

export default Card;
