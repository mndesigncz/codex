// Poznámky k věcem (lib/poznamky.ts): validace typu a klíče entity, délka
// textu, kdo smí upravit a smazat, relativní čas, adresa a tvar odpovědi.
// K tomu pojistky nad zdrojákem: tabulka v migraci, API bere typy z téhož
// seznamu a každé oprávnění správy je v katalogu.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  TYPY_POZNAMEK, OPRAVNENI_SPRAVY_POZNAMEK, MAX_DELKA_POZNAMKY, jeTypPoznamky, klicEntity, normalizujTextPoznamky,
  smiUpravitPoznamku, smiSmazatPoznamku, relativniCas, urlPoznamek, vyberPoznamky,
  MAX_DELKA_DUVODU, normalizujDuvod, teloOznameniPodnetu, urlPoctuPoznamek, idsZPoctu, vyberPoctyPoznamek,
} from '../../lib/poznamky.ts';
import { KATALOG } from '../../lib/opravneniKatalog.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
const MIN = 60_000;
const H = 60 * MIN;
const DEN = 24 * H;

export default function ({ eq, ok }: Testy) {
  // ---- typ ----
  eq('deset typů v daném pořadí (kolo 7: + podnět; kolo 8: + uzávěrka, akce, položka menu)', [...TYPY_POZNAMEK], ['task', 'guide', 'procedure', 'recipe', 'inventory_item', 'shift', 'suggestion', 'closing', 'event', 'menu_item']);
  ok('známý typ projde', jeTypPoznamky('task') && jeTypPoznamky('recipe'));
  ok('neznámý typ, číslo ani prázdno neprojdou', !jeTypPoznamky('tasks') && !jeTypPoznamky(1) && !jeTypPoznamky('') && !jeTypPoznamky(null));

  // ---- klíč entity ----
  eq('číselný typ: číslo jako text', klicEntity('task', 5), '5');
  eq('číselný typ: řetězec s mezerami se očistí', klicEntity('guide', ' 42 '), '42');
  eq('číselný typ: nula neprojde', klicEntity('task', 0), null);
  eq('číselný typ: záporné neprojde', klicEntity('task', -3), null);
  eq('číselný typ: desetinné neprojde', klicEntity('inventory_item', '1.5'), null);
  eq('číselný typ: text neprojde', klicEntity('shift', 'abc'), null);
  eq('číselný typ: prázdno neprojde', klicEntity('procedure', ''), null);
  eq('číselný typ: undefined neprojde', klicEntity('procedure', undefined), null);
  eq('číselný typ: „007" se normalizuje na 7 (jeden klíč pro jednu věc)', klicEntity('task', '007'), '7');
  eq('receptura: product_id kasy zůstane textem', klicEntity('recipe', 'p-4f2a'), 'p-4f2a');
  eq('receptura: číselný product_id taky projde', klicEntity('recipe', '12'), '12');
  eq('receptura: prázdno neprojde', klicEntity('recipe', '  '), null);
  eq('receptura: řídicí znak neprojde', klicEntity('recipe', 'a\u0000b'), null);
  eq('receptura: 121 znaků neprojde', klicEntity('recipe', 'x'.repeat(121)), null);
  eq('receptura: 120 znaků projde', klicEntity('recipe', 'x'.repeat(120))?.length, 120);

  // ---- text ----
  eq('text se ořízne', normalizujTextPoznamky('  ahoj  '), 'ahoj');
  eq('CRLF se sjednotí na LF', normalizujTextPoznamky('a\r\nb\rc'), 'a\nb\nc');
  eq('prázdný text je null', normalizujTextPoznamky('   \n '), null);
  eq('ne-řetězec je null', normalizujTextPoznamky(42), null);
  eq('přesně 2000 znaků projde', normalizujTextPoznamky('x'.repeat(MAX_DELKA_POZNAMKY))?.length, 2000);
  eq('2001 znaků neprojde', normalizujTextPoznamky('x'.repeat(MAX_DELKA_POZNAMKY + 1)), null);
  eq('víceřádková poznámka zůstane víceřádková', normalizujTextPoznamky('řádek 1\nřádek 2'), 'řádek 1\nřádek 2');

  // ---- kdo smí ----
  ok('autor smí upravit', smiUpravitPoznamku(7, 7));
  ok('cizí neupraví', !smiUpravitPoznamku(7, 8));
  ok('NaN není nikdo', !smiUpravitPoznamku(NaN, NaN));
  const bez = new Set<string>();
  ok('autor smí smazat i bez oprávnění', smiSmazatPoznamku({ typ: 'task', autorId: 7, meId: 7, opr: bez }));
  ok('cizí bez oprávnění nesmaže', !smiSmazatPoznamku({ typ: 'task', autorId: 7, meId: 8, opr: bez }));
  ok('ukoly.mazat smaže cizí poznámku u úkolu', smiSmazatPoznamku({ typ: 'task', autorId: 7, meId: 8, opr: new Set(['ukoly.mazat']) }));
  ok('ukoly.mazat nesmaže poznámku u návodu', !smiSmazatPoznamku({ typ: 'guide', autorId: 7, meId: 8, opr: new Set(['ukoly.mazat']) }));
  ok('navody.upravit smaže poznámku u návodu', smiSmazatPoznamku({ typ: 'guide', autorId: 7, meId: 8, opr: new Set(['navody.upravit']) }));
  ok('postupy.upravit u postupu, receptury.upravit u receptury, sklad.upravit u skladu, rozvrh.upravit u směny',
    smiSmazatPoznamku({ typ: 'procedure', autorId: 1, meId: 2, opr: new Set(['postupy.upravit']) })
    && smiSmazatPoznamku({ typ: 'recipe', autorId: 1, meId: 2, opr: new Set(['receptury.upravit']) })
    && smiSmazatPoznamku({ typ: 'inventory_item', autorId: 1, meId: 2, opr: new Set(['sklad.upravit']) })
    && smiSmazatPoznamku({ typ: 'shift', autorId: 1, meId: 2, opr: new Set(['rozvrh.upravit']) }));
  ok('napady.spravovat smaže cizí poznámku u podnětu, napady.pridat ne',
    smiSmazatPoznamku({ typ: 'suggestion', autorId: 1, meId: 2, opr: new Set(['napady.spravovat']) })
    && !smiSmazatPoznamku({ typ: 'suggestion', autorId: 1, meId: 2, opr: new Set(['napady.pridat']) }));
  eq('podnět: číselný klíč', klicEntity('suggestion', '14'), '14');
  ok('„zobrazit" nestačí na smazání cizí poznámky', !smiSmazatPoznamku({ typ: 'inventory_item', autorId: 1, meId: 2, opr: new Set(['sklad.zobrazit', 'sklad.zapsat_stav']) }));
  const ids = new Set(KATALOG.map(o => o.id));
  for (const typ of TYPY_POZNAMEK) ok(`oprávnění správy „${OPRAVNENI_SPRAVY_POZNAMEK[typ]}" (${typ}) je v katalogu`, ids.has(OPRAVNENI_SPRAVY_POZNAMEK[typ]));

  // ---- relativní čas ----
  const ted = Date.parse('2026-10-12T10:00:00Z');
  eq('před 20 s = právě teď', relativniCas(ted - 20_000, ted), { druh: 'ted' });
  eq('čas v budoucnosti (hodiny serveru napřed) = právě teď', relativniCas(ted + 5 * MIN, ted), { druh: 'ted' });
  eq('před 5 minutami', relativniCas(ted - 5 * MIN, ted), { druh: 'min', n: 5 });
  eq('před 59 minutami zůstává v minutách', relativniCas(ted - 59 * MIN, ted), { druh: 'min', n: 59 });
  eq('před 2 hodinami', relativniCas(ted - 2 * H, ted), { druh: 'h', n: 2 });
  eq('před 23 h zůstává v hodinách', relativniCas(ted - 23 * H, ted), { druh: 'h', n: 23 });
  eq('před 3 dny', relativniCas(ted - 3 * DEN, ted), { druh: 'den', n: 3 });
  eq('před 7 dny je ještě „před N dny"', relativniCas(ted - 7 * DEN, ted), { druh: 'den', n: 7 });
  eq('před 8 dny už datum', relativniCas(ted - 8 * DEN, ted), { druh: 'datum' });
  eq('neplatné datum = datum (nic se nevymýšlí)', relativniCas('kdysi', ted), { druh: 'datum' });
  eq('ISO řetězec se bere stejně jako číslo', relativniCas(new Date(ted - 90 * MIN).toISOString(), ted), { druh: 'h', n: 2 });

  // ---- adresa ----
  eq('adresa seznamu', urlPoznamek('task', 5), '/api/notes?typ=task&id=5');
  eq('adresa s actingAs (tablet)', urlPoznamek('guide', 3, 16), '/api/notes?typ=guide&id=3&actingAs=16');
  eq('bez actingAs se parametr neposílá', urlPoznamek('guide', 3, null), '/api/notes?typ=guide&id=3');
  eq('product_id receptury se zakóduje', urlPoznamek('recipe', 'p 1/2'), '/api/notes?typ=recipe&id=p+1%2F2');

  // ---- tvar odpovědi ----
  const raw = [
    { id: '11', text: 'A', createdAt: '2026-10-12T08:00:00Z', updatedAt: null, autor: { id: 15, name: 'Martin', avatar: null }, moje: true, muzuSmazat: true },
    { id: 12, text: 'B', createdAt: '2026-10-11T08:00:00Z', updatedAt: '2026-10-12T08:00:00Z', autor: { id: 16, name: 'Eva', avatar: '🙂' }, moje: false, muzuSmazat: 'ne' },
    { id: 13 }, // bez textu: vynechá se
    null,
  ];
  const v = vyberPoznamky(raw);
  eq('vyberPoznamky: platné řádky, čísla jako čísla', v.map(p => [p.id, p.text, p.moje, p.muzuSmazat]), [[11, 'A', true, true], [12, 'B', false, false]]);
  eq('vyberPoznamky: autor s avatarem', v[1].autor, { id: 16, name: 'Eva', avatar: '🙂' });
  eq('vyberPoznamky: prázdné pole je prázdný seznam (fallback sond vrací [])', vyberPoznamky([]), []);
  let spadlo = false;
  try { vyberPoznamky({ error: 'x' }); } catch { spadlo = true; }
  ok('vyberPoznamky: objekt místo pole je chyba tvaru, ne prázdno', spadlo);

  // ---- podněty: důvod zamítnutí a počty (kolo 7) ----
  eq('důvod: oříznutý text', normalizujDuvod('  až po sezóně \r\n '), 'až po sezóně');
  eq('důvod: prázdný = bez důvodu (null)', normalizujDuvod('   '), null);
  eq('důvod: chybějící = null', normalizujDuvod(undefined), null);
  eq(`důvod: ${MAX_DELKA_DUVODU} znaků projde`, (normalizujDuvod('x'.repeat(MAX_DELKA_DUVODU)) as string).length, MAX_DELKA_DUVODU);
  eq(`důvod: ${MAX_DELKA_DUVODU + 1} znaků = odmítnout (false), ne uříznout`, normalizujDuvod('x'.repeat(MAX_DELKA_DUVODU + 1)), false);
  eq('důvod: číslo = false', normalizujDuvod(5), false);
  eq('oznámení bez důvodu = jen stav', teloOznameniPodnetu('Prozatím zamítnuto', null), 'Prozatím zamítnuto');
  eq('oznámení s důvodem = stav — důvod', teloOznameniPodnetu('Prozatím zamítnuto', 'Až po sezóně.'), 'Prozatím zamítnuto — Až po sezóně.');
  eq('počty: adresa se seřazenými jedinečnými id', urlPoctuPoznamek('suggestion', [12, 3, 12, -1, 0, 1.5]), '/api/notes?typ=suggestion&pocty=3%2C12');
  eq('počty: bez id žádná adresa (nic se nenačítá)', urlPoctuPoznamek('suggestion', []), null);
  eq('počty: id z parametru, nesmysly pryč', idsZPoctu('3,12, 7 ,abc,0,-2,12'), [3, 12, 7]);
  eq('počty: prázdný parametr = []', idsZPoctu(null), []);
  eq('počty: nejvýš 200 id', idsZPoctu(Array.from({ length: 300 }, (_, i) => i + 1).join(',')).length, 200);
  eq('počty: odpověď do mapy čísel', vyberPoctyPoznamek({ pocty: { 3: 2, '12': '0', x: 5, 7: -1 } }), { 3: 2, 12: 0 });
  let spadloPocty = false;
  try { vyberPoctyPoznamek([]); } catch { spadloPocty = true; }
  ok('počty: pole místo objektu je chyba tvaru', spadloPocty);

  // ---- pojistky nad zdrojákem ----
  const init = zdroj('app/api/init/route.ts');
  ok('migrace zakládá entity_notes s indexem (team_id, entity_type, entity_id)',
    /CREATE TABLE IF NOT EXISTS entity_notes/.test(init) && /entity_notes_entity ON entity_notes \(team_id, entity_type, entity_id\)/.test(init));
  ok('entity_id je TEXT (receptura z kasy má jen textové product_id)', /entity_id TEXT NOT NULL/.test(init));
  const api = zdroj('app/api/notes/route.ts');
  ok('API ověřuje typ přes jeTypPoznamky a klíč přes klicEntity', /jeTypPoznamky\(/.test(api) && /klicEntity\(/.test(api));
  ok('API píše za vybraného člověka na tabletu (resolveActingUser)', /resolveActingUser\(/.test(api));
  ok('API nepustí zápis tabletu bez vybraného člověka', /v\.tablet && v\.actingId === v\.c\.meId/.test(api));
  for (const typ of TYPY_POZNAMEK) ok(`API má větev pro typ „${typ}"`, new RegExp(`case '${typ}':`).test(api));
  ok('API: podnět jen z mého podniku a s napady.pridat nebo napady.spravovat',
    /FROM suggestions WHERE id = \$\{Number\(klic\)\} AND team_id = \$\{teamId\}/.test(api) && /opr\.has\('napady\.pridat'\) \|\| opr\.has\('napady\.spravovat'\)/.test(api));
  const napad = zdroj('app/api/suggestions/[id]/route.ts');
  ok('zamítnutí: důvod jde se stavem v jedné transakci jako poznámka podnětu a do oznámení',
    /sql\.transaction\(/.test(napad) && /'suggestion'/.test(napad) && /teloOznameniPodnetu\(/.test(napad) && /audit\(c\.teamId, c\.meId, 'napady\.zamitnuto'/.test(napad));
  const komp = zdroj('components/Poznamky.tsx');
  ok('komponenta nepoužívá confirm()', !/\bconfirm\(/.test(komp));
  ok('komponenta po zápisu obnoví sdílenou mezipaměť', /obnovDataWidgetu\(url\)/.test(komp));
  ok('komponenta přizná chybu zápisu (note-danger)', /note-danger/.test(komp));
  const smaz = zdroj('lib/smazaniUctu.ts');
  ok('smazání účtu zná entity_notes (ponechat) i smazání podniku', /entity_notes: 'ponechat'/.test(smaz) && /'entity_notes',/.test(smaz));
}
