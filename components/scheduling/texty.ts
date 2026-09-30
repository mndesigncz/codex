// Společné plurály a formát hodin pro Rozvrh (sekce slovníku `rozvrh`).
//
// Kontrola překladů (scripts/check-i18n.mjs) zařazuje věty z `t('…')` do sekce
// podle `useT('…')` v témže souboru; proto tahle značka: useT('rozvrh').
// Česká věta je klíč a množné číslo řeší plurál repa (lib/i18n/plural.ts),
// ne ruční „směna/směny/směn".

import type { PrekladFn } from '@/lib/i18n/client';
import type { Jazyk } from '@/lib/i18n/config';
import { hodinyText } from '@/lib/rozvrhPrehled';
import { fmtDatum } from '@/lib/i18n/format';

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

/**
 * Krátké popisy stavu člověka na den z lib/rozvrhDen.ts a lib/dayPrefs.ts
 * („může", „jen Ranní", „dovolená" …) jsou česky; tady se překládají podle textu.
 */
export function prelozPopisStavu(t: PrekladFn, p: string): string {
  switch (p) {
    case 'může': return t('může');
    case 'nemůže': return t('nemůže');
    case 'nevyplněno': return t('nevyplněno');
    case 'dovolená': return t('dovolená');
    case 'nemoc': return t('nemoc');
    case 'volno': return t('volno');
    case 'schválené volno': return t('schválené volno');
    case 'omezeně': return t('omezeně');
    case 'jen ranní': return t('jen ranní');
    case 'jen odpolední': return t('jen odpolední');
    case 'preferuje ranní': return t('preferuje ranní');
    case 'preferuje odpolední': return t('preferuje odpolední');
    case 'jen vybraný typ směny': return t('jen vybraný typ směny');
    default:
      // „jen Otvíračka": název typu je obsah podniku a zůstává, jak ho napsali.
      return p.startsWith('jen ') ? t('jen {nazev}', { nazev: p.slice(4) }) : p;
  }
}

/** Rozsah volna „5. 3. – 9. 3. 2026" v jazyce uživatele (kalendářní dny RRRR-MM-DD). */
export function rozsahVolnaJ(od: string, doDne: string, jazyk: Jazyk): string {
  const cele = (d: string) => fmtDatum(d, { jazyk, styl: 'cislo' });
  const kratce = (d: string) => fmtDatum(d, { jazyk, styl: 'kratce' });
  if (!doDne || od === doDne) return cele(od);
  if (od.slice(0, 4) === doDne.slice(0, 4)) return `${kratce(od)} – ${cele(doDne)}`;
  return `${cele(od)} – ${cele(doDne)}`;
}
