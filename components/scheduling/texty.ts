// Společné plurály a formát hodin pro Rozvrh (sekce slovníku `rozvrh`).
//
// Kontrola překladů (scripts/check-i18n.mjs) zařazuje věty z `t('…')` do sekce
// podle `useT('…')` v témže souboru; proto tahle značka: useT('rozvrh').
// Česká věta je klíč a množné číslo řeší plurál repa (lib/i18n/plural.ts),
// ne ruční „směna/směny/směn".

import type { PrekladFn } from '@/lib/i18n/client';
import type { Jazyk } from '@/lib/i18n/config';
import { hodinyText } from '@/lib/rozvrhPrehled';

/** „1 směna", „3 směny", „5 směn". */
export const smenTxt = (t: PrekladFn, n: number) => t('{n, plural, one {# směna} few {# směny} other {# směn}}', { n });
/** Jen slovo po číslovce: „směna / směny / směn". */
export const smenSlovo = (t: PrekladFn, n: number) => t('{n, plural, one {směna} few {směny} other {směn}}', { n });
export const dnuTxt = (t: PrekladFn, n: number) => t('{n, plural, one {# den} few {# dny} other {# dní}}', { n });
export const hodinTxt = (t: PrekladFn, n: number) => t('{n, plural, one {# hodina} few {# hodiny} other {# hodin}}', { n });
/** Čtvrtý pád po slovese: „ušetří 1 hodinu / 3 hodiny / 8 hodin". */
export const hodinuTxt = (t: PrekladFn, n: number) => t('{n, plural, one {# hodinu} few {# hodiny} other {# hodin}}', { n });
export const upozorneniTxt = (t: PrekladFn, n: number) => t('{n, plural, one {# upozornění} few {# upozornění} other {# upozornění}}', { n });

/** Hodiny do textu: „8", „7,5" (anglicky „7.5"). */
export function hodinyTextJ(h: number, jazyk: Jazyk): string {
  const s = hodinyText(h);
  return jazyk === 'en' ? s.replace(',', '.') : s;
}
