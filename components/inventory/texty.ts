// Společné plurály pro Sklad (sekce slovníku `sklad`).
//
// Kontrola překladů (scripts/check-i18n.mjs) zařazuje věty z `t('…')` do sekce
// podle `useT('…')` v témže souboru; proto tahle značka: useT('sklad').
// Množné číslo řeší plurál repa (lib/i18n/plural.ts), ne ruční „položka/položky/položek".

import type { PrekladFn } from '@/lib/i18n/client';

/** „1 položka", „3 položky", „5 položek". */
export const polozekTxt = (t: PrekladFn, n: number) => t('{n, plural, one {# položka} few {# položky} other {# položek}}', { n });
/** „1 rozdíl", „3 rozdíly", „5 rozdílů". */
export const rozdilTxt = (t: PrekladFn, n: number) => t('{n, plural, one {# rozdíl} few {# rozdíly} other {# rozdílů}}', { n });
