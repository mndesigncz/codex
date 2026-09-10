'use client';

import React from 'react';
import { Icon } from '../Icons';

// Prázdný stav, který učí, ne jen hlásí „nic tu není".
//
// Ilustrace je SVG z /public/illu — jedna kreslená série (uhlová linka,
// limetkový akcent) místo dvaceti čtyř různě napsaných „Zatím žádné…".
// Text říká, co tu bude a jak to sem dostat; tlačítko to udělá.

export function EmptyState({ illustration, icon, title, hint, action, compact = false, className = '' }: {
  /** Název souboru bez přípony v /public/illu (např. „sklad"). */
  illustration?: string;
  /** Náhradní ikona, když ilustrace pro tenhle stav není. */
  icon?: string;
  title: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  /** Menší varianta do panelu nebo karty. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? 'py-6 px-4' : 'py-12 px-6'} ${className}`}>
      {illustration ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/illu/${illustration}.svg`}
          alt=""
          aria-hidden
          width={compact ? 160 : 240}
          height={compact ? 120 : 180}
          className={`${compact ? 'w-40' : 'w-60'} max-w-full h-auto mb-4 select-none pointer-events-none`}
          draggable={false}
        />
      ) : icon ? (
        <div className={`${compact ? 'h-12 w-12' : 'h-16 w-16'} rounded-2xl bg-[#C8F542]/15 text-[#4F6A07] flex items-center justify-center mb-4`}>
          <Icon name={icon} size={compact ? 22 : 28} />
        </div>
      ) : null}
      <p className={`font-bold tracking-tight text-[#16181A] text-balance ${compact ? 'text-base' : 'text-lg'}`}>{title}</p>
      {hint && <p className={`text-black/55 mt-1.5 max-w-sm text-pretty ${compact ? 'text-sm' : 'text-sm'}`}>{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export default EmptyState;
