// Body za postupy (kolo 89, balík body-D): automatické hodnocení průběhu postupu.
//
// Hlášení: zaměstnanec po dvou směnách (každou hodnotil systém sám) měl přes 250 bodů.
// Příčina: řádek, který systém k dokončenému postupu zapíše do shift_review_items,
// nesl (1) celý základ „body za postup“ — ten se ale v totalPoints() počítá ještě
// jednou za každý dokončený průběh (procedures × pt.procedure), a (2) bod za každou
// odškrtnutou položku (38 kroků zavíračky = +40). Po opravě nese řádek jen příplatek
// za úplnost (nejvýš „body za postup“, úměrně hotovým krokům) a srážky za kroky.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { scoreRun } from '../../lib/procedureScoring.ts';
import { DEFAULT_POINTS } from '../../lib/rewardLevels.ts';

const zdroj = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const rozsah = (n: number) => Array.from({ length: n }, (_, i) => i);
// Kroky jako v reálném podniku: vlastní srážka 0 („penalty": 0), dva klíčové kroky.
const kroky = (n: number, klicove = 0, penalty: number | null = 0) =>
  Array.from({ length: n }, (_, i) => ({ text: `Krok ${i + 1}`, ...(penalty == null ? {} : { penalty }), ...(i < klicove ? { weight: 'key' } : {}) }));

export default function ({ eq, ok }: Testy) {
  const zaklad = DEFAULT_POINTS.procedure; // 10
  // Celková hodnota jednoho průběhu tak, jak ji sečte totalPoints(): základ za dokončený průběh + řádek.
  const zaPrubeh = (body: number) => zaklad + body;

  // ---- reprodukce hlášení: zavíračka 38 kroků (2 klíčové), vše hotovo ----
  const zavir = scoreRun(kroky(38, 2), rozsah(38), [], {}, zaklad);
  ok('zavíračka 38/38: řádek nenese základ ani bod za každou položku (dřív +50)', zavir.points <= zaklad);
  eq('zavíračka 38/38: příplatek za úplnost = body za postup', zavir.points, 10);
  eq('zavíračka 38/38: celkem za průběh 20 (dřív 10 + 50 = 60)', zaPrubeh(zavir.points), 20);
  eq('poznámka řádku zůstává ve stejném tvaru (čte ji i oprava dat)', zavir.summary, 'auto: 38/38 kroků');

  // ---- délka seznamu nerozhoduje: 13 kroků dá stejně jako 38 ----
  const otev = scoreRun(kroky(13), rozsah(13), [], {}, zaklad);
  eq('otevíračka 13/13: příplatek 10 (dřív 23)', otev.points, 10);

  // ---- omluvené přeskočení nesnižuje příplatek ----
  const omluva = scoreRun(kroky(38, 2), rozsah(38).filter(i => i !== 28), [28], { '28': { reason: 'not_needed' } }, zaklad);
  eq('37/38 s 1 omluveným přeskočením: plný příplatek 10 (dřív 49)', [omluva.points, omluva.excusedSkips, omluva.flagged], [10, 1, false]);

  // ---- prázdné dokončení: nic odškrtnuto, srážky 0 → řádek 0 (dřív +10 navíc k základu) ----
  const prazdny = scoreRun(kroky(13), [], [], {}, zaklad);
  eq('0/13 kroků, srážky 0: řádek 0 (dřív 10)', [prazdny.points, prazdny.missed], [0, 13]);
  eq('0/13: poznámka beze změny', prazdny.summary, 'auto: 0/13 kroků, 13× nedokončeno');

  // ---- výchozí srážky (bez vlastní penalty): běžný −1, klíčový −3, příplatek úměrně ----
  const castecne = scoreRun(kroky(13, 0, null), rozsah(12), [], {}, zaklad);
  eq('12/13, 1 běžný krok chybí: round(10 × 12/13) − 1 = 8', castecne.points, 8);
  const klicChybi = scoreRun(kroky(10, 1, null), rozsah(10).slice(1), [], {}, zaklad);
  // plus: 1 klíčový (2) + 9 běžných (1) = 11; hotovo 9 → round(10 × 9/11) = 8; srážka klíčový −3
  eq('chybí klíčový krok: 8 − 3 = 5 a vlajka', [klicChybi.points, klicChybi.flagged], [5, true]);
  const bezOmluvy = scoreRun(kroky(4, 0, null), [0, 1, 2], [3], { '3': { reason: 'no_time' } }, zaklad);
  eq('přeskočeno bez omluvy: round(10 × 3/4) − 1 = 7 a vlajka', [bezOmluvy.points, bezOmluvy.unexcusedSkips, bezOmluvy.flagged], [7, 1, true]);
  eq('samé drobné kroky (plus 0): žádný příplatek, žádné dělení nulou', scoreRun([{ text: 'a', weight: 'minor' }], [0], [], {}, zaklad).points, 0);
  eq('body za postup 0: žádný příplatek', scoreRun(kroky(5), rozsah(5), [], {}, 0).points, 0);
  eq('prázdný postup bez kroků: 0', scoreRun([], [], [], {}, zaklad).points, 0);

  // ---- rozpis z hlášení: 5 průběhů, 7 úkolů, 2 uzávěrky, 1 uznaný zápis navíc (10 b.) ----
  const radky = [
    scoreRun(kroky(22), [], [], {}, zaklad),                                          // příprava dýmky 0/22
    otev,                                                                               // otevíračka 13/13
    zavir,                                                                              // zavíračka 38/38
    prazdny,                                                                            // otevíračka 0/13
    omluva,                                                                             // zavíračka 37/38
  ].map(r => r.points);
  eq('rozpis: řádky k postupům 0+10+10+0+10 (dřív 10+23+50+10+49 = 142)', radky, [0, 10, 10, 0, 10]);
  const celkem = 7 * DEFAULT_POINTS.task + 5 * zaklad + 2 * DEFAULT_POINTS.closing + radky.reduce((a, b) => a + b, 0) + 10;
  eq('rozpis: celkem 155 místo 267', celkem, 155);

  // ---- hlídání napojení: základ se počítá jen v totalPoints, route mu dává strop bonusu ----
  const zustatek = zdroj('lib/pointsBalance.ts');
  ok('totalPoints počítá základ za každý dokončený průběh (proto ho řádek nesmí nést)', /b\.procedures \* pt\.procedure/.test(zustatek) && /\+ b\.itemPoints/.test(zustatek));
  const hodnoceni = zdroj('lib/procedureScoring.ts');
  ok('scoreRun nezačíná základem (let points = basePoints)', !/let points = basePoints/.test(hodnoceni));
  const route = zdroj('app/api/procedures/runs/route.ts');
  ok('dokončení průběhu: scoreRun dostává body za postup jako strop bonusu', /scoreRun\(proc\?\.items, checked, skipped, skipReasons, cfg\.procedure\)/.test(route));
  ok('dokončení průběhu: zápis jen jednou na průběh (ON CONFLICT DO NOTHING)', /ON CONFLICT \(employee_id, work_date, kind, ref_id\) DO NOTHING/.test(route));
  ok('detail průběhu neukazuje „+1“ u každého kroku', !/stepPlus/.test(zdroj('components/procedures/DetailPrubehu.tsx')));
}
