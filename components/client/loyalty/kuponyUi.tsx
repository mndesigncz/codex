'use client';

// Drobnosti, které sdílí správa kuponů a promo kódů (kolo 81): volání API,
// přepínací pilulka, stahování CSV a barvy stavů.

import type { ChipTone } from '../../ui';
import { dbTimeDayHM } from '@/lib/pragueTime';
import type { StavKuponu, StavPromo } from '@/lib/kuponyPravidla';

/** Volání API s JSON tělem; chybu vrací jako Error s větou ze serveru. */
export async function j(url: string, init?: RequestInit) {
  const r = await fetch(url, init ? { headers: { 'Content-Type': 'application/json' }, ...init } : undefined);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e: any = new Error(d.error || 'Nepovedlo se.'); e.data = d; e.status = r.status; throw e; }
  return d;
}

/** Přepínací filtr (vícenásobný výběr) — filter-pill jako všude, vybraný inkoustový s bílým textem. */
export function Volba({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} title={title} className={`filter-pill tap-target-sm ${on ? 'seg-on' : 'seg-off glass'}`}>
      {children}
    </button>
  );
}

/** Stažení souboru ze serveru (CSV): odkaz s `download`, ať se neotevírá nová karta. */
export function stahni(url: string) {
  const a = document.createElement('a');
  a.href = url; a.download = ''; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
}

export const TIER_OPTS: { id: string; label: string }[] = [
  { id: 'bronze', label: 'Člen' }, { id: 'silver', label: 'Stříbrný' },
  { id: 'gold', label: 'Zlatý' }, { id: 'platinum', label: 'Platinový' },
];
export const DOW = [{ d: 1, l: 'Po' }, { d: 2, l: 'Út' }, { d: 3, l: 'St' }, { d: 4, l: 'Čt' }, { d: 5, l: 'Pá' }, { d: 6, l: 'So' }, { d: 7, l: 'Ne' }];

export const STAV_TON: Record<StavKuponu, ChipTone> = {
  koncept: 'muted', naplanovano: 'info', aktivni: 'ok', pozastaveno: 'wait', prosly: 'muted', vycerpano: 'bad', archiv: 'muted',
};
export const STAV_PROMO_TON: Record<StavPromo, ChipTone> = {
  aktivni: 'ok', pozastaveno: 'wait', naplanovano: 'info', prosly: 'muted', vycerpano: 'bad',
};

/** Datum a čas z databáze česky (pražský čas, podle osobní volby formátu), prázdné pro chybějící. */
export function kdyCesky(v: any): string {
  return v ? dbTimeDayHM(v) : '';
}

/** České číslo s mezerou po tisících a desetinnou čárkou. */
export function cislo(n: number): string {
  return n.toLocaleString('cs');
}
