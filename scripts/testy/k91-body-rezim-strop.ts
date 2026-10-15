// Denní strop automatických bodů a přednost ručního hodnocení (kolo 91, doplnění Martina):
// „automaticky počítat body jen pokud to neudělá vedení manuálně; člověk by měl za den
// dostat do 30 bodů max.“ Strop se uplatní při počítání zůstatku na jednom místě
// (lib/pointsBalance → lib/bodyDenDb), data se nemažou; srážky platí vždy; Navíc,
// pochvaly, tresty a ruční body vedení do stropu nepatří.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { ucinnyDen, stropPlati, rozdelRadek, hodnoceniNahrazuje } from '../../lib/bodyRezim.ts';

const zdroj = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

export default function ({ eq, ok }: Testy) {
  const n = { denniStrop: 30, stropOd: null as string | null };
  const den = (plus: number, minus = 0, nahrazeno = false) => ({ den: '2026-10-20', plus, minus, nahrazeno });

  // ---- strop 30 ----
  eq('42 b za den → 30 (strop), nasbíral 42', ucinnyDen(den(42), n), { efektivni: 30, nasbirano: 42, uprava: -12, zastropovano: true });
  eq('pod stropem beze změny', ucinnyDen(den(25), n), { efektivni: 25, nasbirano: 25, uprava: 0, zastropovano: false });
  eq('přesně 30 = beze změny', ucinnyDen(den(30), n).uprava, 0);

  // ---- srážky platí vždy, i přes strop ----
  eq('42 plus a −5 srážka → 30 − 5 = 25 (srážka se „neschová“ v přebytku)', ucinnyDen(den(42, -5), n).efektivni, 25);
  eq('den jen se srážkami → záporný den zůstává', ucinnyDen(den(0, -7), n).efektivni, -7);
  eq('srážková část řádku: řádek +7 se srážkou −3 = plus 10, minus −3', rozdelRadek(7, -3), { plus: 10, minus: -3 });
  eq('starý řádek bez srážky: podle znaménka', [rozdelRadek(8, null), rozdelRadek(-4, null)], [{ plus: 8, minus: 0 }, { plus: 0, minus: -4 }]);

  // ---- kdy strop platí ----
  ok('strop 0 = bez stropu', !stropPlati('2026-10-20', { denniStrop: 0, stropOd: null }));
  ok('den před nasazením stropu se nestropuje (historie beze změny)', !stropPlati('2026-10-01', { denniStrop: 30, stropOd: '2026-10-16' }));
  ok('den od nasazení se stropuje', stropPlati('2026-10-16', { denniStrop: 30, stropOd: '2026-10-16' }));
  ok('„zpětně“ (stropOd null) platí odjakživa', stropPlati('2020-01-01', n));
  ok('řádek bez dne (stará data) se nestropuje', !stropPlati(null, n));
  eq('před nasazením 42 zůstává 42', ucinnyDen({ den: '2026-10-01', plus: 42, minus: 0, nahrazeno: false }, { denniStrop: 30, stropOd: '2026-10-16' }).efektivni, 42);

  // ---- ruční hodnocení nahrazuje automatické ----
  eq('ruční hodnocení dne nahradí všechny automatické body dne (i srážky)', ucinnyDen(den(42, -5, true), n), { efektivni: 0, nasbirano: 37, uprava: -37, zastropovano: false });
  ok('nahrazuje jen se zvolením a s body nebo hvězdami', hodnoceniNahrazuje({ nahradit_auto: true, points: 16, rating: 4 }));
  ok('jen poznámka / vlajka bez bodů a hvězd nenahrazuje', !hodnoceniNahrazuje({ nahradit_auto: true, points: 0, rating: 0 }));
  ok('starší hodnocení (nahradit_auto NULL) se přičítá jako dřív', !hodnoceniNahrazuje({ nahradit_auto: null, points: 20, rating: 5 }));
  ok('vedení zvolilo „přičíst“', !hodnoceniNahrazuje({ nahradit_auto: false, points: 20, rating: 5 }));

  // ---- jedno místo: zůstatek, žebříček, výdělek ----
  const zustatek = zdroj('lib/pointsBalance.ts');
  ok('totalPoints přičítá denní opravu (strop + ruční hodnocení)', /\+ \(b\.dayAdjust \?\? 0\)/.test(zustatek));
  ok('breakdownFor i breakdownForTeam počítají denní opravu stejně', (zustatek.match(/denniUpravy\(teamId, /g) ?? []).length === 2);
  const dny = zdroj('lib/bodyDenDb.ts');
  const dotaz = dny.slice(dny.indexOf('WITH prispevky'), dny.indexOf('SELECT p.uid, p.den'));
  ok('Navíc, pochvaly a tresty (point_awards) do stropu nepatří', !/point_awards/.test(dotaz));
  ok('ruční řádky vedení do stropu nepatří (jen created_by NULL a ne rucne)', /created_by IS NULL AND COALESCE\(rucne, FALSE\) = FALSE/.test(dotaz));
  ok('odečty za odměny (redemption) do stropu nepatří', /kind IN \('task', 'procedure', 'closing'\)/.test(dotaz));
  ok('ruční body z hodnocení směny (points) do stropu nepatří — jen auto_points', /GREATEST\(COALESCE\(auto_points, 0\), 0\)/.test(dotaz) && !/SUM\(points\)/.test(dotaz));
  ok('ruční hodnocení nahrazuje jen s nahradit_auto a body/hvězdami (jako hodnoceniNahrazuje)', /nahradit_auto = TRUE\s+AND \(COALESCE\(points, 0\) <> 0 OR COALESCE\(rating, 0\) > 0\)/.test(dny));
  ok('výhled v uzávěrce počítá se stropem', /ucinnyDen\(\{ \.\.\.d, plus: d\.plus \+ closingPts \}, n\)/.test(zdroj('lib/mzdaSmeny.ts')));
  const hodnoceni = zdroj('app/api/shift-reviews/route.ts');
  ok('hodnocení směny ukládá „nahradit automatické“', /nahradit_auto = \$\{nahraditAuto\}/.test(hodnoceni));
  ok('body k položce od vedení = ruční řádek (rucne)', /const rucne = b\.points !== undefined;/.test(hodnoceni));
}
