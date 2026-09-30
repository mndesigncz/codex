// Limit dní v řadě (lib/rozvrhGenerator.ts → radaDniOk).
//
// „Upravit podle nových požadavků“ počítala řadu jen dozadu, a tak kolegovi,
// který pracuje 10.–11. a 13.–14., dala 12. — pět dní v kuse při limitu 3.

import type { Testy } from './_testy.ts';
import { radaDniOk } from '../../lib/rozvrhGenerator.ts';

export default function ({ eq }: Testy) {
  const dny = (...d: number[]) => new Set(d.map(x => `2026-10-${String(x).padStart(2, '0')}`));
  const den = (d: number) => `2026-10-${String(d).padStart(2, '0')}`;

  // Případ z auditu: 10., 11., 13., 14. + nové 12. = řada 5, limit 3.
  eq('řada: doprostřed existující řady se nevejde (před 2 + po 2 + 1 > 3)', radaDniOk(dny(10, 11, 13, 14), den(12), 3), false);
  eq('řada: jen dozadu by to pustilo (2 před < 3) — proto se počítá i dopředu', 2 < 3, true);

  eq('řada: bez limitu vždy ano', radaDniOk(dny(10, 11, 13, 14), den(12), null), true);
  eq('řada: den, ve kterém už stojí, je v pořádku (nic se nepřidává)', radaDniOk(dny(10, 11, 12), den(12), 1), true);
  eq('řada: přesně na limit projde (2 před + 1 = 3)', radaDniOk(dny(10, 11), den(12), 3), true);
  eq('řada: o jeden přes limit neprojde', radaDniOk(dny(9, 10, 11), den(12), 3), false);
  eq('řada: dopředu stejně jako dozadu', [radaDniOk(dny(13, 14), den(12), 3), radaDniOk(dny(13, 14, 15), den(12), 3)], [true, false]);
  eq('řada: přes hranici měsíce', radaDniOk(new Set(['2026-10-30', '2026-10-31', '2026-11-02']), '2026-11-01', 3), false);
  eq('řada: volný den mezi pracovními neřadu nespojuje', radaDniOk(dny(10, 11, 14, 15), den(12), 3), true);
}
