// Oprava „pauza zapne novou směnu" (Martin: „Když si někdo zapne pauzu a pak ji ukončí, tak se mu to zapne
// jako nová směna, a ne pokračování v té staré.").
//
// Pauza je v databázi mezera mezi dvěma záznamy: záznam před pauzou (A) a záznam po ní se zdrojem 'break'
// a break_after = A (B). Hodiny i mzda jsou tím správně (pauza se nepočítá), jenže Píchačky, tablet a souhrny
// braly B jako samostatnou směnu: „Příchod 12:30" se stopkami od nuly, „+270 min po začátku", „2 směny"
// v Souhrnu hodin a souhrn odchodu na tabletu jen za odpoledne. Tady se hlídá, že směna s pauzou je jedna:
// začátek je první příchod, odpracovaný čas je bez pauzy a počet směn ji počítá jednou.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  mujMesic, odpracovanoVeSmene, pokracovaniPoPauze, radkyMojeDochazky, smenaClena, souhrnHodin, type ZaznamDochazky,
} from '../../lib/dochazkaPrehled.ts';
import { souhrnOdchodu } from '../../lib/kioskPrehled.ts';
import { rosterSFrontou } from '../../lib/kioskOffline.ts';
import { pragueMomentOf } from '../../lib/pragueTime.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
const p = (den: string, hm: string) => pragueMomentOf(den, hm)!.toISOString();
const MIN = 60_000;
const H = 60 * MIN;

