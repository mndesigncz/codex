// Kolo 69, balík B6a (Úkoly, plánování, nápady) — jednotkové testy.
//
// Čistá logika je v lib/ukolyPrehled.ts: výběr z /api/tasks, /api/planning
// a /api/suggestions, „po termínu", rozdělení seznamu po dnech, „podle lidí",
// „splněno dnes" a nejžádanější podněty. Hlídá se hlavně to, na čem se číslo
// ve widgetu a sekce v nástroji pod ním můžou rozejít: dnešní termín není po
// termínu, budoucí výskyty opakovaných úkolů nejsou „aktivní", splnění včera
// v 23:30 pražského času není „dnes", nečekaná odpověď je chyba a ne nula.
// K tomu katalog a stránky balíku (hotovo, ikony, oprávnění, aktivní plochy)
// a pojistky nad zdrojáky (žádné confirm(), emoji ani ruční okna).

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import type { Divak } from '../../lib/widgety/typy.ts';
import {
  vyberUkoly, poTerminu, jePoTerminu, vRozsahu, rozdelPoDnech, podleLidi, splnenoDnes, jeCiziUkol,
  vyberKarty, souhrnPlanu, kartySloupce, vyberPodnety, nejzadanejsi, novePodnety, prepniHlas,
} from '../../lib/ukolyPrehled.ts';
import { WIDGETY as UKOLY } from '../../lib/widgety/katalog/ukoly.ts';
import { WIDGETY as PLANOVANI } from '../../lib/widgety/katalog/planovani.ts';
import { WIDGETY as NAPADY } from '../../lib/widgety/katalog/napady.ts';
import { widget } from '../../lib/widgety/katalog/index.ts';
import { stranka } from '../../lib/widgety/stranky/index.ts';
import { vyresRozlozeni } from '../../lib/widgety/rozlozeni.ts';
import { KATALOG, SYSTEMOVE_ROLE } from '../../lib/opravneni.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
/** Kód bez komentářů — komentáře popisují, co se opravilo („dřív confirm()"), a pojistky by chytaly je. */
const kod = (cesta: string) => zdroj(cesta).split('\n').filter(r => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(r)).join('\n');

const DNES = '2026-09-26';
const ukolyRaw = [
  { id: 1, title: 'Umýt okna', status: 'pending', priority: 'high', dueDate: '2026-09-24', assignedTo: 7, createdBy: 1, assigneeName: 'Eva' },
  { id: 2, title: 'Doplnit sirupy', status: 'pending', priority: 'medium', dueDate: DNES, assignedTo: 7, createdBy: 1, assigneeName: 'Eva' },
  { id: 3, title: 'Vynést sklo', status: 'in_progress', priority: 'low', dueDate: '2026-09-25T00:00:00.000Z', assignedTo: null, createdBy: 1 },
  { id: 4, title: 'Zítřejší výskyt', status: 'pending', priority: 'medium', dueDate: '2026-09-27', assignedTo: 8, createdBy: 1, assigneeName: 'Petr', seriesId: 's-1', recurrence: 'daily' },
  { id: 5, title: 'Za dva týdny', status: 'pending', priority: 'medium', dueDate: '2026-10-10', assignedTo: 8, createdBy: 1, assigneeName: 'Petr' },
  { id: 6, title: 'Bez termínu', status: 'pending', priority: 'medium', dueDate: null, assignedTo: 8, createdBy: 8, assigneeName: 'Petr' },
  // Splněno dnes ráno a včera pozdě večer (pražský čas): 21:30 UTC 25. 9. = 23:30 v Praze → včera.
  { id: 7, title: 'Ranní káva', status: 'done', priority: 'low', dueDate: DNES, assignedTo: 7, createdBy: 1, completedByName: 'Eva', completedAt: '2026-09-26T06:15:00.000Z' },
  { id: 8, title: 'Včerejší úklid', status: 'done', priority: 'low', dueDate: '2026-09-25', assignedTo: 8, createdBy: 1, completedByName: 'Petr', completedAt: '2026-09-25T21:30:00.000Z' },
  { id: 9, title: 'Starý hotový', status: 'done', priority: 'low', dueDate: '2026-09-20', assignedTo: 8, createdBy: 1, completedByName: 'Petr' },
  { id: 10, title: 'Pozdní odpolední', status: 'done', priority: 'low', dueDate: DNES, assignedTo: null, createdBy: 1, completedByName: 'Eva', completedAt: '2026-09-26T14:00:00.000Z' },
];

