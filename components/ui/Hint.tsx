'use client';

import React, { useEffect, useState } from 'react';
import { Icon } from '../Icons';

// Nápověda, která něco udělá a dá se umlčet.
//
// Dřív byly rady po aplikaci rozsypané jako `.note` bloky: hezky
// vypadaly, ale nedaly se zavřít a nikam nevedly. Kdo aplikaci zná
// druhý rok, čte tutéž větu o výchozích kategoriích pokaždé, co otevře
// sklad. Rada, kterou nejde umlčet, se po čase přestane číst — a s ní
// i ta, která má opravdu cenu.
//
// Proto tři věci navíc oproti `.note`:
//   1. `action` — proklik, kterým se rada rovnou udělá
//   2. křížek — tahle rada se u tohohle člověka už neukáže
//   3. celkový vypínač v Nastavení → Vzhled (a tam i „zobrazit znovu")
//
// Pozor na hranici: tohle je pro RADU. Stavové hlášení („kasa nesedí
// o 300 Kč") se zavírat nesmí a zůstává `.note`.

const PREFIX = 'managero-hint-';
const OFF_KEY = 'managero-hints-off';

/** Jsou nápovědy zapnuté? Čte se i v Nastavení. */
export function hintsEnabled(): boolean {
  try { return localStorage.getItem(OFF_KEY) !== '1'; } catch { return true; }
}

export function setHintsEnabled(on: boolean) {
  try {
    localStorage.setItem(OFF_KEY, on ? '0' : '1');
    window.dispatchEvent(new Event('managero-hints-changed'));
  } catch { /* soukromý režim */ }
}

/** Vrátí zpět všechny jednotlivě zavřené rady. */
export function resetHints() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
    localStorage.removeItem(OFF_KEY);
    window.dispatchEvent(new Event('managero-hints-changed'));
  } catch { /* soukromý režim */ }
}

/** Kolik rad je momentálně zavřených — Nastavení to ukazuje u tlačítka. */
export function dismissedCount(): number {
  try { return Object.keys(localStorage).filter(k => k.startsWith(PREFIX)).length; } catch { return 0; }
}

export type HintTone = 'info' | 'wait' | 'ok';

export function Hint({ id, tone = 'info', icon, title, children, action, className = '' }: {
  /** Stálý klíč rady. Pod ním si pamatujeme, že ji člověk zavřel. */
  id: string;
  tone?: HintTone;
  icon?: string;
  title?: React.ReactNode;
  children: React.ReactNode;
  /** Proklik, kterým se rada rovnou provede. Bez něj je to jen text. */
  action?: { label: string; onClick?: () => void; href?: string };
  className?: string;
}) {
  // Server nezná localStorage; kdybychom rovnou schovávali, hydratace
  // by neseděla. Proto se první vykreslení tváří „ukaž" a rozhodne se
  // až v prohlížeči.
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const read = () => {
      try { setHidden(localStorage.getItem(PREFIX + id) === '1' || !hintsEnabled()); }
      catch { setHidden(false); }
    };
    read();
    window.addEventListener('managero-hints-changed', read);
    return () => window.removeEventListener('managero-hints-changed', read);
  }, [id]);

  if (hidden) return null;

  const dismiss = () => {
    try { localStorage.setItem(PREFIX + id, '1'); } catch { /* soukromý režim */ }
    setHidden(true);
  };

  return (
    <div className={`note note-${tone} flex items-start gap-3 ${className}`} role="note">
      {icon && <Icon name={icon} size={16} className="shrink-0 mt-0.5 opacity-70" />}
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? 'mt-0.5' : ''}>{children}</div>
        {action && (
          action.href
            ? <a href={action.href} className="mt-2 inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:no-underline">
                {action.label} <Icon name="chevron" size={13} className="-rotate-90" />
              </a>
            : <button type="button" onClick={action.onClick}
                className="tap-target-sm mt-2 inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:no-underline">
                {action.label} <Icon name="chevron" size={13} className="-rotate-90" />
              </button>
        )}
      </div>
      <button type="button" onClick={dismiss} aria-label="Tuhle radu už nezobrazovat"
        title="Tuhle radu už nezobrazovat (vrátit jde v Nastavení → Vzhled)"
        className="tap-target-sm shrink-0 -mr-1 -mt-1 h-7 w-7 grid place-items-center rounded-full opacity-45 hover:opacity-100 transition">
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}

export default Hint;
