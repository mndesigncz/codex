// Kolo 8, balík R8-3 — Rozvrh, tým a odměny.
//
// Tým: hodiny a výdělek u každého člena za zvolené období (lib/tymHodiny.ts) — stejná
// pravidla jako Souhrn hodin (zapomenutý odchod se nepočítá, běžící příchod do „teď"),
// mzda jen se sazbou a jen když ji divák smí vidět, řazení podle jména / hodin / výdělku
// a kolik dní si od serveru vyžádat (strop 180). Ve zdroji: nástroj Týmu čte
// /api/attendance jen s dochazka.zobrazit a stránka Tým doporučuje Souhrn hodin.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { dniKNacteni, hodinyClenu, seradCleny, soucetHodinClenu } from '../../lib/tymHodiny.ts';
import { pragueMomentOf } from '../../lib/pragueTime.ts';
import { STRANKA as TYM } from '../../lib/widgety/stranky/vedeni.tym.ts';
import { widget as widgetKatalog } from '../../lib/widgety/katalog/index.ts';
import type { ZaznamDochazky } from '../../lib/dochazkaPrehled.ts';
import {
  BEZ_LIMITU, ZAKONNE_LIMITY, klicTydne, smenaVLimitech, souhrnVarovani, varovaniLimitu, varovaniNoveSmeny, varovaniPodleSmeny, vycistiLimity,
  type SmenaLimitu,
} from '../../lib/rozvrhLimity.ts';
import {
  navrhniRozvrh, planProtiTrzbam, podilMezdPlanu, tonPodilu, trzbaDne, type ClovekGeneratoru, type TypSmeny, type VstupGeneratoru,
} from '../../lib/rozvrhGenerator.ts';
import { dnuVRoce, narokDovolene, rokNaroku, vycistiNarok, zbudePoSchvaleni } from '../../lib/dovolena.ts';
import { BODY_DIKU, VYCHOZI_PRISPEVEK, nastaveniDiku, overDik, vyberZed, zacatekMesice, zbyvaRozdat } from '../../lib/podekovani.ts';
import { dochvilniZaTyden, duvodAuto, klicAuto, minulyTyden, nastaveniAuto, oslavy, zpozdeniMin } from '../../lib/automatickeBody.ts';
import { METRIKY, postupVyzvy, vyberVyzvy, vycistiVyzvu, vyzvyKZobrazeni } from '../../lib/vyzvy.ts';
import { AUDIT_POPISKY } from '../../lib/auditPopisky.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
const p = (den: string, hm: string) => pragueMomentOf(den, hm)!.toISOString();
const H = 3_600_000;

