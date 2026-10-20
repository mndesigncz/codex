'use client';

import React from 'react';
import { Icon } from '../Icons';

// Stavová karta (spec-skladba V8): „Chybí sazba", „Uzávěrky ke schválení",
// vyřízený widget. Jedna podoba, ať úvodní kruh začíná na L karty stejně jako
// ikona hlavičky widgetu pod ní (P5; dřív x 44,5 / 37 / 38,5 ve třech kartách
// pod sebou) a šipka vpravo končí na R jako „^ Sbalit" (P4).
//
// L ┌[kruh 40: ikona 20, tón] 12 ┌ Titul 15/600 ┐ ……… [∨ / › 36, končí na R] ┐ R
//   │                            └ meta 13      ┘                           │
//   └──────────── výška obsahu 44, karta 16 + 44 + 16 = 76 ──────────────────┘

type Ton = 'ok' | 'wait' | 'bad' | 'info' | 'muted';

const TON: Record<Ton, string> = {
  ok: 'bg-ok on-accent',
  wait: 'bg-[var(--wait-bg)] text-[var(--wait-ink)]',
  bad: 'bg-[var(--bad-bg)] text-[var(--bad-ink)]',
  info: 'bg-[var(--info-bg)] text-[var(--info-ink)]',
  muted: 'bg-[var(--well)] text-black/55',
};

/** Kruh 40 se stavovou ikonou 20 — úvodní prvek stavové karty i řádku (začíná na L). */
export function StavovyKruh({ ikona, ton = 'muted', className = '' }: { ikona: string; ton?: Ton; className?: string }) {
  return (
    <span aria-hidden className={`stav-kruh ${TON[ton]} ${className}`}>
      <Icon name={ikona} size={20} strokeWidth={ton === 'ok' ? 2.5 : 2} />
    </span>
  );
}

/**
 * Obsah stavové karty: kruh, titul s meta a volitelná akce na R. Kartu kreslí volající
 * (`<Card pad="md">` nebo `Widget`), tahle komponenta je jen řádek uvnitř.
 * `akce` je ikonové tlačítko 36 (∨ rozbalit, › otevřít) — jeho pravá hrana je R.
 */
export function StavovaKarta({ ikona, ton = 'muted', titul, meta, akce, idTitulku, className = '', nadpis }: {
  ikona: string;
  ton?: Ton;
  titul: React.ReactNode;
  meta?: React.ReactNode;
  akce?: React.ReactNode;
  idTitulku?: string;
  className?: string;
  /** Vlastní prvek nadpisu místo `<h2 class="stav-titul">` (Widget: cíl fokusu s tabIndex −1). Třídu `stav-titul truncate` mu dej sám. */
  nadpis?: React.ReactNode;
}) {
  return (
    <div className={`stav-radek ${className}`}>
      <StavovyKruh ikona={ikona} ton={ton} />
      <div className="min-w-0 flex-1">
        {nadpis ?? <h2 id={idTitulku} className="stav-titul truncate">{titul}</h2>}
        {meta != null && <p className="t-meta line-clamp-2 break-words">{meta}</p>}
      </div>
      {akce}
    </div>
  );
}

export default StavovaKarta;
