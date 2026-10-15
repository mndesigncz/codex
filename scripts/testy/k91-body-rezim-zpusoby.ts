// Způsob počítání bodů (kolo 91, balík body-R): „Za každý krok“, „Za celek“ a výchozí
// „Kombinace“, která musí dát přesně totéž co dnešní hybrid (k89) — nasazení nikomu
// nezmění body. Prázdné dokončení = 0 ve všech způsobech.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { scoreRun } from '../../lib/procedureScoring.ts';
import {
  bodyPostupu, bodyUkolu, bodyUzaverky, nastaveniRezimu, normalizujPrepis, ucinnePravidlo, doPointsConfig,
  povinneZPoznamky, VYCHOZI_PRAVIDLO, VYCHOZI_STROP, VYCHOZI_STROP_OD, type PravidloRezimu,
} from '../../lib/bodyRezim.ts';
import { parseStep, serializeStep, krokBody } from '../../lib/steps.ts';

const zdroj = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const rozsah = (n: number) => Array.from({ length: n }, (_, i) => i);
const kroky = (n: number, klicove = 0) => Array.from({ length: n }, (_, i) => ({ text: `Krok ${i + 1}`, ...(i < klicove ? { weight: 'key' } : {}) }));

export default function ({ eq, ok }: Testy) {
  const Z = 10; // body za postup (sazebník podniku)
  const pr = (p: Partial<PravidloRezimu>, prepis: unknown = null, zaklad = Z) => ucinnePravidlo({ ...VYCHOZI_PRAVIDLO, ...p }, normalizujPrepis(prepis), zaklad);

  // ---- výchozí nastavení: kombinace, strop 30 od dne nasazení ----
  const n = nastaveniRezimu({});
  eq('výchozí: všechny druhy „kombinace“ bez bonusu', [n.postupy.rezim, n.ukoly.rezim, n.uzaverky.rezim, n.postupy.bonus], ['kombinace', 'kombinace', 'kombinace', false]);
  eq('výchozí denní strop 30', n.denniStrop, VYCHOZI_STROP);
  eq('strop bez uloženého data platí od nasazení (historie beze změny)', n.stropOd, VYCHOZI_STROP_OD);
  eq('„zpětně“ uloží stropOd = null (odjakživa)', nastaveniRezimu({ denniStropOd: null }).stropOd, null);
  eq('zápis do points_config: tři klíče vedle sazebníku', Object.keys(doPointsConfig({ ...n, stropOd: null })), ['rezim', 'denniStrop', 'denniStropOd']);
  eq('nesmysl v nastavení = výchozí', nastaveniRezimu({ rezim: { postupy: { rezim: 'xx', zaPolozku: -3 } }, denniStrop: 'a' }).postupy, VYCHOZI_PRAVIDLO);

  // ---- kombinace = dnešní hybrid beze změny (řádek i poznámka) ----
  const pripady: [string, unknown[], number[], number[], Record<string, { reason: string }>][] = [
    ['38/38 se 2 klíčovými', kroky(38, 2), rozsah(38), [], {}],
    ['12/13', kroky(13), rozsah(12), [], {}],
    ['chybí klíčový', kroky(10, 1), rozsah(10).slice(1), [], {}],
    ['přeskočeno bez omluvy', kroky(4), [0, 1, 2], [3], { '3': { reason: 'no_time' } }],
    ['omluvené přeskočení', kroky(5), [0, 1, 2, 3], [4], { '4': { reason: 'not_needed' } }],
    ['prázdný 0/13', kroky(13), [], [], {}],
    ['postup bez kroků', [], [], [], {}],
  ];
  for (const [nazev, items, checked, skipped, duvody] of pripady) {
    const stary = scoreRun(items, checked, skipped, duvody, Z);
    const novy = bodyPostupu(items, checked, skipped, duvody, pr({}), Z);
    eq(`kombinace = k89 (${nazev}): řádek, poznámka, vlajka`, [novy.radek, novy.summary, novy.flagged], [stary.points, stary.summary, stary.flagged]);
  }

  // ---- „Za každý krok“: splněný krok přidá, nesplněný neubere ----
  const k1 = bodyPostupu(kroky(10, 2), rozsah(8), [], {}, pr({ rezim: 'kroky' }), Z);
  // hotovo: 2 klíčové (+2) + 6 běžných (+1) = 10; chybí 2 běžné → nic
  eq('kroky: 2 klíčové + 6 běžných = 10 b, srážka 0', [k1.body, k1.srazka], [10, 0]);
  eq('kroky: řádek = body − započtený základ', k1.radek, 0);
  const k2 = bodyPostupu(kroky(10, 2), rozsah(8), [], {}, pr({ rezim: 'kroky', bonus: true }), Z);
  eq('kroky + bonus za dokončení celku: +základ', k2.body, 20);
  const vlastni = [{ text: 'a', points: 5 }, { text: 'b', weight: 'key' }, { text: 'c', weight: 'minor' }];
  eq('kroky: vlastní body kroku mají přednost před váhou', bodyPostupu(vlastni, [0, 1, 2], [], {}, pr({ rezim: 'kroky' }), Z).body, 5 + 2 + 0);
  eq('kroky: nedodělaný krok nic neubere ani s vlastní srážkou', bodyPostupu([{ text: 'a', penalty: 9 }, { text: 'b' }], [1], [], {}, pr({ rezim: 'kroky' }), Z).body, 1);

  // ---- „Za celek“: základ, kroky jen záporné ----
  const c1 = bodyPostupu(kroky(10, 1), rozsah(10).slice(1), [], {}, pr({ rezim: 'celek' }), Z);
  eq('celek: chybí klíčový krok → 10 − 3 = 7, srážka −3', [c1.body, c1.srazka, c1.flagged], [7, -3, true]);
  eq('celek: vše hotovo = přesně základ', bodyPostupu(kroky(6), rozsah(6), [], {}, pr({ rezim: 'celek' }), Z).body, Z);
  eq('celek: omluvené přeskočení nic nestojí', bodyPostupu(kroky(3), [0, 1], [2], { '2': { reason: 'missing' } }, pr({ rezim: 'celek' }), Z).body, Z);
  ok('celek: kroky nikdy nepřidají nad základ', bodyPostupu(kroky(20, 5), rozsah(20), [], {}, pr({ rezim: 'celek' }), Z).body <= Z);
  eq('celek s vlastním základem postupu 25: řádek nese rozdíl proti sazebníku', bodyPostupu(kroky(4), rozsah(4), [], {}, pr({ rezim: 'celek' }, { zaklad: 25 }), Z).radek, 15);

  // ---- prázdný průběh = 0 ve všech způsobech (k89) ----
  for (const rezim of ['kombinace', 'kroky', 'celek'] as const) {
    const v = bodyPostupu(kroky(13, 2), [], [], {}, pr({ rezim, bonus: true }), Z);
    eq(`prázdné dokončení (${rezim}): 0 bodů, řádek 0, vlajka`, [v.body, v.radek, v.srazka, v.flagged], [0, 0, 0, true]);
  }

  // ---- přepsání u položky ----
  eq('přepsání: rezim u položky má přednost, ostatní dědí', pr({ rezim: 'celek' }, { rezim: 'kroky' }).rezim, 'kroky');
  eq('přepsání bez rezimu: dědí z podniku', [pr({ rezim: 'celek' }, { zaklad: 4 }).rezim, pr({ rezim: 'celek' }, { zaklad: 4 }).dedi], ['celek', true]);
  eq('prázdné přepsání = null (podle podniku)', normalizujPrepis({ rezim: 'nic', zaklad: '' }), null);

  // ---- úkoly: checklist a vlastní body ----
  const T = 5;
  const cl = [{ text: 'a', done: true }, { text: 'b', done: true }, { text: 'c', done: false }];
  eq('úkol, kombinace: jen základ (checklist se nepočítá, jako dřív)', bodyUkolu(cl, pr({}, null, T), T), { body: 5, radek: 0, srazka: 0, flagged: false, summary: 'auto: 2/3 položek' });
  eq('úkol, kroky: 2 položky × 1 b', bodyUkolu(cl, pr({ rezim: 'kroky' }, null, T), T).body, 2);
  eq('úkol, kroky s bonusem a 3 b za položku', bodyUkolu(cl, pr({ rezim: 'kroky', bonus: true, zaPolozku: 3 }, null, T), T).body, 6 + 5);
  const uc = bodyUkolu(cl, pr({ rezim: 'celek', srazka: 2 }, null, T), T);
  eq('úkol, celek: 5 − 2 za nesplněnou položku', [uc.body, uc.srazka, uc.radek], [3, -2, -2]);
  eq('úkol bez checklistu: vlastní počet bodů (12) → řádek +7 k základu 5', bodyUkolu([], pr({ rezim: 'kroky' }, { zaklad: 12 }, T), T), { body: 12, radek: 7, srazka: 0, flagged: false, summary: 'auto: 0/0 položek' });

  // ---- uzávěrky: povinné věci dne ----
  const U = 15;
  eq('uzávěrka, kombinace: jen základ', bodyUzaverky(2, 4, pr({}, null, U), U).body, 15);
  eq('uzávěrka, celek: 15 − 2 nesplněné povinné', bodyUzaverky(2, 4, pr({ rezim: 'celek' }, null, U), U).body, 13);
  eq('uzávěrka, kroky: 2 povinné × 1 b', bodyUzaverky(2, 4, pr({ rezim: 'kroky' }, null, U), U).body, 2);
  eq('uzávěrka: snímek povinných v poznámce se dá přečíst zpátky', povinneZPoznamky(bodyUzaverky(3, 4, pr({}, null, U), U).summary), { hotovo: 3, celkem: 4 });

  // ---- vlastní body kroku v datech postupu ----
  eq('krok s vlastními body přežije uložení', serializeStep(parseStep({ text: 'x', points: 4 })), { text: 'x', points: 4 });
  eq('krok bez vlastních bodů zůstane textem', serializeStep(parseStep('x')), 'x');
  eq('krokBody: váha bez vlastních bodů (klíčový 2)', krokBody(parseStep({ text: 'x', weight: 'key' })), 2);

  // ---- napojení ----
  ok('dokončení průběhu zapisuje řádek se srážkou (denní strop ji odečte vždy)', /points, srazka, note, flagged, created_by/.test(zdroj('app/api/procedures/runs/route.ts')));
  ok('úkol: splnění zapíše automatický řádek, znovuotevření ho smaže', /bodyZaSplnenyUkol\(/.test(zdroj('app/api/tasks/route.ts')) && /smazAutoRadekUkolu\(/.test(zdroj('app/api/tasks/route.ts')));
  ok('uzávěrka: body podle povinných věcí dne', /bodyZaUzaverku\(c\.teamId, actorId/.test(zdroj('app/api/closings/route.ts')));
  ok('automatický řádek úkolu/uzávěrky nepřepíše ruční úpravu vedení', /WHERE shift_review_items\.created_by IS NULL AND COALESCE\(shift_review_items\.rucne, FALSE\) = FALSE/.test(zdroj('lib/bodyZapisDb.ts')));
}
