// Kolo 69, balík B1 (Rozvrh, Moje směny, Dostupnost) — jednotkové testy výpočtů widgetů
// a katalogu.
//
// Výpočty jsou v lib/rozvrhPrehled.ts (čistý modul). Hlídá se hlavně to, co se dřív
// pokazilo: noční směna přes půlnoc vycházela záporně (Moje směny) nebo nulou,
// „odpracováno" počítalo i dnešní směnu, díra ze včerejška strašila v seznamu,
// burza nabízela převzít minulou směnu a stránky kreslily natvrdo bloky, které
// teď musí být hotové widgety (AK-20).

import { existsSync, readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  delkaSmeny, hodinyText, minutyZ, posunMesice, rozsahVolna, dnuVolna, hodinyLidi, dnySDirou, popisDiry, poptavkaTop,
  tymPoDnech, mojeCisla, nadchazejiciSmeny, minuleSmeny, popisekTypu, kategorieBarvy, zadostiVolna, rozdelBurzu,
  denKratce, den,
} from '../../lib/rozvrhPrehled.ts';
import { WIDGETY as ROZVRH } from '../../lib/widgety/katalog/rozvrh.ts';
import { WIDGETY as MOJE } from '../../lib/widgety/katalog/moje-smeny.ts';
import { STRANKA as ROZVRH_V } from '../../lib/widgety/stranky/vedeni.rozvrh.ts';
import { STRANKA as MOJE_V } from '../../lib/widgety/stranky/vedeni.moje_smeny.ts';
import { STRANKA as MOJE_Z } from '../../lib/widgety/stranky/zamestnanec.moje_smeny.ts';
import { STRANKA as DOSTUPNOST } from '../../lib/widgety/stranky/zamestnanec.dostupnost.ts';
import { widget } from '../../lib/widgety/katalog/index.ts';