export default function ({ eq, ok }: Testy) {
  // ---- hodiny po lidech ----
  const z = (id: number, kdo: number, od: string, doCasu: string | null): ZaznamDochazky =>
    ({ id, employeeId: kdo, employeeName: `Člověk ${kdo}`, clockIn: od, clockOut: doCasu, source: 'kiosk' });
  const ted = pragueMomentOf('2026-10-13', '15:00')!.getTime();
  const zaznamy = [
    z(1, 16, p('2026-10-01', '08:00'), p('2026-10-01', '16:00')),   // 8 h
    z(2, 16, p('2026-10-05', '08:00'), p('2026-10-05', '12:30')),   // 4 h 30
    z(3, 17, p('2026-10-05', '12:00'), p('2026-10-05', '20:00')),   // 8 h
    z(4, 17, p('2026-10-10', '09:00'), null),                       // zapomenutý odchod (> 16 h) — nepočítá se
    z(5, 18, p('2026-10-13', '13:00'), null),                       // běží 2 h
    z(6, 16, p('2026-09-28', '08:00'), p('2026-09-28', '16:00')),   // mimo rozmezí
  ];
  const roster = [{ id: 16, name: 'Eva', hourlyRate: 150 }, { id: 17, name: 'Jakub', hourlyRate: 0 }, { id: 18, name: 'Tereza', hourlyRate: 200 }];
  const h = hodinyClenu(zaznamy, roster, '2026-10-01', '2026-10-13', ted, true);
  eq('hodiny: Eva 12 h 30 min ze dvou směn v rozmezí, mzda 12,5 × 150', h.get('16'), { ms: 12.5 * H, pocet: 2, mzda: 1875, bezi: false });
  eq('hodiny: Jakub 8 h, zapomenutý odchod se nepočítá, bez sazby mzda null', h.get('17'), { ms: 8 * H, pocet: 2, mzda: null, bezi: false });
  eq('hodiny: Tereza běží 2 h do „teď", mzda 2 × 200', h.get('18'), { ms: 2 * H, pocet: 1, mzda: 400, bezi: true });
  ok('hodiny: září mimo rozmezí (Eva má jen dvě směny)', h.get('16')!.pocet === 2);
  const bezMzdy = hodinyClenu(zaznamy, roster, '2026-10-01', '2026-10-13', ted, false);
  eq('hodiny: bez finance.mzdy je mzda null i se sazbou v rosteru', [bezMzdy.get('16')!.mzda, bezMzdy.get('18')!.mzda], [null, null]);
  eq('hodiny: prázdné rozmezí = nikdo', hodinyClenu(zaznamy, roster, '2026-11-01', '2026-11-30', ted, true).size, 0);

  // ---- součet ----
  eq('součet: hodiny všech, mzdy jen se sazbou, bez sazby 1 (Jakub)', soucetHodinClenu(h), { ms: 22.5 * H, mzda: 2275, bezSazby: 1 });

  // ---- řazení ----
  const lide = [
    { id: 15, name: 'Martin' }, { id: 16, name: 'Eva' }, { id: 17, name: 'Jakub' }, { id: 18, name: 'Tereza' }, { id: 19, name: 'Adam' },
  ];
  eq('řazení: jméno česky', seradCleny(lide, h, 'jmeno').map(m => m.name), ['Adam', 'Eva', 'Jakub', 'Martin', 'Tereza']);
  eq('řazení: hodiny — nejvíc nahoře, bez záznamu dole v abecedě', seradCleny(lide, h, 'hodiny').map(m => m.name), ['Eva', 'Jakub', 'Tereza', 'Adam', 'Martin']);
  eq('řazení: výdělek — bez sazby (Jakub) až za lidmi s mzdou, bez záznamu dole', seradCleny(lide, h, 'vydelek').map(m => m.name), ['Eva', 'Tereza', 'Jakub', 'Adam', 'Martin']);
  eq('řazení: bez docházky vždy jméno', seradCleny(lide, null, 'hodiny').map(m => m.name), ['Adam', 'Eva', 'Jakub', 'Martin', 'Tereza']);

  // ---- kolik dní načíst ----
  eq('dní k načtení: tento měsíc 1.–13. = 13', dniKNacteni('2026-10-01', '2026-10-13'), 13);
  eq('dní k načtení: minulý měsíc od 1. 9. do 13. 10. = 43', dniKNacteni('2026-09-01', '2026-10-13'), 43);
  eq('dní k načtení: strop 180 (server víc nevrací)', dniKNacteni('2025-01-01', '2026-10-13'), 180);
  eq('dní k načtení: nesmysl → 30, dnešek → 1', [dniKNacteni('x', '2026-10-13'), dniKNacteni('2026-10-13', '2026-10-13')], [30, 1]);

  // ---- ve zdroji ----
  const tym = zdroj('components/TeamManagement.tsx');
  ok('Tým: docházku čte jen s dochazka.zobrazit (URL null bez oprávnění)', /useDataWidgetu<DataDochazky>\(smiHodiny \? `\/api\/attendance\?days=\$\{dniKNacteni\(/.test(tym));
  ok('Tým: období volí ObdobiLista s měsícem, minulým měsícem a 30 dny', /<ObdobiLista value=\{obdobi\}/.test(tym) && /'30_dni', 'mesic', 'minuly_mesic'/.test(tym));
  ok('Tým: řazení Jméno / Hodiny / Výdělek (výdělek jen s finance.mzdy)', /id: 'hodiny' as const/.test(tym) && /smiVidetSazby \? \[\{ id: 'vydelek' as const/.test(tym));
  ok('Tým: odkaz „Rozpad v Docházce" jen na pohled, kam divák smí', /nav\.smiPohled\('attendance'\)/.test(tym) && /t\('Rozpad v Docházce'\)/.test(tym));
  ok('Tým: stránka doporučuje Souhrn hodin', TYM.doporucene.includes('dochazka.souhrn_hodin'));

  // =========================================================================
  // Limity rozvrhu (lib/rozvrhLimity.ts): odpočinek, nejdelší směna, týden
  // =========================================================================
  eq('limity: vyčištění — null, prázdno a nesmysl = vypnuto, hodiny se ořežou', vycistiLimity({ minRestHours: null, maxShiftHours: '', maxWeekHours: 'x' }), BEZ_LIMITU);
  eq('limity: vyčištění z řádku teams (snake_case) a strop', vycistiLimity({ min_rest_hours: 11, max_shift_hours: 40, max_week_hours: 500 }), { minRestHours: 11, maxShiftHours: 24, maxWeekHours: 168 });
  eq('limity: zákonné výchozí 11 / 12 / 40', ZAKONNE_LIMITY, { minRestHours: 11, maxShiftHours: 12, maxWeekHours: 40 });
  eq('limity: klíč týdne — pondělí (zacatek 1) a neděle (zacatek 0)', [klicTydne('2026-10-11', 1), klicTydne('2026-10-11', 0), klicTydne('2026-10-12', 0)], ['2026-10-05', '2026-10-11', '2026-10-11']);

  const sm = (klic: string, kdo: number, date: string, od: string, doC: string): SmenaLimitu => ({ klic, employeeId: kdo, date, startTime: od, endTime: doC });
  // Eva: sobota zavírá 15–23, neděle otvírá 7–15 → 8 h odpočinku (varování na nedělní směně).
  const vikend = [sm('a', 1, '2026-10-10', '15:00', '23:00'), sm('b', 1, '2026-10-11', '07:00', '15:00')];
  eq('limity: 8 h mezi zavírací a ranní = varování odpočinku na té pozdější', varovaniLimitu(vikend, ZAKONNE_LIMITY), [{ klic: 'b', employeeId: 1, date: '2026-10-11', druh: 'odpocinek', hodnota: 8, limit: 11 }]);
  eq('limity: noční přes půlnoc 22–02 a ranní 9:00 = 7 h', varovaniLimitu([sm('n', 1, '2026-10-09', '22:00', '02:00'), sm('r', 1, '2026-10-10', '09:00', '17:00')], ZAKONNE_LIMITY).map(v => [v.klic, v.druh, v.hodnota]), [['r', 'odpocinek', 7]]);
  eq('limity: 13 h směna nad 12', varovaniLimitu([sm('d', 2, '2026-10-05', '07:00', '20:00')], ZAKONNE_LIMITY).map(v => [v.druh, v.hodnota, v.limit]), [['smena', 13, 12]]);
  eq('limity: 12 h přesně neporušuje', varovaniLimitu([sm('d', 2, '2026-10-05', '08:00', '20:00')], ZAKONNE_LIMITY), []);
  const tyden = ['05', '06', '07', '08', '09', '10'].map((d, i) => sm(`t${i}`, 3, `2026-10-${d}`, '08:00', '16:00'));
  eq('limity: šest osmihodinových = 48 h, varování až na sobotní (šesté) směně', varovaniLimitu(tyden, ZAKONNE_LIMITY).map(v => [v.klic, v.druh, v.hodnota]), [['t5', 'tyden', 48]]);
  eq('limity: pět osmihodinových = 40 h bez varování', varovaniLimitu(tyden.slice(0, 5), ZAKONNE_LIMITY), []);
  eq('limity: týden od neděle — neděle 11. patří k dalšímu týdnu, sobota 10. k předchozímu', varovaniLimitu([...tyden.slice(0, 5), sm('ne', 3, '2026-10-11', '08:00', '16:00')], ZAKONNE_LIMITY, 0), []);
  eq('limity: vypnuté = žádná varování', varovaniLimitu([...vikend, ...tyden], BEZ_LIMITU), []);
  eq('limity: souhrn počítá druhy a první den', souhrnVarovani(varovaniLimitu([...vikend, ...tyden, sm('d', 2, '2026-10-05', '07:00', '20:00')], ZAKONNE_LIMITY)), { celkem: 3, odpocinek: 1, smena: 1, tyden: 1, prvniDen: '2026-10-05' });
  eq('limity: seskupení podle směny', [...varovaniPodleSmeny(varovaniLimitu(vikend, ZAKONNE_LIMITY)).keys()], ['b']);
  // Nová směna: přidaná zavírací v sobotu udělá z už existující nedělní ranní porušení — varování se vrátí (klíč té existující).
  eq('limity: nová dřívější směna, která zkrátí odpočinek té existující, se hlásí', varovaniNoveSmeny({ employeeId: 1, date: '2026-10-10', startTime: '15:00', endTime: '23:00' }, [vikend[1]], ZAKONNE_LIMITY).map(v => [v.klic, v.druh]), [['b', 'odpocinek']]);
  eq('limity: nová směna bez porušení = nic', varovaniNoveSmeny({ employeeId: 1, date: '2026-10-12', startTime: '08:00', endTime: '16:00' }, vikend, ZAKONNE_LIMITY), []);
  eq('limity: cizí směny se nepletou', varovaniNoveSmeny({ employeeId: 9, date: '2026-10-11', startTime: '07:00', endTime: '15:00' }, [vikend[0]], ZAKONNE_LIMITY), []);
  eq('limity: generátor — smenaVLimitech', [smenaVLimitech({ employeeId: 1, date: '2026-10-11', startTime: '07:00', endTime: '15:00' }, [vikend[0]], ZAKONNE_LIMITY), smenaVLimitech({ employeeId: 1, date: '2026-10-11', startTime: '10:00', endTime: '18:00' }, [vikend[0]], ZAKONNE_LIMITY)], [false, true]);

  // ---- generátor limity dodrží ----
  // Pondělí a úterý 8–22, Otvíračka 8–14 a Zavíračka 14–22. Eva v pondělí zavírá (do 22), Filip otvírá.
  // V úterý by podle jména otvírala Eva — s odpočinkem 11 h nesmí (10 h), otvírá Filip a Eva zavírá.
  const oh: VstupGeneratoru['openingHours'] = {};
  for (let i = 0; i <= 6; i++) oh[String(i)] = { open: '08:00', close: '22:00', closed: i > 1 };
  const typy: TypSmeny[] = [
    { id: 1, name: 'Otvíračka', start_time: '08:00', end_time: '14:00', starts_at_open: true },
    { id: 2, name: 'Zavíračka', start_time: '14:00', end_time: '22:00', ends_at_close: true },
  ];
  const clovek = (id: number, name: string, extra: Partial<ClovekGeneratoru> = {}): ClovekGeneratoru => ({ id, name, unavailable: [], dayPrefs: {}, preferredShift: null, maxShifts: null, maxConsecutive: null, maxHours: null, ...extra });
  const lideG = [clovek(1, 'Eva', { dayPrefs: { '2026-10-05': 'type:2' } }), clovek(2, 'Filip', { dayPrefs: { '2026-10-05': 'type:1' } })];
  const smenyDne = (v: ReturnType<typeof navrhniRozvrh>, d: string) => v.proposed.filter(p => p.date === d).map(p => [p.employeeName, p.shiftTypeName]).sort();
  const bezLimitu = navrhniRozvrh({ month: '2026-10', lide: lideG, typy, openingHours: oh });
  eq('generátor bez limitů: v úterý otvírá Eva (abeceda), zavírá Filip', smenyDne(bezLimitu, '2026-10-06'), [['Eva', 'Otvíračka'], ['Filip', 'Zavíračka']]);
  // Otvíračky se obsazují napřed v celém měsíci (Eva dostane úterní 8–14), takže pondělní
  // zavírací do 22 už Eva vzít nesmí (10 h do úterního otevření) a Filip ten den stojí —
  // generátor ji nechá neobsazenou a řekne proč. Limit je limit: raději díra než porušení.
  const sLimity = navrhniRozvrh({ month: '2026-10', lide: lideG, typy, openingHours: oh, limity: ZAKONNE_LIMITY });
  eq('generátor s limity: pondělní zavírací by Evě dala 10 h do úterní otvíračky — zůstane neobsazená', smenyDne(sLimity, '2026-10-05'), [['Filip', 'Otvíračka']]);
  eq('generátor s limity: úterý Eva otvírá, Filip zavírá', smenyDne(sLimity, '2026-10-06'), [['Eva', 'Otvíračka'], ['Filip', 'Zavíračka']]);
  ok('generátor s limity: neobsazená směna má v důvodu odpočinek / týdenní strop', sLimity.warnings.some(w => w.startsWith('5.10.') && w.includes('odpočinek mezi směnami')));
  eq('generátor s limity: návrh sám limity neporušuje', varovaniLimitu(sLimity.proposed.map((p, i) => sm(`p${i}`, p.employeeId, p.date, p.startTime, p.endTime)), ZAKONNE_LIMITY), []);
  const dlouha: TypSmeny[] = [{ id: 3, name: 'Celý den', start_time: '08:00', end_time: '22:00', starts_at_open: true, ends_at_close: true }];
  const nikdo = navrhniRozvrh({ month: '2026-10', lide: [clovek(1, 'Eva')], typy: dlouha, openingHours: oh, limity: { ...BEZ_LIMITU, maxShiftHours: 12 } });
  eq('generátor: 14h typ nad stropem 12 h nikdo nedostane', nikdo.proposed.length, 0);
  ok('generátor: důvod říká, že jde o odpočinek nebo strop', nikdo.warnings.some(w => w.includes('odpočinek mezi směnami nebo by přesáhli týdenní strop')));

  // =========================================================================
  // Plán proti tržbám (lib/rozvrhGenerator.ts)
  // =========================================================================
  const dny = { '0': { prumer: 18400, vzorek: 8 }, '1': { prumer: 0, vzorek: 0 } };
  eq('tržby dne: pondělí z průměru, úterý bez vzorku null, sobota bez dat null', [trzbaDne(dny, '2026-10-05'), trzbaDne(dny, '2026-10-06'), trzbaDne(dny, '2026-10-10')], [18400, null, null]);
  eq('podíl mezd: 2 800 / 18 400 = 15 %, bez tržby null', [podilMezdPlanu(2800, 18400), podilMezdPlanu(2800, 0), podilMezdPlanu(null, 18400)], [15, null, null]);
  eq('tón podílu: pod cílem ok, nad cílem wait, bez cíle tlumený', [tonPodilu(15, 28), tonPodilu(30, 28), tonPodilu(15, null), tonPodilu(null, 28)], ['ok', 'wait', 'muted', 'muted']);
  const plan = planProtiTrzbam([
    { date: '2026-10-05', startTime: '08:00', endTime: '16:00', hourlyRate: 150 },
    { date: '2026-10-05', startTime: '12:00', endTime: '20:00', hourlyRate: 200 },
    { date: '2026-10-06', startTime: '08:00', endTime: '16:00', hourlyRate: 150 },
    { date: '2026-10-07', startTime: '08:00', endTime: '16:00', hourlyRate: null },
  ], dny, ['2026-10-05', '2026-10-06', '2026-10-07']);
  eq('plán proti tržbám: pondělí 2 800 Kč mezd proti 18 400 = 15 %', plan.poDnech.get('2026-10-05'), { date: '2026-10-05', trzba: 18400, mzdy: 2800, podil: 15 });
  eq('plán proti tržbám: den bez tržby má mzdy, ale podíl null', plan.poDnech.get('2026-10-06'), { date: '2026-10-06', trzba: null, mzdy: 1200, podil: null });
  eq('plán proti tržbám: směna bez sazby = den bez mezd', plan.poDnech.get('2026-10-07'), { date: '2026-10-07', trzba: null, mzdy: null, podil: null });
  eq('plán proti tržbám: celkem — tržba a podíl jen z naplánovaných dnů s tržbou, mzdy ze všech', [plan.trzba, plan.mzdy, plan.podil], [18400, 4000, 15]);
  eq('plán proti tržbám: den s tržbou, ale bez směn se do celku nepočítá (pět naplánovaných dnů ≠ 3 % z měsíce)',
    planProtiTrzbam([{ date: '2026-10-05', startTime: '08:00', endTime: '16:00', hourlyRate: 500 }], { '0': { prumer: 10000, vzorek: 8 }, '1': { prumer: 90000, vzorek: 8 } }, ['2026-10-05', '2026-10-06']).podil, 40);
  eq('plán proti tržbám: bez tržeb vůbec', planProtiTrzbam([], null, ['2026-10-05']).podil, null);

  // ---- ve zdroji: plánovač a pravidla ----
  const plano = zdroj('components/scheduling/ScheduleBuilder.tsx');
  ok('plánovač: limity a tržby čte z GET /api/schedule/generate jen s rozvrh.zobrazit', /useDataWidgetu<InfoPlanu>\(planovac \? URL_INFO_PLANU : null/.test(plano));
  ok('plánovač: podíl mezd jen s finance.trzby a finance.mzdy', /smiTrzby && smiMzdy && infoPlanu\.data\?\.trzby\?\.stav === 'ok'/.test(plano));
  ok('plánovač: okno dne má „Přesto přidat" po varování limitů', /varovaniLimituRucne\.length > 0 \? t\('Přesto přidat'\)/.test(plano) && /data-limit-otazka/.test(plano));
  ok('plánovač: pravidla posílají limity a hlásí neuložené', /limity: \{\s*minRestHours:/.test(plano) && /limityNeulozeny/.test(plano));
  const pravidla = zdroj('app/api/schedule/rules/route.ts');
  ok('pravidla: GET vrací limity, PUT je čistí přes vycistiLimity', /limity = vycistiLimity\(t\)/.test(pravidla) && /const l = vycistiLimity\(b\.limity\)/.test(pravidla));
  const gener = zdroj('app/api/schedule/generate/route.ts');
  ok('generátor: GET s rozvrh.zobrazit; tržby jen s finance.trzby, cíl mezd jen s finance.mzdy', /export async function GET\(\)/.test(gener) && /cilMezd: smiMzdy \? cilMezd : null/.test(gener) && /if \(smiTrzby\)/.test(gener));
  ok('generátor: POST předává limity a začátek týdne generátoru', /limity,\s*zacatekTydne,\s*\}\);/.test(gener));

  // =========================================================================
  // Nárok a zůstatek dovolené (lib/dovolena.ts)
  // =========================================================================
  eq('dovolená: dny v roce — celý týden 7, přes Silvestr jen do 31. 12., mimo rok 0', [dnuVRoce('2026-07-01', '2026-07-07', 2026), dnuVRoce('2026-12-29', '2027-01-03', 2026), dnuVRoce('2026-12-29', '2027-01-03', 2027), dnuVRoce('2025-05-01', '2025-05-02', 2026)], [7, 3, 3, 0]);
  eq('dovolená: jeden den bez „do", nesmysl 0', [dnuVRoce('2026-03-05', '', 2026), dnuVRoce('x', '2026-03-05', 2026), dnuVRoce('2026-03-05', '2026-03-01', 2026)], [1, 0, 0]);
  eq('dovolená: nárok vyčištěný — null/prázdno nenastaveno, půldny, strop 366, záporné null', [vycistiNarok(null), vycistiNarok(''), vycistiNarok('20'), vycistiNarok(12.5), vycistiNarok(999), vycistiNarok(-3)], [null, null, 20, 12.5, 366, null]);
  const zadosti = [
    { fromDate: '2026-02-02', toDate: '2026-02-06', type: 'vacation', status: 'approved' },  // 5
    { fromDate: '2026-07-13', toDate: '2026-07-21', type: 'vacation', status: 'approved' },  // 9
    { fromDate: '2026-03-10', toDate: '2026-03-12', type: 'sick', status: 'approved' },      // nemoc se neodečítá
    { fromDate: '2026-04-01', toDate: '2026-04-01', type: 'vacation', status: 'rejected' },  // zamítnutá ne
    { fromDate: '2026-11-02', toDate: '2026-11-04', type: 'vacation', status: 'pending' },   // 3 čeká
    { fromDate: '2025-08-04', toDate: '2025-08-08', type: 'vacation', status: 'approved' },  // loni
  ];
  eq('dovolená: nárok 20, čerpáno 14 (jen schválená dovolená letos), čeká 3, zbývá 6', narokDovolene(zadosti, 20, 2026), { rok: 2026, dni: 20, cerpano: 14, ceka: 3, zbyva: 6 });
  eq('dovolená: bez nároku zůstatek null, čerpání se ale počítá', narokDovolene(zadosti, null, 2026).zbyva, null);
  const n = narokDovolene(zadosti, 20, 2026);
  eq('dovolená: po schválení 3 dnů zbude 3; 11 dnů = −5; nemoc null; bez dnů null', [zbudePoSchvaleni(n, '2026-11-02', '2026-11-04'), zbudePoSchvaleni(n, '2026-11-02', '2026-11-12'), zbudePoSchvaleni(n, '2026-11-02', '2026-11-04', 'sick'), zbudePoSchvaleni(n, '', '')], [3, -5, null, null]);
  eq('dovolená: rok nároku podle začátku žádosti, jinak dnešek', [rokNaroku('2026-10-13'), rokNaroku('2026-10-13', '2027-01-05'), rokNaroku('2026-10-13', 'x')], [2026, 2027, 2026]);
  ok('dovolená: audit „volno.narok" má popisek', typeof AUDIT_POPISKY['volno.narok'] === 'string');
  const timeoff = zdroj('app/api/timeoff/route.ts');
  ok('timeoff: ?mine=1 posílá narok, tým naroky a „zbydePoSchvaleni" u čekající dovolené', /narok: NarokDovolene = narokDovolene/.test(timeoff) && /naroky: narokyOut/.test(timeoff) && /zbydePoSchvaleni: zbude/.test(timeoff));
  ok('timeoff: PUT nároku jen s volno.schvalovat, člen přes jeClenem, na team_members', /export async function PUT/.test(timeoff) && /pozaduj\('volno.schvalovat'\)/.test(timeoff) && /jeClenem\(userId, c\.teamId\)/.test(timeoff) && /UPDATE team_members SET vacation_per_year/.test(timeoff));
  const volno = zdroj('components/scheduling/TimeOffRequest.tsx');
  ok('žádost o volno: zůstatek nad poli jen u typu Dovolená, s „po schválení zbude"', /typ !== 'vacation'\) return null/.test(volno) && /po schválení zbude \{n\}/.test(volno));
  const tymSrc = zdroj('components/TeamManagement.tsx');
  ok('Tým: pole Dovolená na rok jen s volno.schvalovat a zápis PUT /api/timeoff s kontrolou odpovědi', /smiNarok && \(/.test(tymSrc) && /fetch\('\/api\/timeoff', \{ method: 'PUT'/.test(tymSrc) && /vacationPerYear: novyNarok \}\) \}\)\.then\(okJson\)/.test(tymSrc));

  // =========================================================================
  // Poděkuj kolegovi (lib/podekovani.ts)
  // =========================================================================
  eq('dík: nastavení bez points_config = výchozí 50 b a čtyři hodnoty', nastaveniDiku(null), { prispevek: VYCHOZI_PRISPEVEK, hodnoty: ['ochota', 'čistota', 'tým', 'host'] });
  const nz = nastaveniDiku({ mesicniPrispevek: '80', hodnoty: '#ochota, Ochota, tým,, dlouhá hodnota podniku nad limit' });
  eq('dík: nastavení z uložených hodnot — text s čárkami, „#" pryč, duplicity pryč, strop délky 24', [nz.prispevek, nz.hodnoty.slice(0, 2), nz.hodnoty.length, nz.hodnoty[2].length], [80, ['ochota', 'tým'], 3, 24]);
  eq('dík: nula vypne, nesmysl výchozí, strop 1000', [nastaveniDiku({ mesicniPrispevek: 0 }).prispevek, nastaveniDiku({ mesicniPrispevek: 'x' }).prispevek, nastaveniDiku({ mesicniPrispevek: 99999 }).prispevek], [0, VYCHOZI_PRISPEVEK, 1000]);
  eq('dík: začátek měsíce a zbývá rozdat', [zacatekMesice('2026-10-13'), zbyvaRozdat(50, 20), zbyvaRozdat(50, 80)], ['2026-10-01', 30, 0]);
  const nd = nastaveniDiku({ mesicniPrispevek: 50, hodnoty: ['ochota', 'tým'] });
  eq('dík: platné poděkování 10 b #tým s větou', overDik({ od: 1, komu: 2, body: 10, hodnota: '#tým', veta: ' Díky za záskok ' }, nd, 20), { ok: true, body: 10, hodnota: 'tým', veta: 'Díky za záskok' });
  eq('dík: sám sobě nejde', (overDik({ od: 1, komu: 1, body: 5 }, nd, 0) as any).ok, false);
  eq('dík: jen 5 / 10 / 20', [BODY_DIKU, (overDik({ od: 1, komu: 2, body: 7 }, nd, 0) as any).ok], [[5, 10, 20], false]);
  ok('dík: nad zbytek příspěvku řekne, kolik ještě jde', (overDik({ od: 1, komu: 2, body: 20, }, nd, 40) as any).chyba === 'Tento měsíc můžeš rozdat už jen 10 b.');
  ok('dík: vyčerpaný příspěvek řekne, že se obnoví 1. dne', /obnoví 1\. dne/.test((overDik({ od: 1, komu: 2, body: 5 }, nd, 50) as any).chyba));
  ok('dík: vypnuté (0) odmítne', /vypnuté/.test((overDik({ od: 1, komu: 2, body: 5 }, { prispevek: 0, hodnoty: [] }, 0) as any).chyba));
  ok('dík: cizí hodnota odmítnutá, prázdná hodnota ok', (overDik({ od: 1, komu: 2, body: 5, hodnota: 'cizí' }, nd, 0) as any).ok === false && (overDik({ od: 1, komu: 2, body: 5, hodnota: '' }, nd, 0) as any).hodnota === null);
  eq('dík: věta se ořeže na 140 znaků', (overDik({ od: 1, komu: 2, body: 5, veta: 'x'.repeat(200) }, nd, 0) as any).veta.length, 140);
  const zed = vyberZed({ awards: [{ id: 1, userId: 2, name: 'Eva', avatar: null, points: 10, reason: 'díky', givenBy: 'Jakub', createdAt: '2026-10-01T10:00:00Z', kind: 'kolega', valueTag: 'tým' }], prispevek: { mesicni: 50, zbyva: 30 }, hodnoty: ['tým'], kolegove: [{ id: 2, name: 'Eva' }] });
  eq('dík: zeď z odpovědi API', [zed.diky[0].jmeno, zed.diky[0].hodnota, zed.prispevek, zed.hodnoty, zed.kolegove[0].jmeno], ['Eva', 'tým', { mesicni: 50, zbyva: 30 }, ['tým'], 'Eva']);
  ok('dík: nečekaný tvar je chyba (ErrorState), ne prázdná zeď', (() => { try { vyberZed([]); return false; } catch { return true; } })());
  const awards = zdroj('app/api/rewards/awards/route.ts');
  ok('awards: poděkování kind kolega jde bez hodnoceni.hodnotit, tablet ne, přes overDik a jeClenem', /if \(b\?\.kind === 'kolega'\) return podekovat\(b\)/.test(awards) && /c\.role\.typ === 'kiosk'/.test(awards) && /overDik\(\{ od: c\.meId, komu/.test(awards) && /jeClenem\(komu, c\.teamId\)/.test(awards));
  ok('awards: zeď (?zed=1) vrací jen kind kolega a příspěvek jen osobnímu účtu', /a\.kind = 'kolega'/.test(awards) && /const prispevek = osobni && n\.prispevek > 0/.test(awards));
  ok('awards: poděkování má audit s popiskem a oznámení obdarovanému', /'points\.thanks'/.test(awards) && typeof AUDIT_POPISKY['points.thanks'] === 'string' && /Poděkování od \$\{jmeno\}/.test(awards));
  ok('katalog: Zeď díků pro vedení, zaměstnance i tablet bez klíče oprávnění', !!widgetKatalog('odmeny.zed_diku') && widgetKatalog('odmeny.zed_diku')!.rozhrani.includes('kiosk') && widgetKatalog('odmeny.zed_diku')!.opravneni.vse.length === 0);
  const rv = zdroj('components/employer/RewardsView.tsx');
  ok('nastavení odměn: příspěvek a hodnoty jdou do points_config pod klíči mesicniPrispevek a hodnoty', /pointsConfig: \{ \.\.\.body, mesicniPrispevek: nastaveniDiku\(/.test(rv) && /\.prispevek, hodnoty: nastaveniDiku\(/.test(rv));

  // =========================================================================
  // Automatické body (lib/automatickeBody.ts)
  // =========================================================================
  eq('auto: výchozí — vše zapnuté 10 / 50 / 20', nastaveniAuto(null), { dochvilnost: { zap: true, body: 10 }, vyroci: { zap: true, body: 50 }, narozeniny: { zap: true, body: 20 } });
  eq('auto: z points_config.auto, strop 500, vypnuté pravidlo', nastaveniAuto({ auto: { narozeniny: { zap: false, body: 999 }, vyroci: { body: '30' } } }), { dochvilnost: { zap: true, body: 10 }, vyroci: { zap: true, body: 30 }, narozeniny: { zap: false, body: 500 } });
  const lideO = [
    { id: 1, name: 'Petra', birthday: '1990-10-13', nastup: '2024-10-13' },
    { id: 2, name: 'Adam', birthday: '10-16', nastup: '2026-03-01' },   // narozeniny za 3 dny, nástup letos = žádné výročí
    { id: 3, name: 'Eva', birthday: null, nastup: '2025-10-20' },       // výročí za 7 dní
    { id: 4, name: 'Jan', birthday: '02-29', nastup: null },
  ];
  eq('oslavy dnes (13. 10. 2026): Petra narozeniny i 2 roky u nás', oslavy(lideO, '2026-10-13').map(o => [o.name, o.druh, o.roky, o.zaDni]), [['Petra', 'narozeniny', null, 0], ['Petra', 'vyroci', 2, 0]]);
  eq('oslavy týden dopředu: dnes napřed, Adam za 3 dny, Eva výročí 1 rok za 7 dní; nástup letos není výročí', oslavy(lideO, '2026-10-13', 7).map(o => [o.name, o.druh, o.zaDni, o.roky]),
    [['Petra', 'narozeniny', 0, null], ['Petra', 'vyroci', 0, 2], ['Adam', 'narozeniny', 3, null], ['Eva', 'vyroci', 7, 1]]);
  eq('oslavy: 29. 2. v nepřestupném roce se slaví 1. 3.', oslavy(lideO.filter(l => l.id === 4), '2027-03-01').map(o => o.druh), ['narozeniny']);
  eq('oslavy: nesmyslné datum se přeskočí', oslavy([{ id: 9, name: 'X', birthday: '13-45', nastup: 'x' }], '2026-10-13', 400), []);
  eq('auto: klíč připsání', [klicAuto('narozeniny', '2026'), klicAuto('dochvilnost', '2026-10-05')], ['narozeniny:2026', 'dochvilnost:2026-10-05']);
  eq('auto: minulý celý týden — v úterý 13. 10. je to 5.–11. 10., v pondělí 12. 10. taky', [minulyTyden('2026-10-13'), minulyTyden('2026-10-12')], [{ od: '2026-10-05', do: '2026-10-11', klic: '2026-10-05' }, { od: '2026-10-05', do: '2026-10-11', klic: '2026-10-05' }]);
  eq('auto: zpoždění v minutách (dřív záporné, nečitelné null)', [zpozdeniMin('08:12', '08:00'), zpozdeniMin('07:55', '08:00'), zpozdeniMin('x', '08:00')], [12, -5, null]);
  const prichody = [
    { employeeId: 1, pozdeMin: 3 }, { employeeId: 1, pozdeMin: -2 }, { employeeId: 1, pozdeMin: 10 },      // 3 směny, nikdy nad 10 → dochvilná
    { employeeId: 2, pozdeMin: 0 }, { employeeId: 2, pozdeMin: 25 }, { employeeId: 2, pozdeMin: 0 },       // jednou pozdě
    { employeeId: 3, pozdeMin: 0 }, { employeeId: 3, pozdeMin: 0 },                                        // jen 2 směny
    { employeeId: 4, pozdeMin: null }, { employeeId: 4, pozdeMin: null }, { employeeId: 4, pozdeMin: null }, // bez plánu se nehodnotí
  ];
  eq('auto: dochvilní za týden — jen kdo má ≥ 3 plánované příchody a žádný nad 10 min', dochvilniZaTyden(prichody), [1]);
  ok('auto: důvody česky s emoji', duvodAuto('narozeniny').includes('🎂') && duvodAuto('vyroci', 1) === 'Rok u nás 🎉' && duvodAuto('vyroci', 3) === '3 roky u nás 🎉' && duvodAuto('vyroci', 5) === '5 let u nás 🎉' && duvodAuto('dochvilnost').includes('⏱️'));
  const autoDb = zdroj('lib/automatickeBodyDb.ts');
  ok('auto cron: zápis kind auto s auto_key a ON CONFLICT DO NOTHING (idempotentní), given_by NULL', /kind, auto_key\)/.test(autoDb) && /ON CONFLICT \(team_id, user_id, auto_key\) WHERE auto_key IS NOT NULL DO NOTHING/.test(autoDb) && /NULL, 'auto'/.test(autoDb));
  ok('auto cron: volá se z /api/init denně', /pripisAutomatickeBody\(\)/.test(zdroj('app/api/init/route.ts')));
  ok('katalog: Oslavy v týmu pro vedení, zaměstnance i tablet', !!widgetKatalog('odmeny.oslavy') && widgetKatalog('odmeny.oslavy')!.rozhrani.includes('kiosk') && widgetKatalog('odmeny.oslavy')!.stranky.includes('vedeni.prehled'));
  ok('nastavení odměn: auto jde do points_config', /hodnoty, auto \},/.test(zdroj('components/employer/RewardsView.tsx')));

  // =========================================================================
  // Týmová výzva (lib/vyzvy.ts)
  // =========================================================================
  eq('výzva: čtyři měřítka z hotových čísel', METRIKY, ['uzaverky_bez_manka', 'ukoly', 'hodnoceni_hostu', 'trzba']);
  const dobra = vycistiVyzvu({ nazev: '  Týden bez manka ', metrika: 'uzaverky_bez_manka', cil: '5', od: '2026-10-12', do: '2026-10-18', odmenaText: 'Pizza pro tým', odmenaBody: '' });
  eq('výzva: vyčištěná — název oříznutý, cíl celé číslo, body bez hodnoty null', dobra, { ok: true, vyzva: { nazev: 'Týden bez manka', metrika: 'uzaverky_bez_manka', cil: 5, od: '2026-10-12', do: '2026-10-18', odmenaText: 'Pizza pro tým', odmenaBody: null } });
  ok('výzva: bez názvu, s cizím měřítkem, se záporným cílem, s koncem před začátkem, bez odměny = chyba', [
    vycistiVyzvu({ metrika: 'ukoly', cil: 1, od: '2026-10-12', do: '2026-10-18', odmenaText: 'x' }),
    vycistiVyzvu({ nazev: 'a', metrika: 'x', cil: 1, od: '2026-10-12', do: '2026-10-18', odmenaText: 'x' }),
    vycistiVyzvu({ nazev: 'a', metrika: 'ukoly', cil: -1, od: '2026-10-12', do: '2026-10-18', odmenaText: 'x' }),
    vycistiVyzvu({ nazev: 'a', metrika: 'ukoly', cil: 1, od: '2026-10-19', do: '2026-10-18', odmenaText: 'x' }),
    vycistiVyzvu({ nazev: 'a', metrika: 'ukoly', cil: 1, od: '2026-10-12', do: '2026-10-18' }),
  ].every(v => v.ok === false));
  ok('výzva: hodnocení hostů nejvýš 5 a na desetiny, body každému 0–500, nejdéle 62 dní',
    (vycistiVyzvu({ nazev: 'a', metrika: 'hodnoceni_hostu', cil: 5.5, od: '2026-10-12', do: '2026-10-18', odmenaText: 'x' }) as any).ok === false
    && (vycistiVyzvu({ nazev: 'a', metrika: 'hodnoceni_hostu', cil: '4.66', od: '2026-10-12', do: '2026-10-18', odmenaText: 'x' }) as any).vyzva.cil === 4.7
    && (vycistiVyzvu({ nazev: 'a', metrika: 'ukoly', cil: 1, od: '2026-10-12', do: '2026-10-18', odmenaBody: 900 }) as any).ok === false
    && (vycistiVyzvu({ nazev: 'a', metrika: 'ukoly', cil: 1, od: '2026-10-01', do: '2026-12-31', odmenaText: 'x' }) as any).ok === false);
  const v = { cil: 5, od: '2026-10-12', do: '2026-10-18', hodnota: 3, splnenoAt: null };
  eq('výzva: postup 3 z 5 = 60 %, zbývají 2 dny (16. 10.)', postupVyzvy(v, '2026-10-16'), { procento: 60, zbyvaDni: 2, predZacatkem: false, splneno: false, propadla: false });
  eq('výzva: splněno hodnotou i zápisem; po konci bez splnění propadla; před začátkem', [postupVyzvy({ ...v, hodnota: 6 }, '2026-10-16').splneno, postupVyzvy({ ...v, splnenoAt: 'x' }, '2026-10-30').propadla, postupVyzvy(v, '2026-10-20').propadla, postupVyzvy(v, '2026-10-10').predZacatkem], [true, false, true, true]);
  eq('výzva: procento nikdy přes 100', postupVyzvy({ ...v, hodnota: 50 }, '2026-10-16').procento, 100);
  eq('výzva: k zobrazení — běžící a do 7 dnů po konci, nejbližší konec první', vyzvyKZobrazeni([{ od: '2026-10-01', do: '2026-10-05' }, { od: '2026-10-12', do: '2026-10-25' }, { od: '2026-10-12', do: '2026-10-18' }], '2026-10-16').map(x => x.do), ['2026-10-18', '2026-10-25']);
  eq('výzva: z odpovědi API', vyberVyzvy({ vyzvy: [{ id: 1, nazev: 'A', metrika: 'trzba', cil: 60000, od: '2026-10-12', do: '2026-10-18', odmenaText: null, odmenaBody: 20, splnenoAt: null, hodnota: 12400 }] })[0], { id: 1, nazev: 'A', metrika: 'trzba', cil: 60000, od: '2026-10-12', do: '2026-10-18', odmenaText: null, odmenaBody: 20, splnenoAt: null, hodnota: 12400 });
  ok('výzva: nečekaný tvar je chyba', (() => { try { vyberVyzvy({}); return false; } catch { return true; } })());
  const ch = zdroj('app/api/rewards/challenges/route.ts');
  ok('výzvy: čtení každý člen, vyhlášení a zrušení jen s odmeny.nastaveni, tělo přes vycistiVyzvu', /export async function GET\(\)[\s\S]*pozaduj\(null\)/.test(ch) && (ch.match(/pozaduj\('odmeny\.nastaveni'\)/g) ?? []).length === 2 && /vycistiVyzvu\(await req\.json/.test(ch));
  ok('výzvy: splnění se zapíše jednou (splneno_at IS NULL), body všem kind vyzva s klíčem, oznámení všem', /splneno_at = NOW\(\) WHERE id = \$\{v\.id\} AND team_id = \$\{teamId\} AND splneno_at IS NULL/.test(ch) && /'vyzva', \$\{`vyzva:\$\{v\.id\}`\}/.test(ch) && /notifyUsers\(lide\.map/.test(ch));
  ok('výzvy: uzávěrky bez manka počítá stejným cashDifference jako Uzávěrky', /cashDifference\(\{ \.\.\.r, tips_in_drawer: tipsInDrawer \}\) >= 0/.test(ch));
  ok('výzvy: audit má popisky', ['vyzva.vyhlasit', 'vyzva.smazat', 'vyzva.splnena'].every(k => typeof AUDIT_POPISKY[k] === 'string'));
  ok('katalog: Výzva týdne pro vedení, zaměstnance i tablet na Přehledu, Domů a Směně', !!widgetKatalog('odmeny.vyzva') && ['vedeni.prehled', 'zamestnanec.domu', 'kiosk.smena'].every(s => (widgetKatalog('odmeny.vyzva')!.stranky as string[]).includes(s)));
}
