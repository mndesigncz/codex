// Kolo 70 — povinné před uzávěrkou (postupy, úkoly, návody): jednotkové testy.
//
// Čistá pravidla jsou v lib/povinnePredUzaverkou.ts. Hlídá se hlavně to, co
// by zamklo uzávěrku neprávem nebo ji naopak pustilo: nezjištěný zdroj nesmí
// zamykat, cizí úkol z jiné směny taky ne, a postup dodělaný po půlnoci
// noční směny patří k večeru, který se zavírá (dřív se počítal kalendářní den
// a noční směna zůstala zamčená). K tomu pojistky nad zdrojáky: POST i GET
// sdílí jeden kontext a GET při chybě nevrací prázdný seznam.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  seradPolozky, sestavStav, jeZamceno, pocty, duvodVolna, ukolProPosadku, denDokonceni, zpravaZamceno,
  type PovinnaPolozka,
} from '../../lib/povinnePredUzaverkou.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
/** Kód bez komentářů — komentáře popisují, co se opravilo, a pojistky by chytaly je. */
const kod = (cesta: string) => zdroj(cesta).split('\n').filter(r => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(r)).join('\n');

const pol = (typ: PovinnaPolozka['typ'], id: number, nazev: string, hotovo: boolean): PovinnaPolozka => ({
  typ, id, nazev, ikona: null, hotovo,
  odkaz: { pohled: typ === 'postup' ? 'procedures' : typ === 'ukol' ? 'tasks' : 'guides', arg: String(id), href: '/employee/shifts' },
});

