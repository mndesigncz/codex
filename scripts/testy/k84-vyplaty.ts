// Kolo 8, balík R8-1 (Výplaty) — jednotkové testy čisté logiky z lib/svatky.ts a lib/dochazkaPrehled.ts.
//
// Peněžní výpočet chce test, ne snímek (DESIGN „Peníze a součty"). Hlídá se hlavně to, na čem stál nález:
// „Moje výplata dnes" z uzávěrky se musí odečíst (doplatit), dýško se dělí podle pravidel a jen od zvoleného dne,
// příplatky jdou po úsecích (sobotní noc přes půlnoc = víkend i noc), DPP hlídá 300 h, pauza je mezera mezi
// záznamy a hodiny se jí nemění, CSV pro účetní má jeden řádek na člověka a Celkem.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { ceskeSvatky, jeSvatek, jeVikend, nazevSvatku, velikonocniNedele } from '../../lib/svatky.ts';
import {
  LIMIT_DPP_HODIN, PAUZA_MIN, POVINNA_PAUZA_PO_MS, VYCHOZI_PRAVIDLA_PRIPLATKU, csvText, csvVyplatniListiny, denZamcen, doplatit, hMM, jeNoc, jeOtevrenaPauza,
  mesiceVyplat, nadHraniciOdvodu, nazevSmlouvy, normalizujPravidlaDyska, normalizujPravidlaPriplatku, normalizujSmlouvu, obdobiZamceno, pauzyZeZaznamu,
  priplatkyVypnute, priplatkyZaznamu, radkyMojeDochazky, rozdelProPauzu, seradListinu, soucetListiny, souhrnHodin, spropitneZaObdobi, stavLimituHodin,
  stavPauzy, vahaPozice, vyplatniListina, type PravidlaDyska, type RadekSouhrnu, type ZaznamDochazky,
} from '../../lib/dochazkaPrehled.ts';
import { pragueMomentOf } from '../../lib/pragueTime.ts';
import { widget } from '../../lib/widgety/katalog/index.ts';
import { STRANKA as DOCHAZKA } from '../../lib/widgety/stranky/vedeni.dochazka.ts';
import { AUDIT_POPISKY } from '../../lib/auditPopisky.ts';
import { ZACHAZENI_TABULEK, TYMOVE_TABULKY } from '../../lib/smazaniUctu.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
const p = (den: string, hm: string) => pragueMomentOf(den, hm)!.toISOString();
const H = 3600_000;

