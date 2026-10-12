// Kolo 7, balík R7-1 — Rozvrh a volno.
//
// Hlídá čisté výpočty (lib/rozvrhPrehled.ts, lib/rozvrhPublikace.ts) a ve zdroji to,
// co se nesmí vrátit: důvod zamítnutí volna (text oznámení s důvodem i bez něj, délka),
// a že Zamítnout zůstává jedním klikem a hromadné rozhodnutí bez okna.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  duvodVolna, textRozhodnutiVolna, MAX_DUVOD_VOLNA, otevritMojeZadosti,
  stavyDostupnosti, denTydne, nastavDenVTydnu, prevezmiVzor, poznamkaSmeny, MAX_POZNAMKA_SMENY,
} from '../../lib/rozvrhPrehled.ts';
import { VYCHOZI_NAV, NAV_TEXTY } from '../../lib/navigace.ts';

const cti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

export default function ({ eq, ok }: Testy) {
  // ---- zamitnute-volno-bez-duvodu ----
  eq('volno: důvod se ořízne, prázdný je null', [duvodVolna('  Málo lidí  '), duvodVolna('   '), duvodVolna(''), duvodVolna(null), duvodVolna(undefined)], ['Málo lidí', null, null, null, null]);
  eq('volno: důvod na hraně 300 znaků projde, delší je false (server odpoví 400, neuřízne)', [duvodVolna('a'.repeat(MAX_DUVOD_VOLNA)) === 'a'.repeat(300), duvodVolna('a'.repeat(301))], [true, false]);
  eq('volno: oznámení o zamítnutí s důvodem připojí „ · důvod"',
    textRozhodnutiVolna({ od: '2026-10-03', doDne: '2026-10-07', status: 'rejected', terminUpraven: false, duvod: 'Ten týden už má volno Petr' }),
    '2026-10-03 až 2026-10-07 · Ten týden už má volno Petr');
  eq('volno: zamítnutí bez důvodu je jen termín',
    textRozhodnutiVolna({ od: '2026-10-03', doDne: '2026-10-03', status: 'rejected', terminUpraven: false, duvod: null }), '2026-10-03');
  eq('volno: schválení důvod nepřipojí, upravený termín ano',
    textRozhodnutiVolna({ od: '2026-10-03', doDne: '2026-10-04', status: 'approved', terminUpraven: true, duvod: 'x' }),
    '2026-10-03 až 2026-10-04 (termín upraven vedením)');
  eq('volno: samotná úprava termínu (bez status) poznámku o úpravě nepíše — titulek to říká',
    textRozhodnutiVolna({ od: '2026-10-03', doDne: '2026-10-03', status: null, terminUpraven: true }), '2026-10-03');

  const api = cti('app/api/timeoff/route.ts');
  ok('volno API: PATCH ukládá decision_note jen spolu se status a GET ho vrací jako decisionNote',
    /const nextNote = status \? duvod : \(existing\.decision_note \?\? null\)/.test(api) && /decision_note = \$\{nextNote\}/.test(api) && /decisionNote: r\.decision_note/.test(api));
  ok('volno API: rozhodnutí jde do historie změn (volno.rozhodnout)', /audit\(c\.teamId, c\.meId, 'volno\.rozhodnout', 'time_off', id, status\)/.test(api));
  ok('volno: DDL sloupce decision_note', /ALTER TABLE time_off_requests ADD COLUMN IF NOT EXISTS decision_note TEXT/.test(cti('app/api/init/route.ts')));

  const widget = cti('components/widgety/oblasti/rozvrh.tsx');
  ok('volno widget: Zamítnout dál jedním klikem, s důvodem jen z „···"',
    /onClick=\{\(\) => rozhodni\(z, 'rejected'\)\}>\{t\('Zamítnout'\)\}/.test(widget) && /t\('Zamítnout s důvodem…'\)/.test(widget));
  ok('volno widget: hromadné rozhodnutí bez okna (patch bez note)', /runBulk\(ids, async id => \{ kolizeVsech\.push\(await patch\(\{ id, status \}\)\); \}\)/.test(widget));
  ok('volno widget: okno s důvodem má Textarea s maxLength a zamítá přes note', /maxLength=\{MAX_DUVOD_VOLNA\}/.test(widget) && /status: 'rejected', note: duvod\.trim\(\) \|\| null/.test(widget));
  ok('volno zaměstnanec: zamítnutá žádost ukazuje „Vedení: …" v detailu řádku',
    /detail=\{r\.status === 'rejected' && r\.decisionNote \? t\('Vedení: \{duvod\}'/.test(cti('components/scheduling/TimeOffRequest.tsx')));

  // ---- volno-utopene-pod-dostupnosti ----
  const dnes = '2026-10-12';
  eq('moje žádosti: čekající otevře sbalený seznam', otevritMojeZadosti([{ status: 'pending', toDate: '2026-11-01' }], dnes), true);
  eq('moje žádosti: zamítnutá podaná před týdnem otevře, starší s proběhlým termínem ne', [
    otevritMojeZadosti([{ status: 'rejected', toDate: '2026-09-01', createdAt: '2026-10-05 10:00:00' }], dnes),
    otevritMojeZadosti([{ status: 'rejected', toDate: '2026-09-01', createdAt: '2026-09-01 10:00:00' }], dnes),
  ], [true, false]);
  eq('moje žádosti: zamítnutá s budoucím termínem otevře i bez data podání', otevritMojeZadosti([{ status: 'rejected', toDate: '2026-12-24' }], dnes), true);
  eq('moje žádosti: schválené a prázdné nechají sbalené', [otevritMojeZadosti([{ status: 'approved', toDate: '2026-12-24' }], dnes), otevritMojeZadosti([], dnes)], [false, false]);

  const layout = cti('components/employee/EmployeeLayout.tsx');
  ok('Dostupnost: karta TimeOffRequest pod plochou je pryč, layout předá arg Dostupnosti',
    !/TimeOffRequest/.test(layout) && /view === 'availability'\) predejPohledu\(view, arg\)/.test(layout));
  const dostupnost = cti('components/scheduling/AvailabilitySubmit.tsx');
  ok('Dostupnost: „Žádost o volno" v hlavičce (secondary i na telefonu) otevírá okno',
    /secondary: zadostTlacitko/.test(dostupnost) && /primaryTelefon: zadostTlacitko/.test(dostupnost) && /<OknoZadostiVolna /.test(dostupnost));
  ok('Dostupnost: Moje žádosti právě jednou (SeznamZadosti v <details>), okno je jen formulář',
    (dostupnost.match(/<SeznamZadosti /g) ?? []).length === 1 && /<details open=\{otevreno\}/.test(dostupnost) && !/SeznamZadosti/.test(cti('components/scheduling/TimeOffRequest.tsx').split('export function OknoZadostiVolna')[1].split('// Moje žádosti')[0]));
  ok('Dostupnost: předání „volno" z palety okno otevře', /cerstvePredaniPohledu\('availability'\) === 'volno'/.test(dostupnost));
  const zam = VYCHOZI_NAV.zamestnanec.polozky.find(p => p.id === 'availability');
  eq('navigace: „Dostupnost a volno" (překlad s kontextem |nav)', [zam?.label, NAV_TEXTY.includes('Dostupnost a volno')], ['Dostupnost a volno', true]);

  // ---- dostupnost-tydenni-vzor ----
  // Listopad 2026: 1. je neděle; pondělky 2, 9, 16, 23, 30.
  const CYKLUS = ['available', 'off', 'type:1', 'type:2'];
  eq('vzor: den v týdnu jako getDay (1. 11. 2026 je neděle, 2. 11. pondělí)', [denTydne('2026-11-01'), denTydne('2026-11-02'), denTydne('2026-11-30')], [0, 1, 1]);
  eq('vzor: uložená dostupnost → stavy (preference přednost, nedostupné = off, neznámé pryč)',
    stavyDostupnosti({ dayPreferences: { '2026-11-02': 'type:3', '2026-11-03': 'available', '2026-11-04': 'nesmysl' }, unavailableDates: ['2026-11-02', '2026-11-05'] }),
    { '2026-11-02': 'type:3', '2026-11-05': 'off' });
  eq('vzor: štětcem „Nemůžu" na Po nastaví všechna pondělí měsíce',
    Object.keys(nastavDenVTydnu({}, '2026-11', 1, 'off', CYKLUS, '2026-10-12')), ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
  const vsechnaPo = nastavDenVTydnu({}, '2026-11', 1, 'off', CYKLUS, '2026-10-12');
  eq('vzor: druhé klepnutí se štětcem (všechna už „Nemůžu") je vrátí na Dostupný, ostatní dny nechá',
    nastavDenVTydnu({ ...vsechnaPo, '2026-11-03': 'type:1' }, '2026-11', 1, 'off', CYKLUS, '2026-10-12'), { '2026-11-03': 'type:1' });
  eq('vzor: bez štětce další stav cyklu podle prvního takového dne (pondělí 2. je „Nemůžu" → všechna „Jen 1")',
    Object.values(nastavDenVTydnu({ '2026-11-02': 'off' }, '2026-11', 1, null, CYKLUS, '2026-10-12')), ['type:1', 'type:1', 'type:1', 'type:1', 'type:1']);
  eq('vzor: v aktuálním měsíci přeskočí dny před dneškem (dnes je pondělí 13. 10. → jen 19. a 26.; 5. 10. zůstane, jak byl)',
    nastavDenVTydnu({ '2026-10-05': 'type:2' }, '2026-10', 1, 'off', CYKLUS, '2026-10-13'), { '2026-10-05': 'type:2', '2026-10-19': 'off', '2026-10-26': 'off' });

  // Říjen 2026: pondělky 5, 12, 19, 26; středy 7, 14, 21, 28.
  const rijen = { dayPreferences: { '2026-10-07': 'type:1', '2026-10-14': 'type:1', '2026-10-21': 'type:2' }, unavailableDates: ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-10-09'] };
  const listopad = prevezmiVzor(rijen, '2026-11', 1);
  eq('vzor: Jako minulý měsíc — pondělí „Nemůžu" (4×), středa „Jen 1" (2× proti 1×), pátek jen 1× nic',
    [listopad.stavy['2026-11-02'], listopad.stavy['2026-11-30'], listopad.stavy['2026-11-04'], listopad.stavy['2026-11-06'], listopad.zmeneno], ['off', 'off', 'type:1', undefined, 9]);
  eq('vzor: po sloupcích podle začátku týdne (pondělí první vs. neděle první)',
    [prevezmiVzor(rijen, '2026-11', 1).vzor, prevezmiVzor(rijen, '2026-11', 0).vzor],
    [['off', null, 'type:1', null, null, null, null], [null, 'off', null, 'type:1', null, null, null]]);
  eq('vzor: dny s vlastním stavem a minulé dny nepřepíše, smazaný typ nepřenese, remíza nic',
    [
      prevezmiVzor(rijen, '2026-11', 1, { stavajici: { '2026-11-02': 'type:2' } }).stavy['2026-11-02'],
      prevezmiVzor(rijen, '2026-10', 1, { dnes: '2026-10-20' }).stavy['2026-10-12'],
      prevezmiVzor(rijen, '2026-11', 1, { povolene: ['off'] }).stavy['2026-11-04'],
      prevezmiVzor({ unavailableDates: ['2026-10-07', '2026-10-14'], dayPreferences: { '2026-10-21': 'type:1', '2026-10-28': 'type:1' } }, '2026-11', 1).vzor[2],
      prevezmiVzor(null, '2026-11', 1).zmeneno,
    ],
    ['type:2', undefined, undefined, null, 0]);
  ok('vzor: hlavičky dnů jsou tlačítka s aria-label a „Jako minulý měsíc" je ghost s ikonou copy',
    /aria-label=\{t\('Nastavit všechny dny \{den\} v měsíci'/.test(dostupnost) && /onClick=\{\(\) => nastavSloupec\(\(i \+ 1\) % 7\)\}/.test(dostupnost)
    && /<Button variant="ghost" size="sm" icon="copy"[\s\S]{0,400}?\{t\('Jako minulý měsíc'\)\}/.test(dostupnost));
  ok('vzor: minulý měsíc se stahuje přes mezipaměť (každý měsíc nejvýš jednou)', /ulozeneMesice\.current\.has\(m\)/.test(dostupnost) && /\/api\/availability\?mine=1&month=\$\{m\}/.test(dostupnost));

  // ---- smena-poznamka ----
  eq('poznámka směny: ořízne, zalomení na jeden řádek, prázdná null', [poznamkaSmeny('  Klíče\n u Petry '), poznamkaSmeny(' \n '), poznamkaSmeny(null)], ['Klíče u Petry', null, null]);
  eq('poznámka směny: 200 znaků projde, 201 je false (400, ne uříznutí)', [MAX_POZNAMKA_SMENY, poznamkaSmeny('a'.repeat(200)) === 'a'.repeat(200), poznamkaSmeny('a'.repeat(201))], [200, true, false]);
  const smenyApi = cti('app/api/shifts/route.ts');
  const tymVetev = smenyApi.slice(smenyApi.indexOf("if (searchParams.get('team') === '1')"), smenyApi.indexOf("const resolve = await typeResolver(c.teamId);\n  if (opr.has('rozvrh.zobrazit'))"));
  ok('poznámka směny: týmový náhled (team=1) ji nedostane, vlastní a plánovač ano',
    /\.\.\.shape\(r, resolveTeam\),/.test(tymVetev) && !/shape\(r, resolveTeam, true\)/.test(tymVetev)
    && /shape\(r, resolve, !cizi \|\| opr\.has\('rozvrh\.zobrazit'\)\)/.test(smenyApi) && /\.\.\.\(sPoznamkou \? \{ note: r\.note \?\? null \} : \{\}\)/.test(smenyApi));
  const patch = smenyApi.slice(smenyApi.indexOf('export async function PATCH'));
  ok('poznámka směny: PATCH chce rozvrh.upravit, hlídá team_id a jde do historie (rozvrh.poznamka)',
    /pozaduj\('rozvrh\.upravit'\)/.test(patch) && /WHERE id = \$\{id\} AND team_id = \$\{c\.teamId\}/.test(patch) && /audit\(c\.teamId, c\.meId, 'rozvrh\.poznamka', 'shift', id/.test(patch));
  const rozvrhApi = cti('app/api/schedule/route.ts');
  ok('poznámka směny: GET /api/schedule ji vrací a hromadné uložení (kopie týdne, import) ji přenese',
    /s\.type, s\.note,/.test(rozvrhApi) && /note: r\.note \?\? null/.test(rozvrhApi) && /INSERT INTO shifts \(team_id, employee_id, date, start_time, end_time, type, note\)/.test(rozvrhApi));
  ok('poznámka směny: DDL sloupce shifts.note', /ALTER TABLE shifts ADD COLUMN IF NOT EXISTS note TEXT/.test(cti('app/api/init/route.ts')));
  const planovac = cti('components/scheduling/ScheduleBuilder.tsx');
  ok('poznámka směny: okno dne má pole Poznámka (maxLength 200) a pilulka ikonu s poznámkou v title',
    /label=\{t\('Poznámka ke směně \(nepovinné\)'\)\}/.test(planovac) && /maxLength=\{MAX_POZNAMKA_SMENY\}/.test(planovac) && /\$\{s\.note \? ` · \$\{s\.note\}` : ''\}/.test(planovac));
  ok('poznámka směny: Moje směny ji ukazují v detailu řádku', /data-poznamka-smeny/.test(cti('components/employee/MyShifts.tsx')) && /prvni\.s\.note/.test(cti('components/widgety/oblasti/moje-smeny.tsx')));
}