export default function ({ eq, ok }: Testy) {
  // ---- úkoly ----
  const u = vyberUkoly(ukolyRaw);
  eq('úkoly: výběr zkrátí datum s časem na den a zachová null', [u[2].dueDate, u[5].dueDate, u[2].teamTask], ['2026-09-25', null, true]);
  let chyba = '';
  try { vyberUkoly({ error: 'Server spadl' }); } catch (e) { chyba = String((e as Error).message); }
  ok('úkoly: nečekaná odpověď je chyba, ne prázdný seznam', chyba.includes('nečekaném tvaru'));
  ok('úkoly: dnešní termín není po termínu, včerejší ano', !jePoTerminu(u[1], DNES) && jePoTerminu(u[2], DNES));
  eq('úkoly: po termínu = nedokončené s termínem před dneškem, nejstarší první', poTerminu(u, DNES).map(t => t.id), [1, 3]);
  eq('úkoly: rozsah moje (Eva) / moje a pro kohokoli / tým', [
    vRozsahu(u, 'moje', 7).map(t => t.id), vRozsahu(u, 'moje_a_volne', 7).map(t => t.id).length, vRozsahu(u, 'tym', 7).length,
  ], [[1, 2, 7], 5, 10]);
  const sk = rozdelPoDnech(u, DNES, '2026-10-03');
  eq('úkoly: rozdělení po dnech (po termínu, dnes — bez termínu první, týden, později, hotové)', [
    sk.poTerminu.map(t => t.id), sk.dnes.map(t => t.id), sk.tentoTyden.map(t => t.id), sk.pozdeji.map(t => t.id), sk.hotove.length,
  ], [[1, 3], [6, 2], [4], [5], 4]);

  const lide = podleLidi(u, DNES);
  eq('podle lidí: Eva má 2 aktivní a 1 po termínu, Petr jen úkol bez termínu (zítřejší výskyt série a ten za dva týdny se nepočítají), pro kohokoli na konci',
    lide.map(r => [r.jmeno, r.aktivni, r.poTerminu]), [['Eva', 2, 1], ['Petr', 1, 0], ['Pro kohokoli', 1, 1]]);
  eq('splněno dnes: jen s dnešním pražským completedAt, poslední první (23:30 včera není dnes, bez času se nepočítá)',
    splnenoDnes(u, DNES).map(t => t.id), [10, 7]);
  ok('cizí úkol: přiřazený jinému a ne můj zadaný; pro kohokoli ani můj zadaný cizí nejsou',
    jeCiziUkol(u[0], 8) && !jeCiziUkol(u[2], 8) && !jeCiziUkol(u[0], 1) && !jeCiziUkol(u[0], 7));

  // ---- plánování ----
  const karty = vyberKarty([
    { id: 1, title: 'Nová káva', column: 'ideas', position: 1 },
    { id: 2, title: 'Oprava mlýnku', column: 'review', position: 2 },
    { id: 3, title: 'Terasa', column: 'review', position: 0 },
    { id: 4, title: 'Menu', column: 'in_progress', position: 0 },
    { id: 5, title: 'Starý import', column: 'backlog', position: 0 },
    { id: 6, title: 'Hotovo', column: 'done', position: 0 },
  ]);
  eq('plánování: souhrn sloupců, neznámý sloupec se počítá do Nápadů', souhrnPlanu(karty), { ideas: 2, in_progress: 1, review: 2, done: 1 });
  eq('plánování: karty ke schválení v pořadí na tabuli', kartySloupce(karty, 'review').map(c => c.title), ['Terasa', 'Oprava mlýnku']);
  let chybaPlanu = '';
  try { vyberKarty({ error: 'x' }); } catch (e) { chybaPlanu = String((e as Error).message); }
  ok('plánování: nečekaná odpověď je chyba', chybaPlanu.includes('nečekaném tvaru'));

  // ---- nápady ----
  const d = vyberPodnety({
    isEmployer: true, meId: 3,
    suggestions: [
      { id: 1, title: 'Druhý mlýnek', status: 'new', votes: 4, hasVoted: false, createdAt: '2026-09-20T10:00:00Z', authorName: 'Eva' },
      { id: 2, title: 'Oat milk', status: 'planned', votes: 9, hasVoted: true, createdAt: '2026-09-10T10:00:00Z' },
      { id: 3, title: 'Nová zástěra', status: 'new', votes: 4, hasVoted: false, createdAt: '2026-09-22T10:00:00Z' },
      { id: 4, title: 'Zrušit brunch', status: 'declined', votes: 20, hasVoted: false, createdAt: '2026-09-01T10:00:00Z' },
      { id: 5, title: 'Hotové', status: 'done', votes: 30, hasVoted: false, createdAt: '2026-08-01T10:00:00Z' },
    ],
  });
  eq('nápady: výběr (spravuje, meId)', [d.spravuje, d.meId, d.podnety.length], [true, 3, 5]);
  eq('nápady: nejžádanější nové — hlasy, při shodě novější', nejzadanejsi(d.podnety, 'nove').map(s => s.id), [3, 1]);
  eq('nápady: „vše" = živé podněty (hotové a zamítnuté se o hlasy nepřetahují)', nejzadanejsi(d.podnety, 'vse').map(s => s.id), [2, 3, 1]);
  eq('nápady: nové podněty nejstarší první', novePodnety(d.podnety).map(s => s.id), [1, 3]);
  eq('nápady: přepnutí hlasu tam a zpět', [prepniHlas(d.podnety, 2)[1].votes, prepniHlas(prepniHlas(d.podnety, 1), 1)[0].votes], [8, 4]);
  let chybaNapadu = '';
  try { vyberPodnety([]); } catch (e) { chybaNapadu = String((e as Error).message); }
  ok('nápady: nečekaná odpověď je chyba', chybaNapadu.includes('nečekaném tvaru'));

  // ---- katalog a stránky ----
  const vsechny = [...UKOLY, ...PLANOVANI, ...NAPADY];
  eq('katalog B6a: všech 9 widgetů hotových', vsechny.filter(w => w.stav !== 'hotovo').map(w => w.id), []);
  eq('katalog B6a: widgety s daty týmu chtějí oprávnění (podle lidí a splněno dnes ukoly.zobrazit_tym, plánování planovani.zobrazit, nové napady.spravovat)', [
    widget('ukoly.podle_lidi')?.opravneni.vse, widget('ukoly.splneno_dnes')?.opravneni.vse, widget('planovani.souhrn')?.opravneni.vse,
    widget('planovani.ke_schvaleni')?.opravneni.vse, widget('napady.nove')?.opravneni.vse, widget('napady.nejzadanejsi')?.opravneni.vse,
  ], [['ukoly.zobrazit_tym'], ['ukoly.zobrazit_tym'], ['planovani.zobrazit'], ['planovani.zobrazit'], ['napady.spravovat'], ['napady.pridat']]);
  eq('katalog B6a: přesun karty jen s planovani.upravit, cizí úkol v týdnu jen s ukoly.upravit',
    [widget('planovani.ke_schvaleni')?.opravneni.pole?.['akce:presunout'], widget('ukoly.tyden')?.opravneni.pole?.['akce:presunout_cizi']], ['planovani.upravit', 'ukoly.upravit']);
  const STRANKY = ['vedeni.ukoly', 'zamestnanec.ukoly', 'vedeni.planovani', 'vedeni.napady', 'zamestnanec.napady'] as const;
  eq('stránky B6a: všech pět má aktivní plochu s nástrojem', STRANKY.filter(s => !stranka(s)?.aktivni || !stranka(s)?.nastroj), []);
  ok('stránky B6a: doporučené Úkolů vedení nabízí Po termínu, Podle lidí, Splněno dnes a Týden',
    ['ukoly.po_terminu', 'ukoly.podle_lidi', 'ukoly.splneno_dnes', 'ukoly.tyden'].every(w => stranka('vedeni.ukoly')!.doporucene.includes(w)));

  const KLICE = KATALOG.map(k => k.id);
  const divak = (klic: string, typ: 'vedeni' | 'zamestnanec'): Divak => ({
    userId: 1, typ, klic, roleId: null, zdrojRole: null, jeSpravce: false,
    opravneni: new Set(klic === 'vlastnik' ? KLICE : SYSTEMOVE_ROLE.find(r => r.klic === klic)!.opravneni), tarif: 'max',
  } as Divak);
  const vidi = (sid: typeof STRANKY[number], d: Divak) => vyresRozlozeni({ stranka: stranka(sid)!, divak: d, osobni: null, vychozi: [] }).polozky.map(p => p.widget);
  eq('výchozí Nápadů vedení: vlastník vidí Nové podněty, Nejžádanější a nástroj', vidi('vedeni.napady', divak('vlastnik', 'vedeni')), ['napady.nove', 'napady.nejzadanejsi', 'nastroj']);
  eq('výchozí Nápadů vedení: skladník (jen napady.pridat) Nové podněty nevidí', vidi('vedeni.napady', divak('skladnik', 'vedeni')), ['napady.nejzadanejsi', 'nastroj']);
  eq('výchozí Úkolů zaměstnance: barista má jen nástroj', vidi('zamestnanec.ukoly', divak('barista', 'zamestnanec')), ['nastroj']);

  // ---- pojistky nad zdrojáky ----
  const SOUBORY = ['components/employer/TaskManager.tsx', 'components/employer/PlanningBoard.tsx', 'components/employee/Tasks.tsx',
    'components/SuggestionsBoard.tsx', 'components/TaskWeekBoard.tsx', 'components/TaskChecklist.tsx', 'components/kiosk/KioskTasks.tsx',
    'components/widgety/oblasti/ukoly.tsx', 'components/widgety/oblasti/planovani.tsx', 'components/widgety/oblasti/napady.tsx'];
  eq('zdrojáky B6a: žádné confirm() ani prompt()', SOUBORY.filter(f => /\b(confirm|prompt)\(/.test(kod(f))), []);
  eq('zdrojáky B6a: žádné emoji ani „↻ → 👤" místo ikony', SOUBORY.filter(f => /[\u{1F300}-\u{1FAFF}]|↻|→|✓/u.test(kod(f))), []);
  eq('zdrojáky B6a: žádné ruční okno (modal-overlay)', SOUBORY.filter(f => kod(f).includes('modal-overlay')), []);
  eq('zdrojáky B6a: stránky se kreslí jako plocha se svou stránkou', [
    kod('components/employer/TaskManager.tsx').includes('stranka="vedeni.ukoly"'),
    kod('components/employee/Tasks.tsx').includes('stranka="zamestnanec.ukoly"'),
    kod('components/employer/PlanningBoard.tsx').includes('stranka="vedeni.planovani"'),
    /zamestnanec\.napady'\s*:\s*'vedeni\.napady'/.test(kod('components/SuggestionsBoard.tsx')),
  ], [true, true, true, true]);
  // Review kola 69.
  eq('zdrojáky B6a: checklist úkolu se odškrtává jen se smiSplnit (vedení i zaměstnanec)', ['components/employer/TaskManager.tsx', 'components/employee/Tasks.tsx']
    .filter(f => !/onToggle=\{smiSplnit\((t|task)\) \?/.test(kod(f)) || !/onToggleAll=\{smiSplnit\((t|task)\) \?/.test(kod(f))), []);
  ok('zdrojáky B6a: krok checklistu má skutečnou výšku (36/44 px), ne přesahující tap-target-sm', /min-h-\[44px\]' : 'min-h-9'/.test(kod('components/TaskChecklist.tsx'))
    && !kod('components/TaskChecklist.tsx').includes('tap-target-sm') && /<TaskChecklist velky/.test(kod('components/kiosk/KioskTasks.tsx')));
  ok('zdrojáky B6a: fronta ke schválení bez primary tlačítka, Vrátit v menu řádku', !/variant="primary"/.test(kod('components/widgety/oblasti/planovani.tsx'))
    && /Vrátit do Rozpracováno/.test(kod('components/widgety/oblasti/planovani.tsx')));
  ok('zdrojáky B6a: týdenní tabule má přesun i bez tažení (tlačítko + okno s volbou dne)', /na jiný den/.test(kod('components/TaskWeekBoard.tsx')) && /<Modal\b/.test(kod('components/TaskWeekBoard.tsx')) && /title="Přesunout úkol"/.test(kod('components/TaskWeekBoard.tsx')));
  ok('API úkolů vrací completedAt (widget Splněno dnes)', /completedAt:\s*r\.completed_at/.test(kod('app/api/tasks/route.ts')));
}
