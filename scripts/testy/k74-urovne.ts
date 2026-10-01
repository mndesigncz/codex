// Kolo 74 — úrovně podle útraty a slevové skupiny s vlastní slevou.
//
// Čisté funkce: tierFor / tierForMember / tierThresholds / tierRulesFromProfile (lib/clientSlots.ts),
// efektivniSleva (lib/slevy.ts) a celaUtrata (lib/clientSlots.ts). Hlídá hlavně to, že výchozí
// režim (návštěvy) zůstal přesně jak byl, a že sleva se nikdy nesčítá.

import type { Testy } from './_testy.ts';
import { tierFor, tierForMember, tierThresholds, tierRulesFromProfile, tierBy, celaUtrata, MAX_UTRATA } from '../../lib/clientSlots.ts';
import { efektivniSleva } from '../../lib/slevy.ts';

export default function ({ eq, ok }: Testy) {
  const V = { silverAt: 10, goldAt: 25, platinumAt: 60, memberDiscount: 0, silverDiscount: 5, goldDiscount: 10, platinumDiscount: 15 };
  const S = { ...V, tierBy: 'spend', silverSpend: 2000, goldSpend: 5000, platinumSpend: 20000 };

  // ---- výchozí režim beze změny ----
  eq('režim: bez pravidel jsou návštěvy', tierBy(null), 'visits');
  eq('režim: neznámá hodnota jsou návštěvy', tierBy({ tierBy: 'xyz' }), 'visits');
  eq('návštěvy: 9 = člen', tierFor(9, V).id, 'bronze');
  eq('návštěvy: 10 = stříbro', tierFor(10, V).id, 'silver');
  eq('návštěvy: 25 = zlato', tierFor(25, V).id, 'gold');
  eq('návštěvy: 60 = platina', tierFor(60, V).id, 'platinum');
  eq('návštěvy: jednotka', tierFor(1, V).unit, 'visits');
  eq('návštěvy: tierBy visits dává totéž co bez něj', tierFor(30, { ...V, tierBy: 'visits' }), tierFor(30, V));
  eq('návštěvy: prahy útraty se v režimu návštěv ignorují', tierFor(3, { ...V, silverSpend: 1, goldSpend: 2 }).id, 'bronze');
  eq('návštěvy: výchozí prahy 10 a 25', [tierFor(9).id, tierFor(10).id, tierFor(25).id], ['bronze', 'silver', 'gold']);

  // ---- režim útraty ----
  eq('útrata: 0 = člen', tierFor(0, S).id, 'bronze');
  eq('útrata: těsně pod stříbrem', tierFor(1999, S).id, 'bronze');
  eq('útrata: přesně na prahu stříbra', tierFor(2000, S).id, 'silver');
  eq('útrata: těsně pod zlatem', tierFor(4999, S).id, 'silver');
  eq('útrata: přesně na prahu zlata', tierFor(5000, S).id, 'gold');
  eq('útrata: přesně na prahu platiny', tierFor(20000, S).id, 'platinum');
  eq('útrata: nad platinou zůstává platina', tierFor(9_999_999, S).id, 'platinum');
  eq('útrata: jednotka', tierFor(1, S).unit, 'spend');
  eq('útrata: sleva zlata', tierFor(6000, S).discount, 10);
  eq('útrata: do další úrovně chybí v útratě', tierFor(1200, S).nextAt, 2000);
  eq('útrata: název další úrovně', tierFor(1200, S).nextLabel, 'Stříbrný host');
  eq('útrata: platina nemá další', tierFor(30000, S).nextAt, null);
  eq('útrata: záporná a nesmyslná hodnota je nula', [tierFor(-5, S).id, tierFor(NaN, S).id], ['bronze', 'bronze']);

  // ---- nulové a špatné prahy ----
  eq('nulové prahy útraty: stříbro i zlato dostanou výchozí', [tierThresholds({ tierBy: 'spend' }).silver, tierThresholds({ tierBy: 'spend' }).gold], [5000, 15000]);
  eq('nulová platina je vypnutá (útrata)', tierThresholds({ ...S, platinumSpend: 0 }).platinum, 0);
  eq('vypnutá platina: nejvyšší je zlato s nextAt null', [tierFor(9_000_000, { ...S, platinumSpend: 0 }).id, tierFor(9_000_000, { ...S, platinumSpend: 0 }).nextAt], ['gold', null]);
  eq('zlato nad stříbrem i při špatném zadání', tierThresholds({ tierBy: 'spend', silverSpend: 3000, goldSpend: 1000 }).gold, 3001);
  eq('platina nad zlatem i při špatném zadání', tierThresholds({ ...S, platinumSpend: 100 }).platinum, 5001);
  eq('záporný práh útraty se zvedne na 1', tierThresholds({ tierBy: 'spend', silverSpend: -50 }).silver, 1);
  eq('stříbro aspoň 1 (návštěvy)', tierThresholds({ silverAt: -4 }).silver, 1);

  // ---- člen: režim vybírá hodnotu ----
  eq('člen: návštěvy rozhodují v režimu visits', tierForMember({ visits: 30, spend: 0 }, V).id, 'gold');
  eq('člen: útrata se v režimu visits nepočítá', tierForMember({ visits: 0, spend: 999999 }, V).id, 'bronze');
  eq('člen: útrata rozhoduje v režimu spend', tierForMember({ visits: 0, spend: 6000 }, S).id, 'gold');
  eq('člen: návštěvy se v režimu spend nepočítají', tierForMember({ visits: 500, spend: 100 }, S).id, 'bronze');
  eq('člen: texty z databáze (řetězce, null)', tierForMember({ visits: '12', spend: null }, V).id, 'silver');

  // ---- řádek profilu z databáze ----
  const radek = { silver_at: 10, gold_at: 25, platinum_at: 0, member_discount: 0, silver_discount: 5, gold_discount: 10, platinum_discount: 0,
    tier_by: 'spend', silver_spend: 3000, gold_spend: 8000, platinum_spend: 0 };
  const pravidla = tierRulesFromProfile(radek);
  eq('profil: režim spend', pravidla.tierBy, 'spend');
  eq('profil: úroveň podle útraty z řádku', tierForMember({ visits: 1, spend: 3500 }, pravidla).id, 'silver');
  eq('profil před migrací (bez nových sloupců) = návštěvy', tierRulesFromProfile({ silver_at: 10, gold_at: 25 }).tierBy, 'visits');
  eq('profil před migrací dává dnešní úroveň', tierForMember({ visits: 25, spend: 0 }, tierRulesFromProfile({ silver_at: 10, gold_at: 25 })).id, 'gold');
  eq('profil: žádný řádek nespadne', tierRulesFromProfile(undefined).tierBy, 'visits');

  // ---- efektivní sleva: nejvyšší, nikdy součet ----
  const zlato = { discount: 10, label: 'Zlatý host' };
  eq('sleva: jen úroveň', efektivniSleva({ uroven: zlato }), { pct: 10, zdroj: 'uroven', nazev: 'Zlatý host' });
  eq('sleva: skupina přebije nižší úroveň', efektivniSleva({ uroven: zlato, skupiny: [{ name: 'Štamgasti', discount: 15 }] }), { pct: 15, zdroj: 'skupina', nazev: 'Štamgasti' });
  eq('sleva: nižší skupina úroveň nepřebije', efektivniSleva({ uroven: zlato, skupiny: [{ name: 'Firma', discount: 5 }] }).zdroj, 'uroven');
  eq('sleva: víc skupin bere nejvyšší, ne součet', efektivniSleva({ skupiny: [{ name: 'A', discount: 10 }, { name: 'B', discount: 20 }, { name: 'C', discount: 15 }] }).pct, 20);
  eq('sleva: úroveň + skupiny nikdy nesčítá', efektivniSleva({ uroven: { discount: 10, label: 'Z' }, skupiny: [{ name: 'A', discount: 10 }, { name: 'B', discount: 10 }] }).pct, 10);
  eq('sleva: při shodě vyhrává úroveň', efektivniSleva({ uroven: zlato, skupiny: [{ name: 'Štamgasti', discount: 10 }] }).zdroj, 'uroven');
  eq('sleva: bez čehokoli je nula bez zdroje', efektivniSleva({}), { pct: 0, zdroj: null, nazev: null });
  eq('sleva: null vstupy', efektivniSleva({ uroven: null, skupiny: null }).pct, 0);
  eq('sleva: nulová úroveň a skupina 0 % = žádná sleva', efektivniSleva({ uroven: { discount: 0, label: 'Člen' }, skupiny: [{ name: 'X', discount: 0 }] }).zdroj, null);
  eq('sleva: jen skupina', efektivniSleva({ skupiny: [{ name: 'VIP', discount: 100 }] }).pct, 100);
  eq('sleva: nad 100 se ořízne, záporná je nula', [efektivniSleva({ skupiny: [{ name: 'A', discount: 250 }] }).pct, efektivniSleva({ skupiny: [{ name: 'A', discount: -5 }] }).pct], [100, 0]);
  eq('sleva: nesmyslné hodnoty (NaN, text) jsou nula', efektivniSleva({ skupiny: [{ name: 'A', discount: Number('abc') }] }).pct, 0);
  eq('sleva: zaokrouhlení na celá procenta', efektivniSleva({ skupiny: [{ name: 'A', discount: 12.6 }] }).pct, 13);
  eq('sleva z úrovně podle útraty + skupina', efektivniSleva({ uroven: tierFor(6000, S), skupiny: [{ name: 'Štamgasti', discount: 12 }] }), { pct: 12, zdroj: 'skupina', nazev: 'Štamgasti' });

  // ---- útrata do databáze ----
  eq('útrata: celé číslo', celaUtrata(249.6), 250);
  eq('útrata: záporná je nula', celaUtrata(-40), 0);
  eq('útrata: nesmysl je nula', [celaUtrata('abc'), celaUtrata(undefined), celaUtrata(NaN)], [0, 0, 0]);
  eq('útrata: text s číslem', celaUtrata('1200'), 1200);
  ok('útrata: překlep o tři nuly se ořízne', celaUtrata(9e15) === MAX_UTRATA);
  ok('útrata: strop se vejde do INTEGER i při sčítání', MAX_UTRATA * 100 < 2_147_483_647 * 100 && MAX_UTRATA < 2_147_483_647);
}
