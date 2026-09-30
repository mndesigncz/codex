// Zkratky dnů v hlavičce mřížek podle jazyka. Čeština drží původní „Po, Út, …“
// z lib/week (výstup se nesmí změnit), ostatní jazyky berou názvy z Intl.

import { zkratkyDnu, type ZacatekTydne } from './week.ts';
import { fmtDenVTydnu } from './i18n/format.ts';
import { LOCALE_PRO_JAZYK, type Jazyk } from './i18n/config.ts';

/** Zkratky dnů ve správném pořadí pro hlavičku mřížky, v jazyce uživatele. */
export function zkratkyDnuJazyk(zacatek: ZacatekTydne = 1, jazyk: Jazyk = 'cs'): string[] {
  if (jazyk === 'cs') return zkratkyDnu(zacatek);
  const dny = [0, 1, 2, 3, 4, 5, 6].map(i => {
    const s = fmtDenVTydnu(i, { jazyk, styl: 'kratky' }).replace(/\.$/, '');
    return s.charAt(0).toUpperCase() + s.slice(1);
  });
  return zacatek === 0 ? [dny[6], ...dny.slice(0, 6)] : dny;
}

const ZKRATKY_CS_OD_NEDELE = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];

/** Zkratky dnů indexované jako `Date.getDay()` (0 = neděle). */
export function zkratkyDnuOdNedele(jazyk: Jazyk = 'cs'): string[] {
  if (jazyk === 'cs') return ZKRATKY_CS_OD_NEDELE;
  const pondeli = zkratkyDnuJazyk(1, jazyk);
  return [pondeli[6], ...pondeli.slice(0, 6)];
}

/** Názvy dnů od pondělí, s velkým písmenem („Pondělí", „Monday", „Montag"). Pořadí = klíč otevírací doby (0 = pondělí). */
export function nazvyDnuDlouze(jazyk: Jazyk = 'cs'): string[] {
  return [0, 1, 2, 3, 4, 5, 6].map(i => {
    const s = fmtDenVTydnu(i, { jazyk, styl: 'dlouhy' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  });
}

/** „pondělí 5. 3." (den v týdnu + číselné datum) podle jazyka; `d` je místní datum. */
export function denSCislem(d: Date, jazyk: Jazyk = 'cs'): string {
  return new Intl.DateTimeFormat(LOCALE_PRO_JAZYK[jazyk], { weekday: 'long', day: 'numeric', month: 'numeric' }).format(d);
}
