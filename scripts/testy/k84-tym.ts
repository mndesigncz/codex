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
import type { ZaznamDochazky } from '../../lib/dochazkaPrehled.ts';
import {
  BEZ_LIMITU, ZAKONNE_LIMITY, klicTydne, smenaVLimitech, souhrnVarovani, varovaniLimitu, varovaniNoveSmeny, varovaniPodleSmeny, vycistiLimity,
  type SmenaLimitu,
} from '../../lib/rozvrhLimity.ts';
import {
  navrhniRozvrh, planProtiTrzbam, podilMezdPlanu, tonPodilu, trzbaDne, type ClovekGeneratoru, type TypSmeny, type VstupGeneratoru,
} from '../../lib/rozvrhGenerator.ts';

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
}
