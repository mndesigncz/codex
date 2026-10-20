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
    // v4 (V7): kruh 56 → 12 → titul 16/600 → 4 → nápověda 13 (nejvýš 280 široká) → 16 → jedna akce 44.
    // Odsazení nad a pod 24 ve widgetu, 48 na prázdné stránce.
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
        // v3: velký klidný symbol v šedém kruhu, ne limetková dlaždice — prázdno není akce.
        <div className="h-14 w-14 rounded-full bg-black/[0.05] text-black/50 flex items-center justify-center mb-3">
          <Icon name={icon} size={24} strokeWidth={1.6} />
        </div>
      ) : null}
      <p className="max-w-[17.5rem] font-semibold tracking-tight text-base text-[#16181A] text-balance">{title}</p>
      {hint && <p className="t-meta mt-1 max-w-[17.5rem] text-pretty">{hint}</p>}
      {/* Akce se zalamují a dlouhý text tlačítka (německé „Karte aus dem heutigen Angebot anlegen" na 288 px)
          se zalomí dovnitř, místo aby vyčuhoval z karty (sondy preteceni-*). */}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2 max-w-full [&_button]:max-w-full [&_button]:whitespace-normal [&_button]:h-auto [&_button]:min-h-11 [&_button]:py-2 [&_button]:text-center [&_a]:max-w-full [&_a]:whitespace-normal">{action}</div>}
    </div>
  );
}

export default EmptyState;
