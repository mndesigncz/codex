// Kolo 8, balík R8-4 (Finance, tržby, sklad a TO GO): jednotkové testy čisté
// logiky v lib/financeWidgety.ts a lib/skladPrehled.ts.
//
// Hlídá se hlavně to, co by jinak lhalo potichu: náklad směny z běžící a hotové
// docházky (zapomenuté odpíchnutí není třicet hodin), podíl bez tržby (null, ne
// nula), odhad do konce plánu jen u lidí, kteří ještě mají přijít.

import type { Testy } from './_testy.ts';
import {
  kcNaHodinuPoDnech, mzdyDnes, podilNakladu, trzbaNaHodinu, vyberDochazkuDnes, vyberFinance,
  urlFinanci, rozsahMesicu, obdobiZRozsahu, rozsahZVolby, predchoziRozsahMesicu, lonskyRozsah, rozsahSrovnani, mesiceRozsahu, pocetMesicuRozsahu, zmenySouhrnu,
  vyberHeat, mapaTrzeb, maticeMenu,
} from '../../lib/financeWidgety.ts';
import { mesicZVolby } from '../../lib/widgety/katalog/finance.ts';
import { ubytekPohybu, spotrebaZPohybu, zasobaVObsahu, dojdeZaDni, tonDojde, navrhNaDni, vyberPredpoved } from '../../lib/skladPrehled.ts';

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

  // ---- tržba na hodinu práce (SPLH) ----
  eq('Kč/h: celé jednotky; bez hodin null (ne nekonečno, ne nula)', [trzbaNaHodinu(184320, 148.6), trzbaNaHodinu(1000, 0), trzbaNaHodinu(0, 10)], [1240, null, 0]);
  const fin = vyberFinance({
    month: '2026-10',
    summary: { revenue: 184320, prevRevenue: 171450, wagesWorked: 48200, wagesCash: 0, purchases: 0, gross: 0, mzdySkryte: false, wagesHours: 148.6, prevWagesHours: 152 },
    weekdays: [
      { wd: 0, revenue: 20800, days: 4, hours: 20 }, { wd: 1, revenue: 16400, days: 4, hours: 20 }, { wd: 2, revenue: 23600, days: 4, hours: 20 },
      { wd: 3, revenue: 25000, days: 4, hours: 20 }, { wd: 4, revenue: 32560, days: 4, hours: 22 }, { wd: 5, revenue: 38880, days: 3, hours: 24 },
      // Neděle: zavřeno (bez uzávěrek) — nemá Kč/h, ne nulu.
      { wd: 6, revenue: 0, days: 0, hours: 0 },
    ],
  });
  eq('finance: hodiny a dny v týdnu se vyberou (sedm řádků, pondělí první)', [fin.souhrn.wagesHours, fin.souhrn.prevWagesHours, fin.dnyVTydnu.length, fin.dnyVTydnu[0].trzba, fin.dnyVTydnu[6].dnu], [148.6, 152, 7, 20800, 0]);
  const stary = vyberFinance({ month: '2026-10', summary: { revenue: 1, mzdySkryte: false } });
  eq('finance: starší server bez hodin a dnů — nuly, sedm prázdných řádků, Kč/h null', [stary.souhrn.wagesHours, stary.dnyVTydnu.length, trzbaNaHodinu(stary.souhrn.revenue, stary.souhrn.wagesHours)], [0, 7, null]);
  const dny = kcNaHodinuPoDnech(fin);
  eq('Kč/h po dnech: úterý je nejslabší, neděle bez dat je null a nejslabší není', [dny.map(d => d.kcH), dny.findIndex(d => d.nejslabsi)], [[1040, 820, 1180, 1250, 1480, 1620, null], 1]);
  eq('Kč/h po dnech: se skrytými mzdami nic (role bez finance.mzdy)', kcNaHodinuPoDnech({ ...fin, souhrn: { ...fin.souhrn, mzdySkryte: true } }).every(d => d.kcH == null && !d.nejslabsi), true);
  eq('Kč/h po dnech: jeden den s hodnotou nemá nejslabšího (není s čím srovnat)',
    kcNaHodinuPoDnech({ ...fin, dnyVTydnu: fin.dnyVTydnu.map((d, i) => (i === 0 ? d : { ...d, dnu: 0, hodiny: 0 })) }).filter(d => d.nejslabsi).length, 0);

  // ---- období Financí: měsíc nebo rozsah měsíců ----
  eq('období: URL jednoho měsíce zůstává ?month=, rozsah jde přes from/to', [urlFinanci('2026-10'), urlFinanci('2026-07:2026-09'), urlFinanci('2026-10:2026-10')],
    ['/api/finance?month=2026-10', '/api/finance?from=2026-07&to=2026-09', '/api/finance?month=2026-10']);
  eq('období: rozsah z řetězce, obrácený se srovná, vadný = dnešní měsíc', [rozsahMesicu('2026-09:2026-07', DNES), rozsahMesicu('nic', DNES), obdobiZRozsahu('2026-07', '2026-07')],
    [{ od: '2026-07', do: '2026-09' }, { od: '2026-10', do: '2026-10' }, '2026-07']);
  eq('období: rychlé volby k 13. 10. 2026 (čtvrtletí a rok jen do dnešního měsíce)', [
    rozsahZVolby('tento_mesic', DNES), rozsahZVolby('minuly_mesic', DNES), rozsahZVolby('ctvrtleti', DNES), rozsahZVolby('od_zacatku_roku', DNES), rozsahZVolby('lonsky_rok', DNES),
    rozsahZVolby('ctvrtleti', '2026-08-05'),
  ], [
    { od: '2026-10', do: '2026-10' }, { od: '2026-09', do: '2026-09' }, { od: '2026-10', do: '2026-10' }, { od: '2026-01', do: '2026-10' }, { od: '2025-01', do: '2025-12' },
    { od: '2026-07', do: '2026-08' },
  ]);
  eq('období: předchozí stejně dlouhý rozsah a stejné období loni (i přes přelom roku)', [
    predchoziRozsahMesicu('2026-07', '2026-09'), predchoziRozsahMesicu('2026-01', '2026-02'), lonskyRozsah('2026-01', '2026-10'), pocetMesicuRozsahu('2025-11', '2026-02'),
  ], [{ od: '2026-04', do: '2026-06' }, { od: '2025-11', do: '2025-12' }, { od: '2025-01', do: '2025-10' }, 4]);
  eq('období: srovnávané období podle volby', [rozsahSrovnani('2026-07:2026-09', 'predchozi'), rozsahSrovnani('2026-07:2026-09', 'loni'), rozsahSrovnani('2026-10', 'loni')],
    ['2026-04:2026-06', '2025-07:2025-09', '2025-10']);
  eq('období: měsíce rozsahu od nejnovějšího (kniha po měsících)', mesiceRozsahu('2025-11', '2026-02'), ['2026-02', '2026-01', '2025-12', '2025-11']);
  eq('období: volba „Minulý" ve widgetu u rozsahu = stejně dlouhý rozsah před ním', [mesicZVolby('minuly', '2026-07:2026-09'), mesicZVolby('minuly', '2026-01'), mesicZVolby('tento', '2026-07:2026-09')],
    ['2026-04:2026-06', '2025-12', '2026-07:2026-09']);
  const rozsah = vyberFinance({ month: '2026-07', from: '2026-07', to: '2026-09', months: 3, prevFrom: '2026-04', prevTo: '2026-06', summary: { revenue: 540000, prevRevenue: 500000, purchases: 150000, wagesWorked: 120000, wagesCash: 0, gross: 270000, net: 150000, fixedCosts: 120000, fixedCostsSet: true, mzdySkryte: false } });
  eq('finance: odpověď za rozsah nese od, do, počet měsíců a srovnávané období', [rozsah.od, rozsah.do, rozsah.mesicu, rozsah.predOd, rozsah.predDo], ['2026-07', '2026-09', 3, '2026-04', '2026-06']);
  const starsi = vyberFinance({ month: '2026-10', prevMonth: '2026-09', summary: { revenue: 1, mzdySkryte: false } });
  eq('finance: starší server bez from/to = jeden měsíc, srovnání = prevMonth', [starsi.od, starsi.do, starsi.mesicu, starsi.predOd], ['2026-10', '2026-10', 1, '2026-09']);
  const pred = vyberFinance({ month: '2026-04', from: '2026-04', to: '2026-06', months: 3, summary: { revenue: 500000, prevRevenue: 0, purchases: 100000, wagesWorked: 100000, wagesCash: 0, gross: 300000, net: -20000, mzdySkryte: false } });
  eq('změny souhrnu: čtyři čísla proti srovnávanému období (výsledek proti absolutní hodnotě)', zmenySouhrnu(rozsah, pred), { trzby: 8, nakupy: 50, mzdy: 20, vysledek: 850 });
  eq('změny souhrnu: bez srovnávaného období jen tržby z prevRevenue serveru', zmenySouhrnu(rozsah, null), { trzby: 8, nakupy: null, mzdy: null, vysledek: null });
  eq('změny souhrnu: skryté mzdy = změna mezd null', zmenySouhrnu(rozsah, { ...pred, souhrn: { ...pred.souhrn, mzdySkryte: true } }).mzdy, null);

  // ---- teplotní mapa den v týdnu × hodina ----
  const heatRaw = Array.from({ length: 7 }, (_, wd) => Array.from({ length: 24 }, (_, h) => ({
    trzba: wd === 6 ? 0 : h === 12 ? 4000 * (wd === 4 ? 2 : 1) : h >= 9 && h <= 17 ? 1000 : 0,
    ucty: wd === 6 ? 0 : h === 12 ? 20 : h >= 9 && h <= 17 ? 6 : 0,
    dni: wd === 6 ? 0 : 4, lidi: h === 12 ? 2 : h >= 9 && h <= 17 ? 1 : null,
  })));
  eq('heat: výběr — bez pole heat null (starší server), jinak 7 × 24 s čísly', [vyberHeat({ hours: [] }), vyberHeat({ heat: heatRaw })?.length, vyberHeat({ heat: heatRaw })?.[0].length, vyberHeat({ heat: heatRaw })?.[4][12]],
    [null, 7, 24, { trzba: 8000, ucty: 20, dni: 4, lidi: 2 }]);
  const mapa = mapaTrzeb(vyberHeat({ heat: heatRaw })!, 'trzba');
  eq('heat: hodiny jen v otevírací době (9–17), sedm řádků', [mapa.hodiny[0], mapa.hodiny[mapa.hodiny.length - 1], mapa.radky.length], [9, 17, 7]);
  eq('heat: průměr na den s prodejem (ne součet), neděle bez prodeje = null, špička pátek 12 h', [mapa.radky[0][3].prumer, mapa.radky[4][3].prumer, mapa.radky[6][3].prumer, mapa.spicka && [mapa.spicka.den, mapa.spicka.hodina], mapa.max],
    [1000, 2000, null, [4, 12], 2000]);
  eq('heat: intenzita 0–1 podle nejsilnější buňky (pátek 12 h = 1, pondělí 12 h = 0,5, pondělí 9 h = 0,125)', [mapa.radky[4][3].intenzita, mapa.radky[0][3].intenzita, mapa.radky[0][0].intenzita], [1, 0.5, 0.125]);
  const ucty = mapaTrzeb(vyberHeat({ heat: heatRaw })!, 'ucty');
  eq('heat: metrika účtenky počítá průměr účtenek na den', [ucty.radky[0][3].prumer, ucty.radky[0][0].prumer], [5, 1.5]);
  eq('heat: bez jediné účtenky výchozí okno 8–20 a žádná špička', (() => { const m = mapaTrzeb(heatRaw.map(r => r.map(c => ({ ...c, trzba: 0, ucty: 0 }))), 'trzba'); return [m.hodiny[0], m.hodiny[m.hodiny.length - 1], m.spicka, m.max]; })(), [8, 20, null, 0]);

  // ---- matice menu ----
  const matice = maticeMenu([
    { id: 'p1', name: 'Flat white', qty: 640, revenue: 54400, marginPct: 84 },
    { id: 'p2', name: 'Croissant', qty: 410, revenue: 22550, marginPct: 58 },
    { id: 'p4', name: 'Cheesecake', qty: 120, revenue: 10800, marginPct: 42 },
    { id: 'p5', name: 'Limonáda', qty: 90, revenue: 5400, marginPct: 80 },
    { id: 'p3', name: 'Matcha latte', qty: 220, revenue: 19800, marginPct: null },
  ]);
  // Průměr kusů (640+410+120+90)/4 = 315, průměr marže (84+58+42+80)/4 = 66.
  eq('matice: průměry z položek s recepturou, položky bez receptury jen počtem', [matice.prumerKusy, matice.prumerMarze, matice.bezReceptury], [315, 66, 1]);
  eq('matice: hvězdy, tahouni, hádanky, psi', matice.polozky.map(p => [p.name, p.kvadrant]), [['Flat white', 'hvezdy'], ['Croissant', 'tahouni'], ['Cheesecake', 'psi'], ['Limonáda', 'hadanky']]);
  eq('matice: počty po kvadrantech', matice.pocty, { hvezdy: 1, tahouni: 1, hadanky: 1, psi: 1 });
  eq('matice: bez položky s marží je prázdná, ne nuly tvářící se jako data', maticeMenu([{ id: 'x', name: 'X', qty: 5, revenue: null, marginPct: null }]), { prumerKusy: 0, prumerMarze: 0, polozky: [], pocty: { hvezdy: 0, tahouni: 0, hadanky: 0, psi: 0 }, bezReceptury: 1 });
  eq('matice: jediná položka je hvězda (rovná se průměru)', maticeMenu([{ id: 'a', name: 'A', qty: 10, revenue: 100, marginPct: 50 }]).polozky[0].kvadrant, 'hvezdy');

  // ---- sklad: dojde za ~N dní podle skutečné spotřeby ----
  const pohyb = (x: Partial<import('../../lib/skladPrehled.ts').PohybProSpotrebu>) => ({ itemId: 1, oldQuantity: 0, newQuantity: 0, oldOpen: null, newOpen: null, note: 'Prodej (Storyous)', packageSize: null, ...x });
  eq('spotřeba: úbytek kusů, přírůstek 0, inventura a založení 0', [
    ubytekPohybu(pohyb({ oldQuantity: 8, newQuantity: 5 })), ubytekPohybu(pohyb({ oldQuantity: 2, newQuantity: 8, note: 'Příjem objednávky' })),
    ubytekPohybu(pohyb({ oldQuantity: 8, newQuantity: 6, note: 'Inventura #3' })), ubytekPohybu(pohyb({ oldQuantity: 0, newQuantity: 5, note: 'Založení položky' })),
  ], [3, 0, 0, 0]);
  eq('spotřeba: načaté balení — odpis z lahve bez změny kusů, i přes otevření nové lahve', [
    ubytekPohybu(pohyb({ oldQuantity: 3, newQuantity: 3, oldOpen: 0.39, newOpen: 0.35, packageSize: 0.7 })),
    ubytekPohybu(pohyb({ oldQuantity: 3, newQuantity: 2, oldOpen: 0.02, newOpen: 0.66, packageSize: 0.7 })),
  ], [0.04, 0.06]);
  const spotreba = spotrebaZPohybu([pohyb({ oldQuantity: 8, newQuantity: 5 }), pohyb({ oldQuantity: 5, newQuantity: 4 }), pohyb({ itemId: 2, oldQuantity: 1, newQuantity: 1, note: 'Prodej (Storyous)' }), pohyb({ itemId: 3, oldQuantity: 2, newQuantity: 6, note: 'Příjem' })]);
  eq('spotřeba: součet po položkách; položka bez úbytku v mapě není', [spotreba.get(1), spotreba.has(2), spotreba.has(3)], [4, false, false]);
  eq('zásoba v obsahu: balení × velikost + načaté; bez balení kusy', [zasobaVObsahu({ quantity: 3, openAmount: 0.35, packageSize: 0.7 }), zasobaVObsahu({ quantity: 8 }), zasobaVObsahu({ quantity: -1 })], [2.45, 8, 0]);
  eq('dojde za: dny na desetiny; bez spotřeby null (ne nekonečno)', [dojdeZaDni(8, 6.1), dojdeZaDni(0, 2), dojdeZaDni(5, 0)], [1.3, 0, null]);
  eq('tón: pod 2 dny bad, pod 5 wait, jinak nic', [tonDojde(1.3), tonDojde(2), tonDojde(4.9), tonDojde(5), tonDojde(null)], ['bad', 'wait', 'wait', null, null]);
  eq('návrh na 7 dní: spotřeba × 7 − zásoba, v celých baleních; stačí-li zásoba, nula', [navrhNaDni(0, 6.1, 7, 10), navrhNaDni(2, 0.5, 7, null), navrhNaDni(50, 2, 7, 10)],
    [{ mnozstvi: 42.7, baleni: 5 }, { mnozstvi: 1.5, baleni: null }, { mnozstvi: 0, baleni: 0 }]);
  const predpoved = vyberPredpoved({ days: 28, items: { 2: { dailyUse: 0.8, unit: 'l', runsOutInDays: 1.3, stock: 1, packageSize: null }, 6: { dailyUse: 0.11, unit: 'l', runsOutInDays: 22.3, stock: 2.45, packageSize: 0.7 }, x: null } });
  eq('předpověď: výběr z API podle id, vadné položky se přeskočí', [Object.keys(predpoved), predpoved[2], predpoved[6].baleni], [['2', '6'], { denni: 0.8, dojdeZa: 1.3, zasoba: 1, jednotka: 'l', baleni: null }, 0.7]);
  eq('předpověď: starší server bez pole = prázdno', vyberPredpoved({}), {});
}
