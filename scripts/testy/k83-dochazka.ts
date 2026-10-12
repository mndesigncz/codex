// Kolo 7, balík R7-2 (Docházka) — plán proti skutečnosti, důvod ruční opravy, Píchačky
// s dnešní směnou a „Moje docházka" po dnech.
//
// Čistá logika je v lib/dochazkaPrehled.ts. Hlídá se hlavně to, na co se snadno zapomene:
// práh deseti minut (stejný jako tablet), noční směna přes půlnoc, otevřený záznam,
// přestávka (dva záznamy na jednu směnu nesmí hlásit „+270 min pozdě" ani plán dvakrát),
// „ručně" i u záznamu z tabletu, který vedení opravilo, a součet měsíce, který musí
// sedět s widgetem Odpracováno.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  PRAH_POZDE_MIN, csvPlanAUprava, mujMesic, odchylkaOdPlanu, odchylkyZaznamu, orizniSeznam, radkyMojeDochazky, seradSouhrn, souhrnHodin,
  vyberSmenuPichacek, zpozdeniPichacek, type ZaznamDochazky,
} from '../../lib/dochazkaPrehled.ts';
import { PRAH_POZDE_MIN as PRAH_TABLETU } from '../../lib/kioskPrehled.ts';
import { dayPlus, pragueMomentOf } from '../../lib/pragueTime.ts';
import { widget } from '../../lib/widgety/katalog/index.ts';
import { STRANKA as MOJE_SMENY } from '../../lib/widgety/stranky/zamestnanec.moje_smeny.ts';
import { AUDIT_POPISKY } from '../../lib/auditPopisky.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
/** Pražský čas jako ISO (záznamy z API nesou UTC). */
const p = (den: string, hm: string) => pragueMomentOf(den, hm)!.toISOString();
const MIN = 60_000;

