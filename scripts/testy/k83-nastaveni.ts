// Kolo 7 (balík R7-7) — Nastavení a tablet: čerpání limitu tarifu, souhrn směny po odchodu,
// sklad tabletu s Dochází a minimem, historie změn s hledáním a lidmi, Organizace jako sekce.
// Čistá logika bez databáze a bez prohlížeče.

import type { Testy } from './_testy.ts';
import { vyuziti, limityTarifu, LIMITS } from '../../lib/plan.ts';
import { souhrnOdchodu, SOUHRN_ZAVRIT_S } from '../../lib/kioskPrehled.ts';

export default function ({ eq, ok }: Testy) {
  // ---- 1) čerpání limitu tarifu (karta Váš plán) ----
  eq('využití: 2 ze 3 → zbývá jedno místo', vyuziti(2, 3), { pocet: 2, limit: 3, zbyva: 1, stav: 'malo' });
  eq('využití: 1 ze 3 → volno', vyuziti(1, 3), { pocet: 1, limit: 3, zbyva: 2, stav: 'volno' });
  eq('využití: 3 ze 3 → plno', vyuziti(3, 3), { pocet: 3, limit: 3, zbyva: 0, stav: 'plno' });
  eq('využití: přes limit (starší podnik) → plno, zbývá 0, ne záporné', vyuziti(5, 3), { pocet: 5, limit: 3, zbyva: 0, stav: 'plno' });
  eq('využití: sdílený odkaz 1 z 1 → plno, 0 z 1 → zbývá jeden', [vyuziti(1, 1).stav, vyuziti(0, 1).stav], ['plno', 'malo']);
  eq('využití: bez limitu → neomezeno', vyuziti(14, null), { pocet: 14, limit: null, zbyva: null, stav: 'neomezeno' });
  eq('využití: nesmyslný počet → 0', [vyuziti(NaN, 3).pocet, vyuziti(-2, 3).pocet], [0, 0]);
  eq('limity: Zdarma má 3 lidi a 1 odkaz, Pro a Max bez limitu', [limityTarifu({ effective: 'free' }), limityTarifu({ effective: 'pro' }), limityTarifu({ effective: 'max' })],
    [{ members: 3, shareLinks: 1 }, { members: null, shareLinks: null }, { members: null, shareLinks: null }]);
  ok('limity: karta a vymáhání čtou tutéž tabulku LIMITS', limityTarifu({ effective: 'free' }) === LIMITS.free);
  eq('limity: bez stavu tarifu (načítá se) žádné varování', limityTarifu(null).members, null);

  // ---- 2) souhrn směny po odchodu (tablet) ----
  // Říjen = letní čas, Praha je UTC+2.
  const den = souhrnOdchodu({ clockIn: '2026-10-12T06:02:00Z', clockOut: '2026-10-12T13:34:00Z' }, true);
  eq('souhrn: příchod, odchod a délka', den && [den.prichod, den.odchod, den.odpracovano, den.presPulnoc, den.chybiUzaverka], ['08:02', '15:34', '7 h 32 min', false, false]);
  const noc = souhrnOdchodu({ clockIn: '2026-10-12T20:10:00Z', clockOut: '2026-10-13T00:05:00Z' }, false);
  eq('souhrn: noční směna přes půlnoc — 22:10 → 02:05 je 3 h 55 min, další den', noc && [noc.prichod, noc.odchod, noc.odpracovano, noc.presPulnoc], ['22:10', '02:05', '3 h 55 min', true]);
  ok('souhrn: closingDone false → uzávěrka chybí', noc?.chybiUzaverka === true);
  eq('souhrn: čas z databáze bez zóny je UTC (parseDbTime)', souhrnOdchodu({ clockIn: '2026-10-12 06:02:00', clockOut: '2026-10-12 06:47:00' })?.odpracovano, '45 min');
  ok('souhrn: closingDone chybí (starší server) → uzávěrka se nehlásí', souhrnOdchodu({ clockIn: '2026-10-12T06:00:00Z', clockOut: '2026-10-12T07:00:00Z' }, null)?.chybiUzaverka === false);
  eq('souhrn: bez odchodu, nečitelné nebo obrácené → nic', [
    souhrnOdchodu({ clockIn: '2026-10-12T06:00:00Z', clockOut: null }), souhrnOdchodu(null), souhrnOdchodu({ clockIn: 'x', clockOut: 'y' }),
    souhrnOdchodu({ clockIn: '2026-10-12T08:00:00Z', clockOut: '2026-10-12T07:00:00Z' }),
  ], [null, null, null, null]);
  eq('souhrn: okno se zavře samo po 20 s', SOUHRN_ZAVRIT_S, 20);
}
