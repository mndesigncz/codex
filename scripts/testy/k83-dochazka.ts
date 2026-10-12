// Kolo 7, balík R7-2 (Docházka) — Píchačky s dnešní směnou z rozvrhu.
//
// Čistá logika je v lib/dochazkaPrehled.ts. Hlídá se hlavně to, na co se snadno zapomene:
// práh deseti minut (stejný jako tablet), noční směna přes půlnoc a okno tří hodin
// před začátkem.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  PRAH_POZDE_MIN, vyberSmenuPichacek, zpozdeniPichacek,
} from '../../lib/dochazkaPrehled.ts';
import { PRAH_POZDE_MIN as PRAH_TABLETU } from '../../lib/kioskPrehled.ts';
import { pragueMomentOf } from '../../lib/pragueTime.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
/** Pražský čas jako ISO (záznamy z API nesou UTC). */
const p = (den: string, hm: string) => pragueMomentOf(den, hm)!.toISOString();

export default function ({ eq, ok }: Testy) {
  // ---- práh ----
  eq('práh pozdního příchodu je stejný jako na tabletu (10 min)', [PRAH_POZDE_MIN, PRAH_TABLETU], [10, 10]);

  // ---- Píchačky ----
  const ted = pragueMomentOf('2026-09-26', '14:00')!.getTime();
  const dnes = '2026-09-26';
  eq('Píchačky: příchod 14:12 na směnu od 14:00 = +12 min po začátku', zpozdeniPichacek(dnes, '14:00', p(dnes, '14:12'), ted), { druh: 'pozde', min: 12 });
  eq('Píchačky: příchod 14:08 nic (do 10 min)', zpozdeniPichacek(dnes, '14:00', p(dnes, '14:08'), ted), null);
  eq('Píchačky: před příchodem 45 min do začátku = „začíná za 45 min"', zpozdeniPichacek(dnes, '14:45', null, ted), { druh: 'zacina', min: 45 });
  eq('Píchačky: víc než 3 h před začátkem nic', zpozdeniPichacek(dnes, '17:30', null, ted), null);
  eq('Píchačky: 3 h přesně ještě ano', zpozdeniPichacek(dnes, '17:00', null, ted), { druh: 'zacina', min: 180 });
  eq('Píchačky: po začátku bez příchodu nic netvrdí', zpozdeniPichacek(dnes, '13:00', null, ted), null);
  eq('Píchačky: bez směny null', zpozdeniPichacek(dnes, null, p(dnes, '14:12'), ted), null);
  eq('Píchačky: příchod ve 0:30 na včerejší noční od 22:00 = +150 min',
    zpozdeniPichacek('2026-09-25', '22:00', p(dnes, '00:30'), pragueMomentOf(dnes, '01:00')!.getTime()), { druh: 'pozde', min: 150 });

  const smeny = [
    { date: '2026-09-25', start_time: '22:00', end_time: '02:00' },
    { date: dnes, start_time: '16:00:00', end_time: '22:00:00' },
    { date: dnes, start_time: '08:00', end_time: '12:00' },
  ];
  eq('Píchačky: ve 0:30 je to ještě včerejší noční (přes půlnoc)', vyberSmenuPichacek(smeny, dnes, pragueMomentOf(dnes, '00:30')!.getTime()), { shiftStart: '22:00', shiftEnd: '02:00', shiftDate: '2026-09-25' });
  eq('Píchačky: ve 3:00 už dnešní první směna (seřazená podle začátku)', vyberSmenuPichacek(smeny, dnes, pragueMomentOf(dnes, '03:00')!.getTime()), { shiftStart: '08:00', shiftEnd: '12:00', shiftDate: dnes });
  eq('Píchačky: ve 3:00 s otevřeným příchodem z noční pořád noční', vyberSmenuPichacek(smeny, dnes, pragueMomentOf(dnes, '03:00')!.getTime(), p('2026-09-25', '22:05')), { shiftStart: '22:00', shiftEnd: '02:00', shiftDate: '2026-09-25' });
  eq('Píchačky: včerejší denní směna se nebere', vyberSmenuPichacek([{ date: '2026-09-25', start_time: '08:00', end_time: '16:00' }], dnes, ted), null);
  eq('Píchačky: bez směn null', vyberSmenuPichacek([], dnes, ted), null);

  // ---- API ----
  const api = zdroj('app/api/attendance/route.ts');
  ok('API: zaměstnanec dostane dnešní směnu v rosteru (vyberSmenuPichacek)', /vyberSmenuPichacek\(/.test(api) && /shiftStart: smena\?\.shiftStart/.test(api));
  ok('API: plán Píchaček je jen plánovaná směna (bez automatických ze samotného příchodu)', (api.match(/type <> 'auto'/g) ?? []).length >= 3);
}