export default function ({ eq, ok }: Testy) {
  // ---- práh ----
  eq('práh pozdního příchodu je stejný jako na tabletu (10 min)', [PRAH_POZDE_MIN, PRAH_TABLETU], [10, 10]);

  // ---- odchylka od plánu ----
  const den = '2026-09-24';
  const plan = { planStart: '08:00', planEnd: '16:00', den };
  eq('odchylka: příchod 08:12 na směnu od 8:00 = +12 min pozdě, odchod 16:05 nic',
    odchylkaOdPlanu({ clockIn: p(den, '08:12'), clockOut: p(den, '16:05'), ...plan }), { pozdeMin: 12, drivMin: null });
  eq('odchylka: do 10 min včetně se netvrdí (08:10 a odchod 15:50)',
    odchylkaOdPlanu({ clockIn: p(den, '08:10'), clockOut: p(den, '15:50'), ...plan }), { pozdeMin: null, drivMin: null });
  eq('odchylka: odchod 15:35 = o 25 min dřív, příchod před začátkem nic',
    odchylkaOdPlanu({ clockIn: p(den, '07:55'), clockOut: p(den, '15:35'), ...plan }), { pozdeMin: null, drivMin: 25 });
  eq('odchylka: plán s vteřinami z databáze („08:00:00") jako „08:00"',
    odchylkaOdPlanu({ clockIn: p(den, '08:20'), clockOut: p(den, '16:00'), planStart: '08:00:00', planEnd: '16:00:00', den }), { pozdeMin: 20, drivMin: null });
  eq('odchylka: příchod 0:40 po půlnoci k včerejší noční směně 22:00–02:00 = +160 min, odchod 01:30 o 30 min dřív',
    odchylkaOdPlanu({ clockIn: p('2026-09-25', '00:40'), clockOut: p('2026-09-25', '01:30'), planStart: '22:00', planEnd: '02:00', den: '2026-09-24' }), { pozdeMin: 160, drivMin: 30 });
  eq('odchylka: noční směna, příchod 22:15 a odchod 02:00 druhý den = jen pozdě',
    odchylkaOdPlanu({ clockIn: p(den, '22:15'), clockOut: p('2026-09-25', '02:00'), planStart: '22:00', planEnd: '02:00', den }), { pozdeMin: 15, drivMin: null });
  eq('odchylka: otevřený záznam nemá „dřív", jen pozdě',
    odchylkaOdPlanu({ clockIn: p(den, '08:30'), clockOut: null, ...plan }), { pozdeMin: 30, drivMin: null });
  eq('odchylka: bez plánu null', odchylkaOdPlanu({ clockIn: p(den, '08:30'), clockOut: p(den, '12:00'), planStart: null, planEnd: null, den }), { pozdeMin: null, drivMin: null });
  eq('odchylka: bez dne směny se bere den příchodu', odchylkaOdPlanu({ clockIn: p(den, '08:15'), clockOut: p(den, '16:00'), planStart: '08:00', planEnd: '16:00' }), { pozdeMin: 15, drivMin: null });
  eq('odchylka: přes 12 h od plánu už to není zpoždění', odchylkaOdPlanu({ clockIn: p(den, '21:00'), clockOut: p(den, '23:00'), planStart: '08:00', planEnd: '09:00', den }), { pozdeMin: null, drivMin: null });

  // ---- odchylky po směnách (přestávka) a souhrn ----
  const z = (id: number, kdo: number, od: string, doCasu: string | null, x: Partial<ZaznamDochazky> = {}): ZaznamDochazky =>
    ({ id, employeeId: kdo, employeeName: `Člověk ${kdo}`, clockIn: od, clockOut: doCasu, source: 'kiosk', ...x });
  const ted = pragueMomentOf('2026-09-26', '14:00')!.getTime();
  const sPlanem = (d: string) => ({ planStart: '08:00', planEnd: '16:00', planDate: d });
  const zaznamy = [
    // Člověk 1: přestávka — 08:12–12:00 a 12:30–15:40 na jednu směnu 8–16.
    z(1, 1, p('2026-09-24', '08:12'), p('2026-09-24', '12:00'), sPlanem('2026-09-24')),
    z(2, 1, p('2026-09-24', '12:30'), p('2026-09-24', '15:40'), sPlanem('2026-09-24')),
    // Člověk 1: další dva dny pozdě, jeden včas.
    z(3, 1, p('2026-09-23', '08:25'), p('2026-09-23', '16:00'), sPlanem('2026-09-23')),
    z(4, 1, p('2026-09-22', '08:11'), p('2026-09-22', '16:00'), sPlanem('2026-09-22')),
    z(5, 1, p('2026-09-21', '08:00'), p('2026-09-21', '16:00'), sPlanem('2026-09-21')),
    // Člověk 2: bez plánu.
    z(6, 2, p('2026-09-24', '09:00'), p('2026-09-24', '17:00')),
  ];
  const ods = odchylkyZaznamu(zaznamy, ted);
  eq('přestávka: pozdě jen u prvního příchodu, dřív jen u posledního odchodu', [ods.get('1'), ods.get('2')], [
    { pozdeMin: 12, drivMin: null, planMs: 8 * 60 * MIN, rozdilMin: -62 },
    { pozdeMin: null, drivMin: 20, planMs: 0, rozdilMin: null },
  ]);
  ok('bez plánu záznam v mapě odchylek není', !ods.has('6'));
  const souhrn = souhrnHodin(zaznamy, ted, new Map(), { plan: true });
  const r1 = souhrn.find(r => r.id === '1')!, r2 = souhrn.find(r => r.id === '2')!;
  eq('souhrn: plán 4 směny × 8 h = 32 h (přestávka jednou), 3× pozdě (08:12, 08:25, 08:11)', [r1.planMs / (3600 * 1000), r1.pozde], [32, 3]);
  eq('souhrn: bez plánu 0 a 0', [r2.planMs, r2.pozde], [0, 0]);
  eq('souhrn: bez doplňku plan se plán nepočítá (signatura beze změny)', souhrnHodin(zaznamy, ted, new Map()).find(r => r.id === '1')!.planMs, 0);
  eq('souhrn: řazení „pozdě" dá nahoru toho, kdo chodí pozdě', seradSouhrn(souhrn, 'pozde').map(r => r.id), ['1', '2']);

  // ---- CSV ----
  const upraveny = z(7, 1, p('2026-09-25', '08:12'), p('2026-09-25', '16:05'), { ...sPlanem('2026-09-25'), note: '  Zapomněla se odpíchnout  ', updatedBy: 15, updatedByName: 'Martin Nemeškal' });
  eq('CSV: plán od/do, odchylka (odpracováno − plán), důvod a kdo upravil',
    csvPlanAUprava(upraveny, odchylkyZaznamu([upraveny], ted).get('7')), ['08:00', '16:00', '-7', 'Zapomněla se odpíchnout', 'Martin Nemeškal']);
  eq('CSV: bez plánu a bez úpravy prázdné sloupce, poznámka ze samoobsluhy zůstane', csvPlanAUprava(z(8, 2, p(den, '09:00'), p(den, '10:00'), { note: 'Z uzávěrky' }), undefined), ['', '', '', 'Z uzávěrky', '']);

  // ---- Píchačky ----
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

  // ---- Moje docházka po dnech ----
  const me = 16;
  const moje = [
    z(20, me, p('2026-09-26', '13:00'), null),                                     // dnes běží 1 h
    z(21, me, p('2026-09-25', '08:02'), p('2026-09-25', '12:00')),                 // přestávka
    z(22, me, p('2026-09-25', '12:30'), p('2026-09-25', '16:10'), { note: 'Dodávka' }),
    z(23, me, p('2026-09-24', '08:00'), p('2026-09-24', '16:00'), { source: 'manual' }),     // ručně přidaný
    z(24, me, p('2026-09-23', '08:00'), p('2026-09-23', '15:00'), { updatedBy: 15 }),        // z tabletu, opravený vedením
    z(25, me, p('2026-09-22', '08:00'), p('2026-09-22', '16:00')),
    z(26, me, p('2026-09-21', '08:00'), p('2026-09-21', '16:00')),
    z(27, me, p('2026-09-20', '08:00'), p('2026-09-20', '16:00')),
    z(28, me, p('2026-08-31', '08:00'), p('2026-08-31', '16:00')),                 // minulý měsíc
    z(29, 99, p('2026-09-24', '08:00'), p('2026-09-24', '16:00')),                 // cizí
  ];
  const md = radkyMojeDochazky(moje, me, '2026-09', ted);
  eq('moje docházka: den na řádek, nejnovější první, jen můj měsíc', md.dny.map(d => d.den), ['2026-09-26', '2026-09-25', '2026-09-24', '2026-09-23', '2026-09-22', '2026-09-21', '2026-09-20']);
  eq('moje docházka: přestávka = jeden den se dvěma úseky a poznámkou', [md.dny[1].useky.length, md.dny[1].ms / MIN, md.dny[1].poznamky], [2, 238 + 220, ['Dodávka']]);
  eq('moje docházka: ručně = source manual nebo upraveno vedením', md.dny.map(d => d.rucne), [false, false, true, true, false, false, false]);
  ok('moje docházka: dnešní běží', md.dny[0].bezi && !md.dny[0].zapomenuty);
  eq('moje docházka: součet měsíce = Odpracováno (mujMesic)', md.ms, mujMesic(moje, me, '2026-09', ted, null).ms);
  const zapomenuty = radkyMojeDochazky([z(30, me, p('2026-09-25', '08:00'), null)], me, '2026-09', ted);
  eq('moje docházka: otevřený příchod přes 16 h = zapomenutý odchod, do součtu 0', [zapomenuty.dny[0].zapomenuty, zapomenuty.ms], [true, 0]);
  eq('moje docházka: prázdný měsíc', radkyMojeDochazky(moje, me, '2026-07', ted), { dny: [], ms: 0, pocet: 0 });
  const m5 = orizniSeznam(md.dny, 5);
  eq('M: 5 nejnovějších dní a „…a dalších 2"', [m5.zobrazene.length, m5.dalsich, m5.zobrazene[4].den], [5, 2, '2026-09-22']);
  eq('L: celý měsíc bez oříznutí', orizniSeznam(md.dny, Infinity).dalsich, 0);

  // ---- katalog a stránka ----
  const w = widget('dochazka.moje_zaznamy');
  ok('katalog: Moje docházka je hotová, M/L, jen zaměstnanec, bez klíče jako Odpracováno', !!w && w.stav === 'hotovo' && JSON.stringify(w.velikosti) === '["M","L"]'
    && w.vychoziVelikost === 'M' && JSON.stringify(w.rozhrani) === '["zamestnanec"]' && JSON.stringify(w.opravneni) === JSON.stringify(widget('dochazka.moje_odpracovano')?.opravneni));
  eq('katalog: nastavení měsíce tento/minulý jako Můj výdělek', w?.nastaveni, widget('moje.vydelek')?.nastaveni);
  const vychozi = MOJE_SMENY.vychozi['typ:zamestnanec'] ?? [];
  const i = vychozi.findIndex(x => x.w === 'dochazka.moje_zaznamy');
  ok('Moje směny: Moje docházka (M) ve výchozím rozložení pod Můj výdělek, před nástrojem, a v doporučených',
    i > vychozi.findIndex(x => x.w === 'moje.vydelek') && i < vychozi.findIndex(x => x.w === 'nastroj') && vychozi[i].s === 'M' && MOJE_SMENY.doporucene.includes('dochazka.moje_zaznamy'));

  // ---- API a audit ----
  const api = zdroj('app/api/attendance/route.ts');
  ok('API: záznamy vedení s plánem jedním dotazem (LEFT JOIN LATERAL shifts, bez automatických směn)', /LEFT JOIN LATERAL \(\s*SELECT s\.date, s\.start_time, s\.end_time FROM shifts s/.test(api) && /AS "planStart"/.test(api) && /s\.type <> 'auto'/.test(api));
  ok('API: záznamy nesou kdo upravil (updatedByName) a kdy', /AS "updatedByName"/.test(api) && /AS "updatedAt"/.test(api));
  ok('API: zaměstnanec dostane dnešní směnu v rosteru (vyberSmenuPichacek)', /vyberSmenuPichacek\(/.test(api) && /shiftStart: smena\?\.shiftStart/.test(api));
  ok('API: PATCH i ruční POST ukládají důvod, kdo a kdy (updated_by, updated_at)', (api.match(/updated_by/g) ?? []).length >= 3 && /updated_at = /.test(api));
  ok('API: zápisy docházky do auditu s klíčem', /audit\(c\.teamId, c\.meId, 'dochazka\.upravit'/.test(api) && /audit\(c\.teamId, c\.meId, 'dochazka\.pridat'/.test(api) && /audit\(c\.teamId, c\.meId, 'dochazka\.smazat'/.test(api));
  ok('audit: popisky docházky', !!AUDIT_POPISKY['dochazka.upravit'] && !!AUDIT_POPISKY['dochazka.pridat'] && !!AUDIT_POPISKY['dochazka.smazat']);
  ok('DDL: time_entries.updated_by a updated_at', /ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS updated_by INTEGER/.test(zdroj('app/api/init/route.ts')) && /ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP/.test(zdroj('app/api/init/route.ts')));
  ok('den směny: včerejšek se počítá přes dayPlus (žádné new Date − 86400000)', dayPlus('2026-03-30', -1) === '2026-03-29');

  // ---- UI ----
  const ui = zdroj('components/employer/Attendance.tsx');
  ok('Docházka: okna Upravit čas a Přidat záznam mají Důvod (nepovinné) s Textarea do 300 znaků', (ui.match(/t\('Důvod \(nepovinné\)'\)/g) ?? []).length >= 2 && /const MAX_DUVOD = 300;/.test(ui) && (ui.match(/<Textarea[^>]*maxLength=\{MAX_DUVOD\}/g) ?? []).length >= 2);
  ok('Docházka: CSV má sloupce Plán od, Plán do, Odchylka (min), Poznámka, Upravil', ['Plán od', 'Plán do', 'Odchylka (min)', 'Poznámka', 'Upravil'].every(s => ui.includes(`'${s}'`)));
  ok('Docházka: Zkontrolovat jen u poznámky bez ruční úpravy', /e\.note && !upraveno/.test(ui));
}