export default function ({ eq, ok }: Testy) {
  const D = '2026-10-14';
  const ted = Date.parse(p(D, '16:00'));
  // Eva: 08:00–12:00, pauza 30 min, od 12:30 běží (záznam po pauze, break_after = 1).
  const A: ZaznamDochazky = { id: 1, employeeId: 5, employeeName: 'Eva', clockIn: p(D, '08:00'), clockOut: p(D, '12:00'), source: 'self' };
  const B: ZaznamDochazky = { id: 2, employeeId: 5, employeeName: 'Eva', clockIn: p(D, '12:30'), clockOut: null, source: 'break', breakAfter: 1 };
  const jiny: ZaznamDochazky = { id: 9, employeeId: 6, employeeName: 'Petr', clockIn: p(D, '10:00'), clockOut: p(D, '14:00'), source: 'kiosk' };

  // ---- běžící směna po pauze ----
  const s = smenaClena([B, A, jiny], 5, ted);
  eq('smena: po konci pauzy směna začíná prvním příchodem (08:00), ne koncem pauzy', s?.zacatek.toISOString(), p(D, '08:00'));
  eq('smena: skončená pauza 30 min, neběží žádná, odpracováno 7 h 30 min (bez pauzy)', [s?.pauzyMs, s?.naPauze, s?.odpracovanoMs], [30 * MIN, false, 7.5 * H]);
  eq('smena: běžící záznam je ten po pauze (odchod zavře jeho)', s?.zaznam.id, 2);
  eq('smena: kdo není na směně, nemá nic', smenaClena([B, A, jiny], 6, ted), null);

  // ---- na pauze ----
  const P: ZaznamDochazky = { id: 3, employeeId: 5, clockIn: p(D, '12:00'), clockOut: p(D, '12:00'), source: 'break', breakAfter: 1 };
  const naPauze = smenaClena([P, A], 5, Date.parse(p(D, '12:10')));
  eq('smena: na pauze — začátek 08:00, pauza od 12:00, odpracováno 4 h (pauza se nepočítá)',
    [naPauze?.naPauze, naPauze?.zacatek.toISOString(), naPauze?.pauzaOd?.toISOString(), naPauze?.odpracovanoMs, naPauze?.pauzyMs], [true, p(D, '08:00'), p(D, '12:00'), 4 * H, 0]);
  eq('smena: pauza starší než 12 h už neběží (jako server)', smenaClena([P, A], 5, Date.parse(p(D, '12:00')) + 13 * H), null);

  // ---- dvě pauzy a starší API bez breakAfter ----
  const A2 = { ...B, id: 2, clockOut: p(D, '14:00') };
  const C: ZaznamDochazky = { id: 4, employeeId: 5, clockIn: p(D, '14:15'), clockOut: null, source: 'break', breakAfter: 2 };
  const dve = smenaClena([C, A2, A], 5, ted);
  eq('smena: dvě pauzy (30 + 15 min) — začátek pořád 08:00, odpracováno 7 h 15 min', [dve?.zacatek.toISOString(), dve?.pauzyMs, dve?.odpracovanoMs], [p(D, '08:00'), 45 * MIN, 7.25 * H]);
  const bezOdkazu = smenaClena([{ ...B, breakAfter: null }, A], 5, ted);
  eq('smena: bez breakAfter (starší API) se vezme nejbližší předchozí odchod téhož člověka', bezOdkazu?.zacatek.toISOString(), p(D, '08:00'));
  const cyklus = smenaClena([{ ...B, breakAfter: 2 }], 5, ted);
  eq('smena: záznam ukazující sám na sebe nezacyklí', cyklus?.zacatek.toISOString(), p(D, '12:30'));

  // ---- přes půlnoc ----
  const N1: ZaznamDochazky = { id: 11, employeeId: 5, clockIn: p(D, '20:00'), clockOut: p(D, '23:50'), source: 'kiosk' };
  const N2: ZaznamDochazky = { id: 12, employeeId: 5, clockIn: p('2026-10-15', '00:20'), clockOut: null, source: 'break', breakAfter: 11 };
  const noc = smenaClena([N2, N1], 5, Date.parse(p('2026-10-15', '02:00')));
  eq('smena: pauza přes půlnoc — směna začala večer předchozího dne, odpracováno 5 h 30 min', [noc?.zacatek.toISOString(), noc?.odpracovanoMs], [p(D, '20:00'), 5.5 * H]);

  // ---- odpracováno z rosteru (Píchačky vedení, tablet) ----
  eq('roster: běží — teď − začátek směny − pauzy', odpracovanoVeSmene({ shiftSince: p(D, '08:00'), openSince: p(D, '12:30'), breakMs: 30 * MIN }, ted), 7.5 * H);
  eq('roster: na pauze — čas stojí na začátku pauzy', odpracovanoVeSmene({ shiftSince: p(D, '08:00'), openSince: null, breakSince: p(D, '12:00'), breakMs: 0 }, ted), 4 * H);
  eq('roster: starší server bez shiftSince — od příchodu', odpracovanoVeSmene({ openSince: p(D, '12:30') }, ted), 3.5 * H);
  eq('roster: mimo směnu 0', odpracovanoVeSmene({ openSince: null }, ted), 0);

  // ---- počty směn ----
  const hotovaB = { ...B, clockOut: p(D, '16:00') };
  eq('pokračování: záznam po pauze je pokračování, jen když je záznam před ní v seznamu', [[...pokracovaniPoPauze([A, hotovaB])], [...pokracovaniPoPauze([hotovaB])]], [['2'], []]);
  const souhrn = souhrnHodin([A, hotovaB, jiny], ted, new Map());
  const eva = souhrn.find(r => r.id === '5')!;
  eq('souhrn: směna s pauzou je JEDNA směna, hodiny bez pauzy (7 h 30 min)', [eva.pocet, eva.ms], [1, 7.5 * H]);
  eq('souhrn: otevřená pauza (nulová délka) se nepočítá jako směna', souhrnHodin([A, P], ted, new Map()).find(r => r.id === '5')?.pocet, 1);
  eq('souhrn: bez záznamu před pauzou (jiné období) se pokračování počítá jako směna období', souhrnHodin([hotovaB], ted, new Map())[0].pocet, 1);
  eq('můj měsíc: jedna směna, 7 h 30 min', [mujMesic([A, hotovaB], 5, '2026-10', ted, null).pocet, mujMesic([A, hotovaB], 5, '2026-10', ted, null).ms], [1, 7.5 * H]);
  eq('moje docházka: jedna směna, jeden den s pauzou 30 min', (() => { const r = radkyMojeDochazky([A, hotovaB], 5, '2026-10', ted); return [r.pocet, r.dny.length, r.dny[0].pauzyMs]; })(), [1, 1, 30 * MIN]);

  // ---- souhrn odchodu na tabletu ----
  eq('tablet: souhrn odchodu po pauze je za celou směnu 08:00–16:00, 7 h 30 min, pauza 30 min',
    (() => { const x = souhrnOdchodu({ clockIn: p(D, '12:30'), clockOut: p(D, '16:00'), shiftStart: p(D, '08:00'), breakMs: 30 * MIN }, true); return x && [x.prichod, x.odchod, x.odpracovano, x.pauzaMin]; })(),
    ['08:00', '16:00', '7 h 30 min', 30]);
  eq('tablet: starší server bez shiftStart — jako dřív', souhrnOdchodu({ clockIn: p(D, '12:30'), clockOut: p(D, '16:00') }, true)?.prichod, '12:30');

  // ---- fronta tabletu bez internetu ----
  const fr = rosterSFrontou([{ id: 5, openSince: null, breakSince: p(D, '12:00'), shiftSince: p(D, '08:00') }], [{ klic: 'k', employeeId: 5, jmeno: 'Eva', action: 'out', cas: p(D, '12:20'), pinOvereno: false }]);
  eq('fronta: odchod z pauzy bez internetu — člověk už není ani na pauze', [fr[0].openSince, fr[0].breakSince], [null, null]);
  const fr2 = rosterSFrontou([{ id: 5, openSince: null, breakSince: p(D, '12:00'), shiftSince: p(D, '08:00'), breakMs: 0 }], [{ klic: 'k2', employeeId: 5, jmeno: 'Eva', action: 'in', cas: p(D, '12:20'), pinOvereno: false }]);
  eq('fronta: příchod během pauzy bez internetu = konec pauzy, směna od 08:00 pokračuje s pauzou 20 min', [fr2[0].openSince, fr2[0].breakSince, fr2[0].shiftSince, fr2[0].breakMs], [p(D, '12:20'), null, p(D, '08:00'), 20 * MIN]);

  // ---- napojení (server, Píchačky, tablet) ----
  const api = zdroj('app/api/attendance/route.ts');
  ok('API: GET rosteru nese začátek směny a pauzy (shiftSince, breakMs) ze řetězu pauz', api.includes('poleRosteru(') && api.includes('smenyClenu(') && /shiftSince: s\.zacatek\.toISOString\(\), breakMs: s\.pauzyMs/.test(zdroj('lib/smenaPauzyDb.ts')));
  ok('API: odchod po pauze — den směny podle prvního příchodu a souhrn za celou směnu', /zacatekSmeny = .*smena/.test(api) && api.includes('shiftStart'));
  ok('API: zaměstnanec dostane na vlastním řádku i breakSince (Konec pauzy i bez záznamů dne)', /breakSince: mojeSmena\?\.naPauze/.test(api));
  const sync = zdroj('app/api/attendance/sync/route.ts');
  ok('sync: odchod z pauzy bez internetu pauzu smaže (jako online), nekončí 409', sync.includes("source = 'break' AND clock_out = clock_in") && /DELETE FROM time_entries/.test(sync));
  const w = zdroj('components/widgety/oblasti/dochazka.tsx');
  ok('Píchačky: stopky a „Příchod" od začátku směny, ne od konce pauzy', w.includes('shiftSince') && w.includes('odpracovanoVeSmene('));
  ok('Píchačky: pozdní příchod proti plánu od začátku směny (ne „+270 min" po pauze)', /zpozdeniPichacek\(.*zacatekSmeny/.test(w));
  ok('Píchačky: pauza i z rosteru (vedení bez záznamů, pauza přes půlnoc)', w.includes('muj?.breakSince'));
  const k = zdroj('components/kiosk/KioskShiftGate.tsx');
  ok('tablet: „Na směně od" a doba od začátku směny bez pauzy', k.includes('shiftSince') && k.includes('odpracovanoVeSmene('));
}
