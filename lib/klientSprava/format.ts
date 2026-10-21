// Čísla ve správě Managero client (kolo 92): správa je česky, tisíce s mezerou („1 240").
// Přes lib/i18n/format, ať v kódu nepřibývají natvrdo psané `'cs-CZ'` (hlídá check-i18n).
import { fmtCislo } from '../i18n/format.ts';

export const cislo = (n: number): string => fmtCislo(Number(n) || 0, { locale: 'cs' });
