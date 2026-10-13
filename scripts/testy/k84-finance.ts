// Kolo 8, balík R8-4 (Finance, tržby, sklad a TO GO): jednotkové testy čisté
// logiky v lib/financeWidgety.ts a lib/skladPrehled.ts.
//
// Hlídá se hlavně to, co by jinak lhalo potichu: náklad směny z běžící a hotové
// docházky (zapomenuté odpíchnutí není třicet hodin), podíl bez tržby (null, ne
// nula), odhad do konce plánu jen u lidí, kteří ještě mají přijít.

import type { Testy } from './_testy.ts';
import { mzdyDnes, podilNakladu, vyberDochazkuDnes } from '../../lib/financeWidgety.ts';

const DNES = '2026-10-13';
/** Pražský okamžik dne DNES v „HH:MM" jako ISO v UTC (říjen = letní čas, +02:00). */
const v = (hhmm: string) => new Date(`${DNES}T${hhmm}:00+02:00`).toISOString();
const TED = new Date(v('14:00')).getTime();

export default function ({ eq, ok }: Testy) {
  // ---- výběr z /api/attendance ----
  const d = vyberDochazkuDnes({
    roster: [
      { id: 16, name: 'Eva', avatar: '👩', hourlyRate: 150, openSince: v('10:00'), openEntryId: 1, shiftStart: '10:00', shiftEnd: '18:00' },
      { id: 17, name: 'Jakub', avatar: null, hourlyRate: 0, openSince: v('12:00'), openEntryId: 2, shiftStart: null, shiftEnd: null },
      { id: 18, name: 'Petra', avatar: null, hourlyRate: 180, openSince: null, openEntryId: null, shiftStart: '16:00', shiftEnd: '22:00' },
      { id: 19, name: 'Honza', avatar: null, hourlyRate: 200, openSince: null, openEntryId: null, shiftStart: '08:00', shiftEnd: '12:00' },
      { id: 20, name: 'Zuzka', avatar: null, hourlyRate: 120, openSince: null, openEntryId: null, shiftStart: '13:00', shiftEnd: '20:00' },
    ],
    entries: [
      { id: 1, employeeId: 16, clockIn: v('10:00'), clockOut: null },
      { id: 3, employeeId: 19, clockIn: v('08:00'), clockOut: v('12:00') },
      // Včerejší záznam do dneška nepatří.
      { id: 4, employeeId: 19, clockIn: '2026-10-12T06:00:00.000Z', clockOut: '2026-10-12T14:00:00.000Z' },
    ],
  });
  eq('docházka dnes: roster a záznamy se vyberou, bez záznamů (role bez dochazka.zobrazit) je entries null',
    [d.roster.length, d.entries?.length, vyberDochazkuDnes({ roster: [] }).entries], [5, 3, null]);

  const m = mzdyDnes(d, TED, DNES);
  // Eva 4 h × 150 = 600 (běží), Jakub bez sazby, Honza 4 h × 200 = 800 (hotovo). Zuzka měla přijít ve 13:00 a nepřišla — nepočítá se.
  eq('mzdy dnes: náklad = běžící × sazba + hotové dnešní směny', m.naklad, 1400);
  // Do konce: Eva zbývá 4 h × 150 = 600; Petra teprve přijde 16–22 = 6 h × 180 = 1080; Honza už odešel; Zuzka nepřišla = nevíme.
  eq('mzdy dnes: odhad do konce plánu = zbytek běžících směn + celé směny lidí, kteří teprve přijdou', m.doKonce, 1680);
  eq('mzdy dnes: na směně jsou jen napíchnutí, nejdražší první, s plánovaným koncem', m.lide.map(l => [l.jmeno, l.naklad, l.planDo]), [['Eva', 600, '18:00'], ['Jakub', 0, null]]);
  eq('mzdy dnes: jeden člověk bez sazby, hotové směny v součtu', [m.bezSazby, m.sHotovymi], [1, true]);

  // Bez záznamů (role bez dochazka.zobrazit) jen běžící směny.
  const jenBezici = mzdyDnes({ roster: d.roster, entries: null }, TED, DNES);
  eq('mzdy dnes: bez záznamů jen běžící směny a sHotovymi false', [jenBezici.naklad, jenBezici.sHotovymi], [600, false]);

  // Zapomenuté odpíchnutí (od včerejška 20:00, 18 h) se nepočítá, ale člověk je „na směně" s nulou.
  const zapomenuty = mzdyDnes({ roster: [{ id: 1, name: 'Zapomněl', hourlyRate: 100, openSince: '2026-10-12T18:00:00.000Z', shiftStart: null, shiftEnd: null }], entries: [] }, TED, DNES);
  eq('mzdy dnes: zapomenuté odpíchnutí (nad 16 h) nestojí nic', [zapomenuty.naklad, zapomenuty.lide.length], [0, 1]);

  // Směna přes půlnoc: plán 18:00–02:00, teď 14:00 → celá směna 8 h do konce plánu.
  const nocni = mzdyDnes({ roster: [{ id: 2, name: 'Noc', hourlyRate: 100, openSince: null, shiftStart: '18:00', shiftEnd: '02:00' }], entries: [] }, TED, DNES);
  eq('mzdy dnes: směna přes půlnoc, která teprve začne, stojí celých 8 h', nocni.doKonce, 800);

  // ---- podíl na tržbě ----
  eq('podíl nákladu: celá %, bez tržby null (nula by tvrdila, že lidé nic nestojí)', [podilNakladu(1400, 7000), podilNakladu(1400, 0), podilNakladu(0, 5000)], [20, null, 0]);
  ok('mzdy dnes: prázdný roster = nic', (() => { const x = mzdyDnes({ roster: [], entries: [] }, TED, DNES); return x.naklad === 0 && x.lide.length === 0 && x.doKonce === 0; })());
}
