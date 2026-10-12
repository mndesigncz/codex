// Kolo 7 (balík R7-7) — Nastavení a tablet: čerpání limitu tarifu, souhrn směny po odchodu,
// sklad tabletu s Dochází a minimem, historie změn s hledáním a lidmi, Organizace jako sekce.
// Čistá logika bez databáze a bez prohlížeče.

import type { Testy } from './_testy.ts';
import { vyuziti, limityTarifu, LIMITS } from '../../lib/plan.ts';

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
}
