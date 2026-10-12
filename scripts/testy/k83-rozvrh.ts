// Kolo 7, balík R7-1 — Rozvrh a volno.
//
// Hlídá čisté výpočty (lib/rozvrhPrehled.ts, lib/rozvrhPublikace.ts) a ve zdroji to,
// co se nesmí vrátit: důvod zamítnutí volna (text oznámení s důvodem i bez něj, délka),
// a že Zamítnout zůstává jedním klikem a hromadné rozhodnutí bez okna.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { duvodVolna, textRozhodnutiVolna, MAX_DUVOD_VOLNA, otevritMojeZadosti } from '../../lib/rozvrhPrehled.ts';
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
}