export default function ({ eq, ok }: Testy) {
  // ---- řazení: skupiny postup → úkol → návod, v nich chybějící první, pak název ----
  const smes = [
    pol('navod', 1, 'Nová kasa', false),
    pol('ukol', 2, 'Vynést koš', true),
    pol('postup', 3, 'Zavření baru', false),
    pol('ukol', 4, 'Čištění trysky', false),
    pol('postup', 5, 'Úklid', true),
    pol('ukol', 6, 'Auta', false),
  ];
  eq('řazení: skupiny, chybějící první, česky podle názvu',
    seradPolozky(smes).map(x => x.id), [3, 5, 6, 4, 2, 1]);
  eq('řazení: vstup se nemění', smes.map(x => x.id), [1, 2, 3, 4, 5, 6]);

  // ---- stav a zámek ----
  const stav = sestavStav(smes, []);
  eq('stav: polozky jsou jen chybějící, seřazené', stav.polozky.map(x => x.id), [3, 6, 4, 1]);
  eq('stav: vsechny drží i hotové (ukazatel Hotovo X z Y)', pocty(stav), { celkem: 6, hotovo: 2 });
  ok('zámek: něco chybí → zamčeno', jeZamceno(stav));
  ok('zámek: všechno hotové → odemčeno', !jeZamceno(sestavStav([pol('ukol', 1, 'A', true), pol('postup', 2, 'B', true)])));
  ok('zámek: nic povinného → odemčeno', !jeZamceno(sestavStav([])));
  ok('zámek: null (odpověď se nenačetla) nezamyká', !jeZamceno(null));

  // Nezjištěný zdroj (před migrací, výpadek) nesmí zamknout — jinak by se
  // uzávěrka zasekla kvůli chybě, ne kvůli nesplněné práci.
  const nezname = sestavStav([], ['ukol', 'navod', 'ukol']);
  ok('neznamo: samo nezamyká', !jeZamceno(nezname));
  eq('neznamo: bez duplicit', nezname.neznamo, ['ukol', 'navod']);
  ok('neznamo: zamyká jen skutečně chybějící věc z jiného zdroje',
    jeZamceno(sestavStav([pol('postup', 1, 'A', false)], ['ukol'])));

  // ---- proč se nehlídá ----
  eq('volno: akce', duvodVolna({ eventId: 7, maSmenu: true }), 'akce');
  eq('volno: bez směny', duvodVolna({ eventId: null, maSmenu: false }), 'mimo_smenu');
  eq('volno: běžná směna se hlídá', duvodVolna({ eventId: null, maSmenu: true }), null);

  // ---- osádka: kdo úkol zamyká ----
  ok('osádka: úkol pro kohokoli zamyká každou směnu', ukolProPosadku(null, [1, 2]));
  ok('osádka: přiřazený člověk na směně → zamyká', ukolProPosadku(2, [1, 2]));
  ok('osádka: přiřazený mimo směnu → nezamyká', !ukolProPosadku(9, [1, 2]));
  ok('osádka: id jako řetězec z DB se porovná číselně', ukolProPosadku('2' as unknown as number, [1, 2]));
  ok('osádka: null = souhrn za podnik, bez filtru', ukolProPosadku(9, null));

  // ---- obchodní den dokončení postupu (noční směna) ----
  // Léto (SELČ, UTC+2): 0:30 a 5:59 patří předchozímu dni, 6:00 už dnešku.
  eq('den: 00:30 v létě → včera', denDokonceni(new Date('2026-09-28T22:30:00Z')), '2026-09-28');
  eq('den: 05:59 v létě → včera', denDokonceni(new Date('2026-09-29T03:59:00Z')), '2026-09-28');
  eq('den: 06:00 v létě → dnes', denDokonceni(new Date('2026-09-29T04:00:00Z')), '2026-09-29');
  eq('den: 23:50 → týž den', denDokonceni(new Date('2026-09-29T21:50:00Z')), '2026-09-29');
  // Zima (SEČ, UTC+1): posun hodin nesmí rozhodit hranici.
  eq('den: 00:30 v zimě → včera', denDokonceni(new Date('2026-01-14T23:30:00Z')), '2026-01-14');
  eq('den: 06:00 v zimě → dnes', denDokonceni(new Date('2026-01-15T05:00:00Z')), '2026-01-15');

  // ---- hláška pro starší klienty (ukazují jen `error`) ----
  eq('hláška: jedna věc', zpravaZamceno([pol('ukol', 1, 'Vynést koš', false)]),
    'Uzávěrka je zamčená — nejdřív dokonči 1 věc: Vynést koš.');
  eq('hláška: tři věci', zpravaZamceno([pol('postup', 1, 'A', false), pol('ukol', 2, 'B', false), pol('navod', 3, 'C', false)]),
    'Uzávěrka je zamčená — nejdřív dokonči 3 věci: A, B, C.');
  ok('hláška: dlouhý výčet se zkrátí', zpravaZamceno([1, 2, 3, 4, 5, 6, 7].map(i => pol('ukol', i, `U${i}`, false)))
    .endsWith('7 věcí: U1, U2, U3, U4, U5 a další.'));

  // ---- pojistky nad zdrojáky ----
  const post = kod('app/api/closings/route.ts');
  ok('POST /api/closings: kontext z urciKontextUzaverky (stejný den a osádka jako GET)', /urciKontextUzaverky\(c, b\)/.test(post));
  ok('POST /api/closings: brána přes chybejiciPredUzaverkou s kódem POVINNE_NESPLNENO',
    /chybejiciPredUzaverkou\(/.test(post) && /kod: 'POVINNE_NESPLNENO'/.test(post) && /chybi: stav\.polozky/.test(post));
  ok('POST /api/closings: starý dotaz s kalendářním dnem je pryč', !/IN \(\$\{shiftDate\}, \$\{date\}\)/.test(post));
  ok('GET /api/closings: posílá obejitPovinne', /obejitPovinne: p\.obejitPostupy/.test(post));

  const get = kod('app/api/closings/povinne/route.ts');
  ok('GET /povinne: sdílí urciKontextUzaverky', /urciKontextUzaverky\(c,/.test(get));
  ok('GET /povinne: chyba je 503, ne prázdný seznam', /status: 503/.test(get));
  ok('GET /povinne: vyžaduje uzaverky.vytvorit', /pozaduj\('uzaverky\.vytvorit'\)/.test(get));

  const db = kod('lib/povinnePredUzaverkouDb.ts');
  ok('DB: postupy jen schválené a jen běhy tohoto podniku',
    /approved IS DISTINCT FROM FALSE/.test(db) && /r\.team_id = \$\{o\.teamId\}/.test(db));
  ok('DB: postupy podle obchodního dne (NIGHT_CUTOFF_HOUR)', /NIGHT_CUTOFF_HOUR/.test(db));
  ok('DB: návod vyžaduje přečtení aktuální verze', /gr\.read_at >= g\.updated_at/.test(db));

  const init = zdroj('app/api/init/route.ts');
  ok('DDL: tasks.require_before_closing', /ALTER TABLE tasks ADD COLUMN IF NOT EXISTS require_before_closing BOOLEAN DEFAULT FALSE/.test(init));
  ok('DDL: částečný index tasks_povinne', /CREATE INDEX IF NOT EXISTS tasks_povinne ON tasks \(team_id, due_date\) WHERE require_before_closing = TRUE/.test(init));
  ok('DDL: guides.require_before_closing', /ALTER TABLE guides ADD COLUMN IF NOT EXISTS require_before_closing BOOLEAN DEFAULT FALSE/.test(init));

  const ukoly = kod('app/api/tasks/route.ts');
  ok('úkoly: shape vrací requireBeforeClosing', /requireBeforeClosing: r\.require_before_closing === true/.test(ukoly));
  // Nový sloupec v INSERTech by před migrací shodil i záložní vložení.
  ok('úkoly: příznak není v žádném INSERTu', !/INSERT INTO tasks \([^)]*require_before_closing/.test(ukoly));
  ok('úkoly: top-up nečte příznak v hlavním SELECTu',
    !/SELECT id, title, description, assigned_to, created_by, priority, due_date, recurrence, checklist, series_id, require_before_closing/.test(ukoly));

  const navod = kod('app/api/guides/[id]/route.ts');
  ok('návody: opakované potvrzení obnoví čas čtení', /ON CONFLICT \(guide_id, user_id\) DO UPDATE SET read_at = NOW\(\)/.test(navod));
}