export default function ({ eq, ok }: Testy) {
  // ---- svátky ----
  eq('velikonoce: 2024, 2026, 2027', [velikonocniNedele(2024), velikonocniNedele(2026), velikonocniNedele(2027)], ['2024-03-31', '2026-04-05', '2027-03-28']);
  const sv26 = ceskeSvatky(2026);
  eq('svátky 2026: Velký pátek 3. 4., Velikonoční pondělí 6. 4., 13 pevných + 2', [sv26.get('2026-04-03'), sv26.get('2026-04-06'), sv26.size], ['Velký pátek', 'Velikonoční pondělí', 13]);
  eq('svátky: 28. 9. 2026 ano, 13. 10. 2026 ne, Velký pátek 2015 ještě ne', [jeSvatek('2026-09-28'), jeSvatek('2026-10-13'), ceskeSvatky(2015).has('2015-04-03')], [true, false, false]);
  eq('svátky: název a nečitelný vstup', [nazevSvatku('2026-12-24'), nazevSvatku('nesmysl'), jeSvatek('')], ['Štědrý den', null, false]);
  eq('víkend: sobota 10. 10. 2026 ano, pondělí 12. 10. ne', [jeVikend('2026-10-10'), jeVikend('2026-10-12')], [true, false]);
  ok('svátky jsou čistý modul (bez Reactu a fetch)', !/from 'react'|fetch\(/.test(zdroj('lib/svatky.ts')));

  // ---- příplatky ----
  const PR = VYCHOZI_PRAVIDLA_PRIPLATKU;
  const ted = pragueMomentOf('2026-10-13', '12:00')!.getTime();
  const z = (od: string, doD: string | null, x: Partial<ZaznamDochazky> = {}): ZaznamDochazky => ({ clockIn: od, clockOut: doD, ...x });
  eq('příplatky: pondělí 8–16 nic', priplatkyZaznamu(z(p('2026-10-12', '08:00'), p('2026-10-12', '16:00')), ted, 200, PR), { vikendMs: 0, nocMs: 0, svatekMs: 0, castka: 0 });
  eq('příplatky: sobota 8–16 = 8 h víkend, +10 % ze 200/h = 160', priplatkyZaznamu(z(p('2026-10-10', '08:00'), p('2026-10-10', '16:00')), ted, 200, PR), { vikendMs: 8 * H, nocMs: 0, svatekMs: 0, castka: 160 });
  eq('příplatky: pátek 20:00 – sobota 02:00 = noc 4 h (22–02) a víkend 2 h (sobota 0–2), 200/h → 120',
    priplatkyZaznamu(z(p('2026-10-09', '20:00'), p('2026-10-10', '02:00')), ted, 200, PR), { vikendMs: 2 * H, nocMs: 4 * H, svatekMs: 0, castka: 120 });
  eq('příplatky: svátek 28. 9. 2026 (pondělí) 8–16 = +100 % → 1 600', priplatkyZaznamu(z(p('2026-09-28', '08:00'), p('2026-09-28', '16:00')), ted, 200, PR).castka, 1600);
  eq('příplatky: vypnutý víkend nic, jiná procenta jinak', [
    priplatkyZaznamu(z(p('2026-10-10', '08:00'), p('2026-10-10', '16:00')), ted, 200, { ...PR, vikend: false }).castka,
    priplatkyZaznamu(z(p('2026-10-10', '08:00'), p('2026-10-10', '16:00')), ted, 200, { ...PR, vikendPct: 25 }).castka,
  ], [0, 400]);
  eq('příplatky: zapomenutý odchod a záznam nad 24 h = 0 jako ve mzdě', [
    priplatkyZaznamu(z(p('2026-10-10', '08:00'), null), ted, 200, PR).castka,
    priplatkyZaznamu(z(p('2026-10-10', '08:00'), p('2026-10-11', '09:00')), ted, 200, PR).castka,
  ], [0, 0]);
  eq('příplatky: běžící směna se počítá do teď (sobota není, úterý 10:00–12:00 nic)', priplatkyZaznamu(z(p('2026-10-13', '10:00'), null), ted, 200, PR).castka, 0);
  eq('noc: okno přes půlnoc a v rámci dne', [jeNoc('23:30', '22:00', '06:00'), jeNoc('05:59', '22:00', '06:00'), jeNoc('06:00', '22:00', '06:00'), jeNoc('13:00', '12:00', '14:00'), jeNoc('13:00', '12:00', '12:00')], [true, true, false, true, false]);
  eq('normalizace příplatků: ořez procent a časy, vypnutý svátek', normalizujPravidlaPriplatku({ vikendPct: '15', nocPct: -5, nocOd: '21:00', nocDo: 'x', svatek: false, svatekPct: 999 }),
    { vikend: true, vikendPct: 15, noc: true, nocPct: 0, nocOd: '21:00', nocDo: '06:00', svatek: false, svatekPct: 300 });
  eq('příplatky vypnuté = nic zapnutého nebo nula procent', [priplatkyVypnute(PR), priplatkyVypnute({ ...PR, vikend: false, noc: false, svatek: false }), priplatkyVypnute({ ...PR, vikendPct: 0, nocPct: 0, svatekPct: 0 })], [false, true, true]);

  // ---- souhrn s příplatky ----
  const sazby = new Map([['1', 200]]);
  const sobota = [z(p('2026-10-10', '08:00'), p('2026-10-10', '16:00'), { id: 1, employeeId: 1, employeeName: 'Eva' })];
  const sS = souhrnHodin(sobota, ted, sazby, { priplatky: PR })[0];
  eq('souhrn: příplatky do řádku i do výplaty (1 600 + 160), rozpad v ms', [sS.mzda, sS.priplatky, sS.vyplata, sS.priplatkyMs.vikend], [1600, 160, 1760, 8 * H]);
  eq('souhrn: bez pravidel příplatky 0 (signatura z kola 7 beze změny)', souhrnHodin(sobota, ted, sazby)[0].priplatky, 0);

  // ---- pravidla dýška ----
  const entries = [
    z(p('2026-10-10', '08:00'), p('2026-10-10', '16:00'), { id: 1, employeeId: 1, employeeName: 'Eva' }),      // 8 h
    z(p('2026-10-10', '12:00'), p('2026-10-10', '16:00'), { id: 2, employeeId: 2, employeeName: 'Petr' }),     // 4 h
    z(p('2026-10-10', '08:00'), p('2026-10-10', '12:00'), { id: 3, employeeId: 3, employeeName: 'Šéf' }),      // 4 h
  ];
  const uz = [{ date: '2026-10-10', tips: 1200, shiftEmployees: [{ id: 1 }, { id: 2 }, { id: 3 }] }];
  const podle = (pr: Partial<PravidlaDyska>, pozice?: Map<string, string>) =>
    [...spropitneZaObdobi(uz, entries, ted, '2026-10-01', '2026-10-31', [], { pravidla: { ...normalizujPravidlaDyska({}), ...pr }, pozice }).poLidech.entries()].sort();
  eq('dýško: bez kontextu podle hodin (8:4:4 → 600/300/300)', [...spropitneZaObdobi(uz, entries, ted, '2026-10-01', '2026-10-31').poLidech.entries()].sort(), [['1', 600], ['2', 300], ['3', 300]]);
  eq('dýško: rovným dílem', podle({ metoda: 'rovne' }), [['1', 400], ['2', 400], ['3', 400]]);
  eq('dýško: vyloučené vedení (3) se nedělí → 8:4 = 800/400', podle({ vylouceni: ['3'] }), [['1', 800], ['2', 400]]);
  eq('dýško: hodiny × váha pozice (kuchař 0,5): 8×1 : 4×0,5 : 4×1 = 8:2:4 → 685,7/171,4/342,9',
    podle({ metoda: 'vaha', vahy: { Kuchař: 0.5 } }, new Map([['2', 'Kuchař'], ['1', 'Barista']])).map(([id, c]) => [id, Math.round(c * 10) / 10]), [['1', 685.7], ['2', 171.4], ['3', 342.9]]);
  eq('dýško: pravidlo platí až od 15. 10. — uzávěrka z 10. 10. se dělí postaru', podle({ metoda: 'rovne', vylouceni: ['3'], platiOd: '2026-10-15' }), [['1', 600], ['2', 300], ['3', 300]]);
  eq('dýško: všichni vyloučení → nerozděleno', spropitneZaObdobi(uz, entries, ted, '2026-10-01', '2026-10-31', [], { pravidla: { ...normalizujPravidlaDyska({}), vylouceni: ['1', '2', '3'] } }).nerozdeleno, 1200);
  eq('dýško: váha pozice bez hodin = jen váhy (1 : 0,5)', [...spropitneZaObdobi(uz, [], ted, '2026-10-01', '2026-10-31', [], { pravidla: { ...normalizujPravidlaDyska({ metoda: 'vaha', vahy: { Kuchař: 0.5 } }) }, pozice: new Map([['2', 'Kuchař']]) }).poLidech.entries()].sort().map(([id, c]) => [id, Math.round(c)]), [['1', 480], ['2', 240], ['3', 480]]);
  eq('normalizace dýška: nesmysl → výchozí, váhy 0–2, vyloučení jen čísla, platiOd jen den', normalizujPravidlaDyska({ metoda: 'x', vahy: { Bar: 5, Kuchyň: -1, '': 1 }, vylouceni: ['7', 'a', 7], sVedenim: false, platiOd: 'zítra' }),
    { metoda: 'hodiny', vahy: { Bar: 2, Kuchyň: 0 }, vylouceni: ['7'], sVedenim: false, platiOd: null });
  eq('váha pozice: neznámá pozice a člověk bez pozice = 1', [vahaPozice({ pravidla: normalizujPravidlaDyska({ vahy: { Bar: 1.5 } }), pozice: new Map([['1', 'Bar']]) }, '1'), vahaPozice({ pravidla: normalizujPravidlaDyska({}), pozice: new Map() }, '9')], [1.5, 1]);

  // ---- doplatit, listina, CSV ----
  eq('doplatit = mzda + příplatky + dýško + prémie − z kasy − vyplaceno', doplatit({ mzda: 9600, priplatky: 160, spropitne: 812, upravy: 500, zKasy: 2400, vyplaceno: 0 }), 8672);
  eq('doplatit: bez sazby a bez dýška jen prémie − z kasy', doplatit({ mzda: null, priplatky: 0, spropitne: null, upravy: 300, zKasy: 100, vyplaceno: 0 }), 200);
  const radek = (id: string, jmeno: string, x: Partial<RadekSouhrnu> = {}): RadekSouhrnu =>
    ({ id, jmeno, avatar: null, ms: 0, pocet: 0, bezi: false, vynechano: 0, mzda: null, spropitne: null, upravy: 0, priplatky: 0, priplatkyMs: { vikend: 0, noc: 0, svatek: 0 }, vyplata: null, planMs: 0, pozde: 0, ...x });
  const souhrn = [
    radek('16', 'Eva', { ms: 48 * H, pocet: 6, mzda: 7200, spropitne: 812, upravy: 500, vyplata: 7700 }),
    radek('18', 'Petra', { ms: 40 * H, pocet: 5, mzda: 7200, spropitne: 300, upravy: -200, vyplata: 7000, planMs: 40 * H }),
    radek('17', 'Jakub', { ms: 10 * H, pocet: 2 }),
  ];
  const lide = [
    { id: 16, name: 'Eva', jobTitle: 'Barista', contractType: 'DPP' as const, contractHoursYear: 300, hodinyLetosMs: 262 * H, zKasy: 2400, zKasyPocet: 6, uzaverky: [{ id: 1, den: '2026-10-10', castka: 400 }], vyplaceno: 0, vyplaty: [] },
    { id: 18, name: 'Petra', jobTitle: 'Barista', contractType: null, zKasy: 0, zKasyPocet: 0, vyplaceno: 7000, vyplaty: [{ id: 5, amount: 7000, method: 'ucet', paidAt: '2026-10-12', od: '2026-10-01', do: '2026-10-31' }] },
    { id: 17, name: 'Jakub', jobTitle: 'Kuchař', zKasy: 0, zKasyPocet: 0, vyplaceno: 0, vyplaty: [] },
    { id: 19, name: 'Honza', zKasy: 500, zKasyPocet: 1, uzaverky: [{ id: 2, den: '2026-10-11', castka: 500 }], vyplaceno: 0, vyplaty: [] },   // bez záznamu, ale z kasy dostal
    { id: 20, name: 'Nikdo', zKasy: 0, zKasyPocet: 0, vyplaceno: 0, vyplaty: [] },                                                             // nic → bez řádku
  ];
  const listina = vyplatniListina(souhrn, lide);
  eq('listina: řádky i pro člověka jen s výplatou z kasy, ne pro nikoho bez ničeho', listina.map(r => r.id).sort(), ['16', '17', '18', '19']);
  const eva = listina.find(r => r.id === '16')!, petra = listina.find(r => r.id === '18')!, honza = listina.find(r => r.id === '19')!;
  eq('listina: Eva doplatit 7 700 + 812 − 2 400 = 6 112, čeká, DPP 300 h', [eva.doplatit, eva.stav, eva.smlouva, eva.limitHodin, eva.pozice], [6112, 'ceka', 'DPP', 300, 'Barista']);
  eq('listina: Petra vyplaceno 7 000 → doplatit 300, stav vyplaceno', [petra.doplatit, petra.stav, petra.vyplaty.length], [300, 'vyplaceno', 1]);
  eq('listina: Honza bez záznamů má −500 (dostal víc, než vydělal)', [honza.doplatit, honza.stav, honza.pocet], [-500, 'ceka', 0]);
  eq('řazení: doplatit sestupně, jméno vzestupně', [seradListinu(listina, 'doplatit', true).map(r => r.id), seradListinu(listina, 'jmeno', false).map(r => r.jmeno)], [['16', '18', '17', '19'], ['Eva', 'Honza', 'Jakub', 'Petra']]);
  const soucet = soucetListiny(listina);
  eq('součet: hodiny, mzdy, dýško, z kasy, vyplaceno, doplatit, bez sazby', [soucet.ms / H, soucet.mzda, soucet.spropitne, soucet.zKasy, soucet.vyplaceno, soucet.doplatit, soucet.bezSazby], [98, 14400, 1112, 2900, 7000, 5912, 1]);
  const csv = csvVyplatniListiny(listina, { od: '2026-10-01', do: '2026-10-31', symbol: 'Kč', sazby: new Map([['16', 150]]), priplatky: false, spropitne: true, smlouvy: true });
  eq('CSV: hlavička bez příplatků, s dýškem a smlouvou', csv[0], ['Jméno', 'Pozice', 'Smlouva', 'Směny', 'Hodiny', 'Plán', 'Sazba (Kč)', 'Mzda (Kč)', 'Spropitné (Kč)', 'Prémie a srážky (Kč)', 'Z kasy (Kč)', 'Vyplaceno (Kč)', 'Doplatit (Kč)', 'Stav', 'Období']);
  eq('CSV: řádek Evy a řádek Celkem', [csv[1], csv[csv.length - 1]], [
    ['Eva', 'Barista', 'DPP', '6', '48:00', '', '150', '7200', '812', '500', '2400', '0', '6112', 'čeká', '2026-10-01 – 2026-10-31'],
    ['Celkem', '', '', '13', '98:00', '40:00', '', '14400', '1112', '300', '2900', '7000', '5912', '', ''],
  ]);
  ok('CSV: text má BOM, středníky a uvozovky', csvText(csv).startsWith('﻿"Jméno";"Pozice"'));
  eq('hMM: 7:53 a 0:05', [hMM(7 * H + 53 * 60_000), hMM(5 * 60_000)], ['7:53', '0:05']);

  // ---- smlouvy ----
  eq('smlouva: normalizace a názvy', [normalizujSmlouvu('DPC'), normalizujSmlouvu('x'), nazevSmlouvy('DPC'), nazevSmlouvy('OSVC'), LIMIT_DPP_HODIN], ['DPC', null, 'DPČ', 'OSVČ', 300]);
  eq('limit DPP: 262/300 = 87 % wait, 310/300 bad, 100/300 ok, bez limitu null', [stavLimituHodin(262 * H, 300)?.ton, stavLimituHodin(310 * H, 300)?.ton, stavLimituHodin(100 * H, 300)?.ton, stavLimituHodin(100 * H, null)], ['wait', 'bad', 'ok', null]);
  eq('hranice odvodů: jen DPP a jen nad hranicí', [nadHraniciOdvodu(12000, 11500, 'DPP'), nadHraniciOdvodu(11000, 11500, 'DPP'), nadHraniciOdvodu(12000, 11500, 'HPP'), nadHraniciOdvodu(12000, null, 'DPP')], [true, false, false, false]);

  // ---- zámky a měsíce ----
  const zamky = [{ id: 1, od: '2026-09-01', do: '2026-09-30' }];
  eq('zámek: celé září ano, 15.–30. 9. uvnitř ano, 25. 9. – 5. 10. ne, den', [!!obdobiZamceno(zamky, '2026-09-01', '2026-09-30'), !!obdobiZamceno(zamky, '2026-09-15', '2026-09-30'), !!obdobiZamceno(zamky, '2026-09-25', '2026-10-05'), denZamcen(zamky, '2026-09-10'), denZamcen(zamky, '2026-10-01')], [true, true, false, true, false]);
  const mesice = mesiceVyplat('2026-10-13', [{ id: 1, amount: 12450, method: 'hotove', paidAt: '2026-10-12', od: '2026-09-01', do: '2026-09-30' }], zamky, 4);
  eq('měsíce: říjen běží, září vyplaceno a uzavřeno, srpen a červenec prázdné; přechod přes leden', [mesice.map(m => m.mesic), mesice[0].bezi, mesice[1].vyplaceno, mesice[1].zamceno, mesice[2].vyplaceno, mesiceVyplat('2026-01-05', [], [], 3).map(m => m.mesic)],
    [['2026-10', '2026-09', '2026-08', '2026-07'], true, 12450, true, 0, ['2026-01', '2025-12', '2025-11']]);

  // ---- pauza ----
  const me = 16;
  const dnes = '2026-10-13';
  const A = z(p(dnes, '08:00'), p(dnes, '12:40'), { id: 1, employeeId: me, source: 'self' });
  const Bopen = z(p(dnes, '12:40'), p(dnes, '12:40'), { id: 2, employeeId: me, source: 'break', breakAfter: 1 });
  const Bdone = z(p(dnes, '13:10'), null, { id: 2, employeeId: me, source: 'break', breakAfter: 1 });
  eq('pauza: otevřená = break s odchodem rovným příchodu', [jeOtevrenaPauza(Bopen), jeOtevrenaPauza(Bdone), jeOtevrenaPauza(A)], [true, false, false]);
  const tedP = pragueMomentOf(dnes, '12:50')!.getTime();
  const naPauze = stavPauzy([A, Bopen], me, dnes, tedP);
  eq('pauza: na pauze od 12:40, dnes 4 h 40 min, neptat se', [naPauze.naPauze, naPauze.pauzaOd?.toISOString(), Math.round(naPauze.dnesMs / 60_000), naPauze.zeptatSe], [true, p(dnes, '12:40'), 280, false]);
  eq('pauza: po konci pauzy běží záznam „break“ bez breakAfter v API — mezera z nejbližšího předchozího odchodu = 30 min',
    pauzyZeZaznamu([A, { ...Bdone, breakAfter: undefined }]).get('2'), 30 * 60_000);
  eq('pauza: s breakAfter totéž; otevřená pauza se nepočítá', [pauzyZeZaznamu([A, Bdone]).get('2'), pauzyZeZaznamu([A, Bopen]).size], [30 * 60_000, 0]);
  const dlouha = z(p(dnes, '06:00'), null, { id: 3, employeeId: me, source: 'self' });
  eq('pauza: 7 h bez pauzy → zeptat se; s hotovou pauzou ne; pod 6 h ne', [
    stavPauzy([dlouha], me, dnes, pragueMomentOf(dnes, '13:00')!.getTime()).zeptatSe,
    stavPauzy([A, Bdone], me, dnes, pragueMomentOf(dnes, '16:00')!.getTime()).zeptatSe,
    stavPauzy([dlouha], me, dnes, pragueMomentOf(dnes, '11:00')!.getTime()).zeptatSe,
  ], [true, false, false]);
  eq('pauza: hodiny se nemění — mezera se nepočítá (4 h 40 + běží od 13:10)', Math.round(stavPauzy([A, Bdone], me, dnes, pragueMomentOf(dnes, '14:10')!.getTime()).dnesMs / 60_000), 280 + 60);
  const r = rozdelProPauzu(new Date(p(dnes, '06:00')), pragueMomentOf(dnes, '14:00')!.getTime(), PAUZA_MIN)!;
  eq('doplnění pauzy: 06:00–14:00 se rozdělí na 06:00–09:45 a 10:15–14:00', [r.konecA.toISOString(), r.zacatekB.toISOString()], [p(dnes, '09:45'), p(dnes, '10:15')]);
  eq('doplnění pauzy: krátká směna se nedělí', rozdelProPauzu(new Date(p(dnes, '13:00')), pragueMomentOf(dnes, '13:50')!.getTime(), PAUZA_MIN), null);
  eq('povinná pauza po 6 h', POVINNA_PAUZA_PO_MS, 6 * H);
  const moje = radkyMojeDochazky([A, { ...Bdone, clockOut: p(dnes, '16:00') }], me, '2026-10', pragueMomentOf(dnes, '18:00')!.getTime());
  eq('moje docházka: den nese pauzu 30 min a hodiny bez ní (4:40 + 2:50)', [moje.dny[0].pauzyMs, Math.round(moje.ms / 60_000)], [30 * 60_000, 280 + 170]);

  // ---- katalog, stránka, audit, smazání ----
  const w = widget('dochazka.vyplatni_listina')!;
  eq('katalog: Výplatní listina jen L, vedení, na Docházce, s klíči pro Kč, CSV a zápis', [w.velikosti, w.rozhrani, w.opravneni.vse, w.opravneni.pole?.['akce:csv'], w.opravneni.pole?.['akce:vyplaceno'], w.stav], [['L'], ['vedeni'], ['dochazka.zobrazit'], 'dochazka.exportovat', 'finance.sazby_upravit', 'hotovo']);
  ok('stránka Docházka: listina ve výchozím rozložení a v doporučených', DOCHAZKA.vychozi['typ:vedeni']!.some(x => x.w === 'dochazka.vyplatni_listina') && DOCHAZKA.doporucene.includes('dochazka.vyplatni_listina'));
  ok('audit: klíče výplat mají popisek', ['vyplata.oznacena', 'vyplata.zrusena', 'vyplata.obdobi_uzavreno', 'vyplata.obdobi_otevreno', 'vyplata.pravidla', 'vyplata.smlouva', 'dochazka.pauza_doplnena', 'dochazka.bez_pauzy'].every(k => !!AUDIT_POPISKY[k]));
  ok('smazání účtu: payroll_payments a payroll_locks mají rozhodnutí a patří podniku', ZACHAZENI_TABULEK.payroll_payments === 'ponechat' && ZACHAZENI_TABULEK.payroll_locks === 'ponechat' && TYMOVE_TABULKY.includes('payroll_payments') && TYMOVE_TABULKY.includes('payroll_locks'));
  const widgetSrc = zdroj('components/widgety/oblasti/dochazka.tsx');
  // Bez komentářů — ty o korunách mluví záměrně („−2 400 Kč" v popisu nálezu).
  const widgetKod = widgetSrc.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join('\n');
  ok('widget: peníze jen přes useMoney, žádné „Kč" natvrdo', !/Kč/.test(widgetKod));
  ok('widget: tabulka listiny je table-fixed a jen od lg; pod ním karty', /table-fixed/.test(widgetSrc) && /hidden lg:block rounded-2xl/.test(widgetSrc) && /className="list lg:hidden"/.test(widgetSrc));
  ok('API: /api/payroll odečítá self_payout bez ohledu na payout_from_register (vyplaceno bokem je taky vyplaceno)', /self_payout > 0/.test(zdroj('app/api/payroll/route.ts')) && !/payout_from_register/.test(zdroj('app/api/payroll/route.ts')));
}