export default function ({ eq, ok }: Testy) {
  const dnes = '2026-09-26'; // sobota

  // ---- časy a dny ----
  eq('rozvrh: minuty z času (i s vteřinami), neplatný čas = null', [minutyZ('08:30'), minutyZ('22:00:00'), minutyZ(''), minutyZ('xx')], [510, 1320, null, null]);
  eq('rozvrh: délka směny, noční přes půlnoc kladně', [delkaSmeny('08:00', '16:00'), delkaSmeny('22:00', '06:00'), delkaSmeny('08:00', '08:00'), delkaSmeny(null, '16:00')], [8, 8, 24, 0]);
  eq('rozvrh: hodiny česky s desetinnou čárkou', [hodinyText(8), hodinyText(7.5), hodinyText(7.25)], ['8', '7,5', '7,3']);
  eq('rozvrh: posun měsíce přes přelom roku', [posunMesice('2026-12', 1), posunMesice('2026-01', -1), posunMesice('2026-09', 0)], ['2027-01', '2025-12', '2026-09']);
  eq('rozvrh: den z ISO i z data s časem', [den('2026-09-26T00:00:00.000Z'), den('2026-09-26'), den(null)], ['2026-09-26', '2026-09-26', '']);
  eq('rozvrh: krátký den — dnes, zítra, jinak zkratka', [denKratce(dnes, dnes), denKratce('2026-09-27', dnes)], ['Dnes', 'Zítra']);
  ok('rozvrh: krátký den pozítří nese číslo dne', /28\./.test(denKratce('2026-09-28', dnes)));
  eq('volno: rozsah — jeden den, stejný rok, přes rok', [rozsahVolna('2026-10-03', '2026-10-03'), rozsahVolna('2026-10-03', '2026-10-07'), rozsahVolna('2026-12-30', '2027-01-02')],
    ['3. 10. 2026', '3. 10. – 7. 10. 2026', '30. 12. 2026 – 2. 1. 2027']);
  eq('volno: počet dní včetně krajů (i přes letní čas)', [dnuVolna('2026-10-03', '2026-10-07'), dnuVolna('2026-10-24', '2026-10-26'), dnuVolna('2026-10-03', '')], [5, 3, 1]);

  // ---- naplánované hodiny ----
  const smeny = [
    { employeeId: 1, employeeName: 'Eva', date: '2026-09-02', startTime: '08:00', endTime: '16:00' },
    { employeeId: 1, employeeName: 'Eva', date: '2026-09-03', startTime: '22:00', endTime: '06:00' },
    { employeeId: 2, employeeName: 'Petr', date: '2026-09-04', startTime: '10:00', endTime: '14:00' },
    { employeeId: 3, employeeName: 'Adam', date: '2026-09-05', startTime: '08:00', endTime: '20:00' },
    { employeeId: 2, employeeName: 'Petr', date: '2026-10-01', startTime: '08:00', endTime: '16:00' }, // jiný měsíc
  ];
  const bez = hodinyLidi(smeny, '2026-09', null);
  eq('hodiny: bez pravidel podle hodin, noční směna 8 h, jiný měsíc ne', bez.map(c => [c.jmeno, c.hodiny, c.smen, c.limit]), [['Eva', 16, 2, null], ['Adam', 12, 1, null], ['Petr', 4, 1, null]]);
  const s = hodinyLidi(smeny, '2026-09', { teamMaxHours: 20, members: [{ id: 3, maxHours: 10 }, { id: 2, maxHours: 0 }] });
  eq('hodiny: osobní strop má přednost, 0 = bez omezení, nejblíž stropu nahoře', s.map(c => [c.jmeno, c.limit]), [['Adam', 10], ['Eva', 20], ['Petr', null]]);
  ok('hodiny: nad stropem podíl > 1', (s[0].podil ?? 0) > 1);

  // ---- díry ----
  const diry = dnySDirou(
    [{ date: '2026-09-25', from: '08:00', to: '10:00' }, { date: '2026-09-28', from: '14:00:00', to: '16:00' }, { date: '2026-09-28', from: '20:00', to: '22:00' }],
    [{ date: '2026-09-28', shiftTypeName: 'Odpolední' }, { date: '2026-09-28', shiftTypeName: 'Odpolední' }, { date: '2026-09-30', shiftTypeName: 'Ranní' }],
    dnes,
  );
  eq('díry: jen od dneška, po dnech, typ bez duplicit', diry.map(d => [d.den, d.mezery.length, d.neobsazeno]), [['2026-09-28', 2, ['Odpolední']], ['2026-09-30', 0, ['Ranní']]]);
  eq('díry: věta s časy a neobsazeným typem', popisDiry(diry[0]), 'Nikdo 14:00–16:00, 20:00–22:00 · neobsazeno Odpolední');

  // ---- poptávka ----
  eq('poptávka: nejvíc hostů nahoře, bez minulých a prázdných dnů, nejvýš N',
    poptavkaTop({ '2026-09-20': { reservations: 9, guests: 90 }, '2026-09-27': { reservations: 2, guests: 8 }, '2026-09-30': { reservations: 5, guests: 20 }, '2026-10-01': { reservations: 1, guests: 0 } }, dnes, 5).map(d => d.den),
    ['2026-09-30', '2026-09-27']);

  // ---- náhled týmu ----
  const tym = tymPoDnech([
    { id: 1, date: '2026-09-25', startTime: '08:00', employeeName: 'Včera' },
    { id: 2, date: '2026-09-26', startTime: '14:00', employeeName: 'Eva' },
    { id: 3, date: '2026-09-26', startTime: '08:00', employeeName: 'Petr' },
    { id: 4, date: '2026-09-27', startTime: '08:00', employeeName: 'Adam' },
    { id: 5, date: '2026-10-05', startTime: '08:00', employeeName: 'Moc daleko' },
  ], dnes, 2);
  eq('tým: dny od dneška na zvolený počet dní, v dni podle začátku', tym.map(d => [d.den, d.smeny.map(x => x.employeeName)]), [['2026-09-26', ['Petr', 'Eva']], ['2026-09-27', ['Adam']]]);

  // ---- moje směny ----
  const moje = [
    { id: 1, date: '2026-09-24', startTime: '22:00', endTime: '06:00' },
    { id: 2, date: '2026-09-25', start_time: '08:00', end_time: '12:30' },
    { id: 3, date: '2026-09-26', startTime: '08:00', endTime: '16:00' }, // dnes — ještě ne odpracovaná
    { id: 4, date: '2026-09-30', startTime: '08:00', endTime: '16:00' },
  ];
  eq('moje: nadcházející od dneška, odpracováno do včerejška z časů (noční 8 h)', mojeCisla(moje, dnes), { nadchazejici: 2, odpracovanoH: 12.5, minulych: 2, celkem: 4 });
  eq('moje: nadcházející nejbližší první', nadchazejiciSmeny(moje, dnes).map(x => x.id), [3, 4]);
  eq('moje: minulé nejnovější první', minuleSmeny(moje, dnes).map(x => x.id), [2, 1]);
  eq('moje: technické typy nejdou do věty', [popisekTypu({ type: 'auto' }), popisekTypu({ type: 'custom' }), popisekTypu({ type: 'event' }), popisekTypu({ typeLabel: 'Ranní' })], ['Mimo rozvrh', 'Směna', 'Akce', 'Ranní']);
  eq('moje: barva typu → kategorie, neznámá šedá', [kategorieBarvy('#C8F542'), kategorieBarvy('#3b82f6'), kategorieBarvy('#123456')], [1, 2, null]);

  // ---- volno ----
  const zadosti = [
    { id: 1, fromDate: '2026-10-10', toDate: '2026-10-12', type: 'vacation', status: 'pending' },
    { id: 2, fromDate: '2026-10-01', toDate: '2026-10-01', type: 'sick', status: 'pending' },
    { id: 3, fromDate: '2026-09-20', toDate: '2026-09-27', type: 'vacation', status: 'approved' }, // ještě běží
    { id: 4, fromDate: '2026-09-01', toDate: '2026-09-02', type: 'vacation', status: 'approved' }, // proběhlo
    { id: 5, fromDate: '2026-11-01', toDate: '2026-11-02', type: 'other', status: 'rejected' },
  ];
  const z = zadostiVolna(zadosti, dnes);
  eq('volno: čekající podle termínu, schválené jen neskončené, zbytek historie', [z.cekajici.map(x => x.id), z.schvalene.map(x => x.id), z.vyrizene.map(x => x.id)], [[2, 1], [3], [5, 4]]);

  // ---- burza ----
  const nab = (x: Record<string, unknown>) => ({ id: 0, offeredBy: 1, claimedBy: null, status: 'open', date: '2026-09-28', startTime: '08:00', endTime: '16:00', ...x }) as any;
  const b = rozdelBurzu([
    nab({ id: 1, offeredBy: 2 }),                                   // volná od kolegy
    nab({ id: 2, offeredBy: 7 }),                                   // moje nabídka
    nab({ id: 3, offeredBy: 2, claimedBy: 7, status: 'claimed' }),  // beru si já
    nab({ id: 4, offeredBy: 3, claimedBy: 4, status: 'claimed' }),  // cizí ke schválení
    nab({ id: 5, offeredBy: 2, date: '2026-09-20' }),               // minulá — převzít nejde
    nab({ id: 6, offeredBy: 3, claimedBy: 4, status: 'claimed', date: '2026-09-20' }), // minulá, ale vedení ji musí rozhodnout
  ], 7, dnes);
  eq('burza: rozdělení, minulé jen ve frontě ke schválení', [b.volne.map(o => o.id), b.moje.map(o => o.id), b.beru.map(o => o.id), b.keSchvaleni.map(o => o.id)], [[1], [2], [3], [3, 4, 6]]);

  // ---- katalog a stránky ----
  eq('katalog B1: všechny widgety rozvrhu jsou hotové', ROZVRH.filter(w => w.stav !== 'hotovo').map(w => w.id), []);
  eq('katalog B1: všechny widgety Mých směn jsou hotové', MOJE.filter(w => w.stav !== 'hotovo').map(w => w.id), []);
  eq('stránky B1: plochy jsou zapnuté', [ROZVRH_V, MOJE_V, MOJE_Z, DOSTUPNOST].map(st => st.aktivni), [true, true, true, true]);
  for (const st of [ROZVRH_V, MOJE_V, MOJE_Z, DOSTUPNOST]) {
    // Jen vlastní oblasti: Můj výdělek a Odpracováno ve výchozím zaměstnance patří oblasti docházky (B2).
    const vychozi = Object.values(st.vychozi).flatMap(v => v ?? []).map(p => p.w)
      .filter(w => w !== 'nastroj' && ['rozvrh', 'moje-smeny'].includes(widget(w)?.oblast ?? ''));
    eq(`stránky B1: výchozí ${st.id} nemá plánovaný widget rozvrhu ani Mých směn (AK-20)`, vychozi.filter(w => widget(w)?.stav !== 'hotovo'), []);
    ok(`stránky B1: ${st.id} má nástroj ve výchozím`, Object.values(st.vychozi).every(v => (v ?? []).some(p => p.w === 'nastroj')));
    eq(`stránky B1: doporučené ${st.id} existují v katalogu`, st.doporucene.filter(w => !widget(w)), []);
  }
  // Oprávnění podle katalogu (N11 a citlivé volno).
  ok('oprávnění: Žádosti o volno chtějí volno.zobrazit (typ „nemoc" je zdravotní údaj)', !!widget('rozvrh.zadosti_volno')?.opravneni.vse.includes('volno.zobrazit'));
  ok('oprávnění (N11): Dostupnost týmu chce dostupnost.zobrazit', !!widget('rozvrh.dostupnost_tymu')?.opravneni.vse.includes('dostupnost.zobrazit'));
  ok('oprávnění: Kdo má směnu chce rozvrh.nahled', !!widget('rozvrh.tym_nahled')?.opravneni.vse.includes('rozvrh.nahled'));
  ok('oprávnění: Díry, Hodiny a Poptávka chtějí rozvrh.zobrazit', ['rozvrh.diry', 'rozvrh.hodiny_lidi', 'rozvrh.poptavka'].every(id => widget(id)?.opravneni.vse.includes('rozvrh.zobrazit')));
  eq('oprávnění: Výměny směn stačí burza nebo schvalování', widget('rozvrh.vymeny')?.opravneni.nektere, ['rozvrh.burza', 'rozvrh.vymeny_schvalovat']);

  // ---- komponenty ----
  const bezKomentaru = (cesta: string) => readFileSync(new URL(cesta, import.meta.url), 'utf8')
    .split('\n').filter(l => !/^\s*(\/\/|\*|\{\/\*)/.test(l)).join('\n');
  for (const soubor of ['rozvrh', 'moje-smeny']) {
    const src = bezKomentaru(`../../components/widgety/oblasti/${soubor}.tsx`);
    const cteni = [...src.matchAll(/fetch\(([^)]*)\)/g)].map(m => m[1]).filter(a => !/method:/.test(src.slice(src.indexOf(a), src.indexOf(a) + 160)));
    eq(`oblast ${soubor}: fetch jen pro zápis (čtení přes useDataWidgetu)`, cteni, []);
    ok(`oblast ${soubor}: widget nikdy s limetkou (variant="accent")`, !/variant="accent"/.test(src));
  }
  const planovac = bezKomentaru('../../components/scheduling/ScheduleBuilder.tsx');
  ok('plánovač: bez confirm() a bez ručně psaného okna (modal-overlay)', !/\bconfirm\(/.test(planovac) && !/modal-overlay/.test(planovac));
  ok('plánovač: bez rounded-md/lg (DP §6.14) a bez emoji 🪄', !/rounded-(md|lg)\b/.test(planovac) && !planovac.includes('🪄'));
  ok('plánovač: na záložce Rozvrh jediná limetka — Vygenerovat rozvrh (ostatní accent jsou na záložkách nastavení)',
    (planovac.match(/variant="accent"/g) ?? []).length === 5 && /variant="accent" icon="bulb"/.test(planovac));
  ok('plánovač: plocha vedeni.rozvrh', /stranka="vedeni\.rozvrh"/.test(planovac));
  const mojeSmeny = bezKomentaru('../../components/employee/MyShifts.tsx');
  ok('Moje směny: plocha podle rozhraní a bez vlastního fetch pro čtení', /zamestnanec\.moje_smeny/.test(mojeSmeny) && /vedeni\.moje_smeny/.test(mojeSmeny) && !/fetch\(`\/api\/shifts/.test(mojeSmeny));
  const volno = bezKomentaru('../../components/scheduling/TimeOffRequest.tsx');
  ok('Žádost o volno: bez limetky (Odeslat žádost je primary — limetka patří Dostupnosti)', !/variant="accent"/.test(volno) && !/bg-\[#C8F542\]/.test(volno));
  const dostupnost = bezKomentaru('../../components/scheduling/AvailabilitySubmit.tsx');
  ok('Dostupnost: jediná limetka a plocha zamestnanec.dostupnost', (dostupnost.match(/variant="accent"/g) ?? []).length === 1 && /stranka="zamestnanec\.dostupnost"/.test(dostupnost));
  // ---- opravy po review ----
  const vychoziW = (st: typeof MOJE_V) => Object.values(st.vychozi).flatMap(v => v ?? []).map(p => p.w);
  ok('review: Moje směny vedení mají ve výchozím Minulé směny i Kdo má směnu (MyShifts je kreslil i vedení)',
    vychoziW(MOJE_V).includes('moje.minule_smeny') && vychoziW(MOJE_V).includes('rozvrh.tym_nahled'));
  ok('review: Moje směny vedení bez „Zadej dostupnost" ve výchozím (formulář je na téže stránce)', !vychoziW(MOJE_V).includes('rozvrh.pripominka_dostupnosti'));
  ok('review: Dostupnost zaměstnance bez Mého volna ve výchozím (Moje žádosti jsou pod plochou)', !vychoziW(DOSTUPNOST).includes('moje.schvalene_volno'));
  const rozsah = widget('rozvrh.tym_nahled')?.nastaveni?.find(n => n.klic === 'rozsah') as { moznosti?: { id: string }[] } | undefined;
  eq('review: Kdo má směnu nabízí Dnes, Týden i 14 dní (dřív TeamSchedule 14 dní)', rozsah?.moznosti?.map(m => m.id), ['dnes', 'tyden', 'dva_tydny']);
  eq('review: Kdo má směnu — 14 dní rozsahu projde tymPoDnech celé', tymPoDnech([{ id: 1, date: '2026-10-09' }, { id: 2, date: '2026-10-10' }] as any, '2026-09-26', 14).map(d => d.den), ['2026-10-09']);
  ok('review: plánovač kreslí tečky typů třídou kategorie, ne inline hex (DP §6.9)', !/backgroundColor/.test(planovac) && /cat-dot-\$\{k\}/.test(planovac));
  ok('review: plánovač bez čar, které tmavý režim nepřemapuje (border-black/30|50, ring-black/40 bez dark:)',
    [/border-black\/50(?! dark:)/, /border-black\/30(?! dark:)/, /ring-black\/40(?! dark:)/].every(r => !r.test(planovac)));
  ok('review: okno dostupnosti umí režim jen ke čtení (bez dostupnost.upravit)', /jenCist=\{!smiDostupnostUpravit\}/.test(planovac));
  const kalendar = bezKomentaru('../../components/scheduling/ShiftCalendar.tsx');
  ok('review: kalendář směn bez emoji 👤 místo Avataru (DP §3.18)', !kalendar.includes('👤') && /<Avatar /.test(kalendar));
  ok('review: Dostupnost bez border-black/[0.10] a ring-[#16181A]/30 (tmavý režim)', !dostupnost.includes('border-black/[0.10]') && !dostupnost.includes('ring-[#16181A]'));

  for (const stub of ['ShiftSwap', 'ShiftSwapApprovals', 'TimeOffApprovals']) {
    ok(`${stub}: smazaná, fronta je widget plochy Rozvrhu`, !existsSync(new URL(`../../components/scheduling/${stub}.tsx`, import.meta.url)));
  }
}
