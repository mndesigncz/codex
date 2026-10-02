// Věrnost: body, úrovně a cashback — úplnost (kolo 80, okruh B).
//
// Čistá logika (lib/bodyPravidla.ts): výpočet odměny (minimum, vyloučení, zaokrouhlení, násobič,
// stropy), validace pravidel, degradace úrovně, propadání kreditu, verze před/po, CSV deníku,
// storno. Plus hlídání napojení: že připsání jde jedním místem, že storno visí na synchronizaci
// účtenek, že DDL v init sedí s lazy příkazy a že oprava deníku (GREATEST) nezmizela.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  vypocitejOdmenu, pravidlaZProfilu, normalizujRozsirena, zkontrolujPrahy, skutecnaZmena, stupnuDolu, snizUroven, dniBezNavstevy, kdyKlesne,
  oznameniUrovne, rozlisDenikKreditu, porovnejPravidla, popisZmen, snimekPravidel, denikCsv, csvCas, zdrojBodu, jeVylouceno, vyloucenaCastka,
  castKreditem, castStorna, nasobicUrovne, uvitaciBody, shrnutiPravidel, VYCHOZI_PRAVIDLA, KLICE_ROZSIRENE, KLICE_VERZI, type PravidlaBodu,
} from '../../lib/bodyPravidla.ts';
import { tierForMember } from '../../lib/clientSlots.ts';
import { planPropadani } from '../../lib/propadaniBodu.ts';

const zdroj = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const R = (o: Partial<PravidlaBodu> = {}): PravidlaBodu => ({ ...VYCHOZI_PRAVIDLA, ...o });
const DEN = 86400000;

export default function ({ eq, ok }: Testy) {
  // ---- B11 + B1: zaokrouhlení, minimum, stropy ------------------------------------------
  eq('odměna: výchozí = celé stovky (jako dřív)', vypocitejOdmenu({ castka: 450, uroven: 'bronze' }, R()).body, 20);
  eq('odměna: celé stovky, 99 Kč nedá nic', vypocitejOdmenu({ castka: 99, uroven: 'bronze' }, R()).body, 0);
  eq('zaokrouhlení: přesně dolů (250 Kč, 5 b./100)', vypocitejOdmenu({ castka: 250, uroven: 'bronze' }, R({ zaokrouhleni: 'floor' })).body, 12);
  eq('zaokrouhlení: na nejbližší', vypocitejOdmenu({ castka: 250, uroven: 'bronze' }, R({ zaokrouhleni: 'round' })).body, 13);
  eq('zaokrouhlení: nahoru', vypocitejOdmenu({ castka: 251, uroven: 'bronze' }, R({ zaokrouhleni: 'ceil' })).body, 13);
  eq('zaokrouhlení: plovoucí čárka nepřidá bod navíc (0,1 × 3)', vypocitejOdmenu({ castka: 30, uroven: 'bronze' }, R({ zaokrouhleni: 'ceil', pointsPer100: 1 })).body, 1);

  const c1 = vypocitejOdmenu({ castka: 250, uroven: 'bronze', zbytek: 0 }, R({ zaokrouhleni: 'carry' }));
  eq('přenos zbytku: z 250 jsou body za 200 a zbytek 50', [c1.body, c1.zbytekNovy], [10, 50]);
  const c2 = vypocitejOdmenu({ castka: 250, uroven: 'bronze', zbytek: c1.zbytekNovy }, R({ zaokrouhleni: 'carry' }));
  eq('přenos zbytku: další útrata 250 + 50 = 300 → body za 300, zbytek 0', [c2.body, c2.zbytekNovy], [15, 0]);
  eq('přenos zbytku: bez carry se zbytek nepřenáší', vypocitejOdmenu({ castka: 250, uroven: 'bronze', zbytek: 90 }, R()).zbytekNovy, 0);

  const min = vypocitejOdmenu({ castka: 79, uroven: 'bronze' }, R({ minSpend: 80, cashbackPct: 10 }));
  eq('minimální útrata: pod minimem nic (ani cashback)', [min.body, min.cashback, min.omezeno], [0, 0, 'minimum']);
  eq('minimální útrata: na hranici platí', vypocitejOdmenu({ castka: 100, uroven: 'bronze' }, R({ minSpend: 100 })).body, 5);

  const strop = vypocitejOdmenu({ castka: 10000, uroven: 'bronze' }, R({ capBill: 200 }));
  eq('strop na účtenku: 500 bodů se ořízne na 200', [strop.body, strop.omezeno, strop.bodyBezStropu], [200, 'strop_ucet', 500]);
  const den = vypocitejOdmenu({ castka: 10000, uroven: 'bronze', dnesUzBodu: 450 }, R({ capDay: 500 }));
  eq('strop za den: dnes už 450, zbývá 50', [den.body, den.omezeno], [50, 'strop_den']);
  eq('strop za den: vyčerpaný = nula', vypocitejOdmenu({ castka: 1000, uroven: 'bronze', dnesUzBodu: 500 }, R({ capDay: 500 })).body, 0);
  eq('stropy: nula = bez stropu', vypocitejOdmenu({ castka: 100000, uroven: 'bronze' }, R()).body, 5000);

  // ---- B2: vyloučené položky a kredit ------------------------------------------------------
  eq('kredit: část zaplacená kreditem se nepočítá (zapnuto)', vypocitejOdmenu({ castka: 500, zaplacenoKreditem: 200, uroven: 'bronze' }, R({ excludeCredit: true })).zaklad, 300);
  eq('kredit: vypnuto, počítá se celé', vypocitejOdmenu({ castka: 500, zaplacenoKreditem: 200, uroven: 'bronze' }, R()).zaklad, 500);
  eq('kredit: víc než účet se ořízne na nulu', vypocitejOdmenu({ castka: 100, zaplacenoKreditem: 900, uroven: 'bronze' }, R({ excludeCredit: true })).body, 0);
  eq('vyloučené položky se odečtou ze základu', vypocitejOdmenu({ castka: 600, vylouceno: 100, uroven: 'bronze' }, R()).body, 25);
  eq('cashback se počítá ze stejného základu', vypocitejOdmenu({ castka: 600, vylouceno: 100, uroven: 'bronze' }, R({ cashbackPct: 10 })).cashback, 50);

  const excl = { exclProducts: ['P1'], exclCategories: ['Poukazy'] };
  eq('vyloučení: produkt podle id', jeVylouceno({ productId: 'p1', castka: 10 }, excl), true);
  eq('vyloučení: kategorie podle názvu, bez ohledu na velikost', jeVylouceno({ productId: 'x', kategorie: 'poukazy', castka: 10 }, excl), true);
  eq('vyloučení: kategorie podle id z účtenky', jeVylouceno({ productId: 'x', categoryId: 'Poukazy', castka: 10 }, excl), true);
  eq('vyloučení: jiná položka ne', jeVylouceno({ productId: 'x', kategorie: 'Káva', castka: 10 }, excl), false);
  eq('vyloučená částka: součet řádků', vyloucenaCastka([{ productId: 'P1', castka: 80 }, { productId: 'x', kategorie: 'Poukazy', castka: 120 }, { productId: 'y', castka: 50 }], excl), 200);
  eq('vyloučená částka: nikdy víc než účet', vyloucenaCastka([{ productId: 'P1', castka: 800 }], excl, 300), 300);
  eq('vyloučená částka: bez pravidel nula', vyloucenaCastka([{ productId: 'P1', castka: 80 }], { exclProducts: [], exclCategories: [] }), 0);
  eq('platba kreditem: poukaz a věrnostní se sečtou, hotovost ne', castKreditem({ voucher: 100, loyalty: 50, bank: 70 }), 150);
  eq('platba kreditem: bez rozpadu nula', castKreditem(null), 0);

  // ---- B5: násobič podle úrovně ----------------------------------------------------------------
  const m = R({ multGold: 1.5, multSilver: 1.2 });
  eq('násobič úrovně: Člen vždy 1×', nasobicUrovne(m, 'bronze'), 1);
  eq('násobič úrovně: zlatý 1,5× z 20 bodů je 30', vypocitejOdmenu({ castka: 400, uroven: 'gold' }, m).body, 30);
  eq('násobič úrovně: stříbrný 1,2× z 20 bodů je 24', vypocitejOdmenu({ castka: 400, uroven: 'silver' }, m).body, 24);
  const vs = vypocitejOdmenu({ castka: 400, uroven: 'gold', bonusNasobic: 2, bonusNazev: 'Happy hour' }, m);
  eq('násobič: akce 2× a úroveň 1,5× → platí vyšší, ne součin', [vs.body, vs.nasobicZdroj], [40, 'akce']);
  const vu = vypocitejOdmenu({ castka: 400, uroven: 'gold', bonusNasobic: 1.2 }, m);
  eq('násobič: úroveň 1,5× je vyšší než akce 1,2×', [vu.body, vu.nasobicZdroj], [30, 'uroven']);
  ok('násobič: popis jde do poznámky', vs.nasobicPopis.includes('Happy hour') && vu.nasobicPopis.includes('za úroveň'));
  eq('násobič: nikdy míň než základ', vypocitejOdmenu({ castka: 100, uroven: 'bronze', bonusNasobic: 0.5 }, R()).body, 5);

  // ---- Validace pravidel ------------------------------------------------------------------------
  const v0 = normalizujRozsirena({});
  ok('validace: prázdný vstup = výchozí pravidla', v0.ok && v0.value.points_round === 'floor100' && v0.value.mult_gold === 1 && v0.value.points_cap_bill === 0);
  const v1 = normalizujRozsirena({ mult_silver: '1,25', mult_gold: '1,5', mult_platinum: '2', points_cap_bill: '200', points_cap_day: '500', tier_inactive_days: '90', credit_expire_days: '365' });
  ok('validace: desetinná čárka u násobiče', v1.ok && v1.value.mult_silver === 1.25 && v1.value.mult_gold === 1.5);
  ok('validace: strop za den menší než na účtenku je chyba', (() => { const r = normalizujRozsirena({ points_cap_bill: 300, points_cap_day: 100 }); return !r.ok && /Strop za den/.test(r.error); })());
  ok('validace: nižší násobič vyšší úrovně projde, platí ale násobič úrovně pod ní', normalizujRozsirena({ mult_silver: 2, mult_gold: 1.5 }).ok && nasobicUrovne(R({ multSilver: 2, multGold: 1.5, multPlatinum: 1 }), 'platinum') === 2 && nasobicUrovne(R({ multSilver: 2, multGold: 1 }), 'gold') === 2);
  ok('validace: násobič nad 5 je chyba', !normalizujRozsirena({ mult_gold: 6 }).ok);
  ok('validace: násobič pod 1 je chyba', !normalizujRozsirena({ mult_silver: 0.5 }).ok);
  ok('validace: neplatné číslo není nula', !normalizujRozsirena({ points_min_spend: 'abc' }).ok);
  ok('validace: desetinná útrata je chyba', !normalizujRozsirena({ points_min_spend: '12,5' }).ok);
  ok('validace: záporný strop je chyba', !normalizujRozsirena({ points_cap_bill: -1 }).ok);
  ok('validace: snížení úrovně pod 7 dní je chyba', !normalizujRozsirena({ tier_inactive_days: 3 }).ok);
  ok('validace: propadnutí kreditu pod 7 dní je chyba', !normalizujRozsirena({ credit_expire_days: 6 }).ok);
  ok('validace: neznámé zaokrouhlení je chyba', !normalizujRozsirena({ points_round: 'nahoru' }).ok);
  ok('validace: částečný vstup bere zbytek z platných hodnot', (() => { const r = normalizujRozsirena({ points_cap_bill: 100 }, { points_min_spend: 50, mult_gold: 1.5 }); return r.ok && r.value.points_min_spend === 50 && r.value.mult_gold === 1.5 && r.value.points_cap_bill === 100; })());
  ok('validace: seznamy se ořežou, duplicity sloučí', (() => { const r = normalizujRozsirena({ loyalty_excl_categories: [' Káva ', 'káva', 'Víno'] }); return r.ok && r.value.loyalty_excl_categories.length === 2; })());
  eq('uvítací body: bez nastavení dřívější chování (10, když jsou body za útratu)', [uvitaciBody({ points_per_100: 5 }), uvitaciBody({ points_per_100: 0 })], [10, 0]);
  eq('uvítací body: nastavená hodnota včetně nuly vyhrává', [uvitaciBody({ welcome_points: 25, points_per_100: 0 }), uvitaciBody({ welcome_points: 0, points_per_100: 5 })], [25, 0]);
  eq('uvítací body: poškozená hodnota se ořízne', uvitaciBody({ welcome_points: 99999 }), 1000);
  ok('uvítací body: validace 0 až 1000, chybějící = 10', (() => { const a = normalizujRozsirena({}); const b = normalizujRozsirena({ welcome_points: '' }); return a.ok && a.value.welcome_points === 10 && b.ok && b.value.welcome_points === 0 && !normalizujRozsirena({ welcome_points: 1001 }).ok && !normalizujRozsirena({ welcome_points: 2.5 }).ok; })());
  ok('uvítací body: připojení hosta čte nastavení, ne pevných 10', (() => { const j = zdroj('app/api/client/b/[slug]/join/route.ts'); return j.includes('uvitaciBody(p)') && !/award\([^)]*, 10,/.test(j); })());
  eq('profil → pravidla: poškozená hodnota je výchozí', pravidlaZProfilu({ points_round: 'x', mult_gold: 'abc', points_cap_bill: -5 }).multGold, 1);
  eq('profil → pravidla: seznam z JSON textu', pravidlaZProfilu({ loyalty_excl_products: '["a","b"]' }).exclProducts, ['a', 'b']);
  eq('profil → pravidla: bez sloupců výchozí body za 100', pravidlaZProfilu({}).pointsPer100, 5);

  // ---- B10: prahy UI × server -------------------------------------------------------------------
  eq('prahy: platné návštěvy', zkontrolujPrahy({ tier_by: 'visits', silver_at: 10, gold_at: 25, platinum_at: 0 }), null);
  ok('prahy: zlato nesmí být pod stříbrem', /Zlatý/.test(String(zkontrolujPrahy({ tier_by: 'visits', silver_at: 10, gold_at: 10 }))));
  ok('prahy: platina pod zlatem je chyba', /Platinový/.test(String(zkontrolujPrahy({ tier_by: 'visits', silver_at: 10, gold_at: 25, platinum_at: 20 }))));
  eq('prahy: v režimu útraty se berou prahy útraty', zkontrolujPrahy({ tier_by: 'spend', silver_spend: 3000, gold_spend: 8000, platinum_spend: 0, silver_at: 99, gold_at: 1 }), null);
  ok('prahy: stříbro aspoň 1', !!zkontrolujPrahy({ tier_by: 'visits', silver_at: 0, gold_at: 5 }));

  // ---- B10: deník a zůstatek -----------------------------------------------------------------------
  eq('deník: odečet víc než zůstatek se zapíše jako zůstatek', skutecnaZmena(30, -50), -30);
  eq('deník: odečet v mezích', skutecnaZmena(80, -50), -50);
  eq('deník: připsání beze změny', skutecnaZmena(0, 40), 40);
  eq('deník: nulový zůstatek nejde níž', skutecnaZmena(0, -10), 0);

  // ---- B4: platnost úrovně, degradace ----------------------------------------------------------------
  eq('degradace: vypnuto = žádný pokles', stupnuDolu(400, 0), 0);
  eq('degradace: před hranicí nic', stupnuDolu(29, 30), 0);
  eq('degradace: po hranici jeden stupeň', stupnuDolu(30, 30), 1);
  eq('degradace: dva stupně po dvou periodách', stupnuDolu(65, 30), 2);
  eq('degradace: neznámá návštěva nic', stupnuDolu(null, 30), 0);
  eq('snížení: zlatý o jeden je stříbrný', snizUroven('gold', 1), 'silver');
  eq('snížení: níž než Člen to nejde', snizUroven('silver', 5), 'bronze');
  eq('snížení: platina o dva je stříbrná', snizUroven('platinum', 2), 'silver');
  const pravidlaUrovni = { silverAt: 10, goldAt: 25, platinumAt: 0, inactiveDays: 30, silverDiscount: 5, goldDiscount: 10 };
  const nedavno = new Date(Date.now() - 5 * DEN);
  const pred40 = new Date(Date.now() - 40 * DEN);
  const pred65 = new Date(Date.now() - 65 * DEN);
  eq('úroveň: nedávná návštěva úroveň drží', tierForMember({ visits: 30, spend: 0, lastVisitAt: nedavno }, pravidlaUrovni).id, 'gold');
  const t40 = tierForMember({ visits: 30, spend: 0, lastVisitAt: pred40 }, pravidlaUrovni);
  eq('úroveň: po 40 dnech klesne zlatý na stříbrného (slevy podle nové úrovně)', [t40.id, t40.discount, t40.degraded?.from], ['silver', 5, 'gold']);
  eq('úroveň: po 65 dnech klesne o dva stupně', tierForMember({ visits: 30, spend: 0, last_visit_at: pred65 }, pravidlaUrovni).id, 'bronze');
  eq('úroveň: bez zapnuté platnosti se nic nemění', tierForMember({ visits: 30, spend: 0, lastVisitAt: pred65 }, { ...pravidlaUrovni, inactiveDays: 0 }).id, 'gold');
  eq('úroveň: bez známé návštěvy se nesnižuje', tierForMember({ visits: 30, spend: 0 }, pravidlaUrovni).id, 'gold');
  ok('úroveň: databázový čas bez zóny se čte jako UTC', tierForMember({ visits: 30, spend: 0, last_visit_at: new Date(Date.now() - 2 * DEN).toISOString().replace('T', ' ').replace('Z', '') }, pravidlaUrovni).id === 'gold');
  eq('dny bez návštěvy: dnes je nula', dniBezNavstevy(new Date(), undefined), 0);
  eq('dny bez návštěvy: neznámá návštěva', dniBezNavstevy(null), null);
  eq('kdy klesne: den poslední návštěvy + platnost', kdyKlesne('2026-09-01T10:00:00Z', 30), '2026-10-01');
  eq('kdy klesne: vypnuto', kdyKlesne('2026-09-01T10:00:00Z', 0), null);
  const nahoru = oznameniUrovne('silver', 'gold', 'Kavárna');
  const dolu = oznameniUrovne('gold', 'bronze', 'Kavárna');
  ok('oznámení úrovně: postup a pokles se liší', !!nahoru?.nahoru && /Gratulujeme/.test(nahoru.title) && !dolu?.nahoru && /klesla/.test(dolu?.title ?? ''));
  eq('oznámení úrovně: beze změny nic', oznameniUrovne('gold', 'gold', 'X'), null);
  eq('oznámení úrovně: první zapamatování nic', oznameniUrovne(null, 'gold', 'X'), null);

  // ---- B3: propadání kreditu ----------------------------------------------------------------------------
  const D = '2026-10-01';
  const denik = [
    { credit_delta: 100, kind: 'cashback', ref: 'bill:1', created_at: '2026-01-05 10:00:00' },
    { credit_delta: 50, kind: 'cashback', ref: 'bill:2', created_at: '2026-09-25 10:00:00' },
    { credit_delta: -30, kind: 'credit', ref: 'card', created_at: '2026-02-01 10:00:00' },
    { credit_delta: 0, kind: 'expire', ref: 'cwarn:2026-09-20', created_at: '2026-09-20 05:00:00' },
  ];
  const rk = rozlisDenikKreditu(denik, D);
  eq('kredit: upozornění se ze vstupu vyřadí a zapamatuje', [rk.vstup.length, rk.poslednVarovani], [3, '2026-09-20']);
  eq('kredit: FIFO, utracených 30 ubralo nejstarší, propadne 70', planPropadani(rk.vstup, 120, D, 90).propadne, 70);
  eq('kredit: nikdy víc než zůstatek', planPropadani(rk.vstup, 20, D, 90).propadne, 20);
  eq('kredit: den propadnutí se pozná', rozlisDenikKreditu([{ credit_delta: -70, kind: 'expire', ref: `cexp:${D}`, created_at: '2026-10-01 03:00:00' }], D).dnesUz, true);
  eq('kredit: body (delta) se do kreditu nepletou', rozlisDenikKreditu([{ delta: 50, credit_delta: 0, kind: 'manual', created_at: '2026-01-01 10:00:00' }], D).vstup.length, 0);

  // ---- B6: storno ------------------------------------------------------------------------------------------
  eq('storno: celá účtenka vrací zbývající', castStorna(40, 0, 1), 40);
  eq('storno: už vrácené se nevrací podruhé', castStorna(40, 40, 1), 0);
  eq('storno: poměrná část', castStorna(40, 0, 0.5), 20);
  eq('storno: poměr nad 100 % se ořízne', castStorna(40, 10, 5), 30);
  eq('storno: záporná hodnota nic', castStorna(-5, 0, 1), 0);

  // ---- B7: verze před/po ---------------------------------------------------------------------------------------
  const pred = { points_per_100: 5, cashback_pct: 0, points_cap_bill: 0, mult_gold: 1, points_round: 'floor100', loyalty_excl_categories: [] };
  const po = { points_per_100: 8, cashback_pct: 0, points_cap_bill: 200, mult_gold: '1.50', points_round: 'carry', loyalty_excl_categories: ['Poukazy'] };
  const zm = porovnejPravidla(pred, po);
  eq('verze: změnily se právě čtyři věci a bez beze změn', zm.map(z => z.key), ['points_per_100', 'points_round', 'points_cap_bill', 'loyalty_excl_categories', 'mult_gold'].filter(k => zm.some(z => z.key === k)));
  ok('verze: popisky před a po jsou lidské', zm.some(z => z.key === 'points_cap_bill' && z.before === 'vypnuto' && z.after === '200') && zm.some(z => z.key === 'mult_gold' && z.after === '1,5×') && zm.some(z => z.key === 'points_round' && /přenáš/.test(z.after)));
  eq('verze: beze změny', porovnejPravidla(pred, pred), []);
  ok('verze: věta do historie je kratší než 300 znaků', popisZmen(zm, 3).length <= 300 && popisZmen(zm, 3).startsWith('Verze 3: '));
  eq('verze: prázdná změna', popisZmen([]), 'beze změny');
  ok('verze: seznam kategorií se porovná obsahem, ne počtem', porovnejPravidla({ loyalty_excl_categories: ['A'] }, { loyalty_excl_categories: ['B'] }).length === 1);
  ok('verze: snímek obsahuje jen klíče pravidel', (() => { const s = snimekPravidel({ points_per_100: 5, slug: 'x', name: 'y', mult_gold: 2 }); return 'points_per_100' in s && 'mult_gold' in s && !('slug' in s); })());
  ok('verze: rozšířené klíče jsou podmnožinou verzovaných', KLICE_ROZSIRENE.every(k => (KLICE_VERZI as readonly string[]).includes(k)));

  // ---- B8: zdroje, CSV -----------------------------------------------------------------------------------------------
  eq('zdroje: účtenka', zdrojBodu('manual', 'bill'), 'Z účtenky z pokladny');
  eq('zdroje: ruční zápis', zdrojBodu('manual', ''), 'Ruční úprava vedením');
  eq('zdroje: objednávky', zdrojBodu('order', ''), 'Objednávky od stolu');
  eq('zdroje: narozeniny', zdrojBodu('birthday', ''), 'Narozeniny');
  eq('csv: pražský čas (UTC 22:30 v létě je po půlnoci)', csvCas('2026-07-01 22:30:00'), '2026-07-02 00:30');
  const csv = denikCsv([
    { created_at: '2026-07-01 10:00:00', name: 'Anna "Ája" Nová', email: 'a@x.cz', kind: 'manual', delta: 25, credit_delta: 0, amount: 450, note: 'Útrata; 450 Kč', ref: 'bill:1' },
    { created_at: '2026-07-01 11:00:00', name: '=HYPERLINK("x")', email: null, kind: 'cashback', delta: 0, credit_delta: 12.5, amount: null, note: null, ref: null },
  ]);
  const radky = csv.trim().split('\r\n');
  ok('csv: BOM, hlavička a dva řádky', csv.startsWith('﻿') && radky.length === 3 && radky[0].includes('Datum a čas;Host;E-mail;Druh;Body;Kredit;Útrata;Poznámka;Odkaz'));
  ok('csv: uvozovky a středníky se escapují', radky[1].includes('"Anna ""Ája"" Nová"') && radky[1].includes('"Útrata; 450 Kč"'));
  ok('csv: desetinná čárka a čísla bez textu', radky[2].includes(';12,5;') && radky[1].includes(';25;0;450;'));
  ok('csv: vzorec v buňce se neprovede', radky[2].includes("'=HYPERLINK"));
  ok('csv: druh česky', radky[1].includes('Ruční zápis') && radky[2].includes('Cashback'));
  ok('shrnutí: nic nezadáno = prázdné', shrnutiPravidel(R(), 'Kč').length === 0 && shrnutiPravidel(R({ capBill: 200, minSpend: 80 }), 'Kč').length === 2);

  // ---- Napojení ---------------------------------------------------------------------------------------------------------------
  const client = zdroj('lib/client.ts');
  ok('deník: award i awardCredit zapisují skutečnou změnu (CTE se zamčeným řádkem)', (client.match(/FOR UPDATE\)\s*\n\s*UPDATE client_memberships c SET/g) ?? []).length === 2 && client.includes('skutecne'));
  ok('deník: storno se nepočítá mezi utracené body', client.includes("kind NOT IN ('expire', 'storno')"));
  const scan = zdroj('app/api/client/staff/scan/route.ts');
  ok('kasa: účtenka i částka jdou přes odmenZaUtratu, ne přes vlastní výpočet', (scan.match(/odmenZaUtratu\(\{/g) ?? []).length === 2 && !scan.includes('Math.floor(total / 100)') && !scan.includes('Math.floor(amount / 100)'));
  ok('kasa: zrušená účtenka se nenabízí a nepřipíše', scan.includes('refunded = FALSE AND deleted = FALSE') && scan.includes('byla v pokladně zrušena nebo vrácena'));
  ok('kasa: oznámení o úrovni po návštěvě', scan.includes('zkontrolujUroven('));
  ok('objednávka: body přes odmenZaUtratu a bez cashbacku', zdroj('lib/clientOrders.ts').includes("zdroj: 'order'") && zdroj('lib/bodyPravidlaDb.ts').includes("v.zdroj === 'order' ? 0"));
  ok('storno: visí na konci synchronizace účtenek', zdroj('lib/posMirror.ts').includes('stornujUctenky(teamId)'));
  const db = zdroj('lib/bodyPravidlaDb.ts');
  ok('storno: obě cesty Storyous (příznak na původní, opravná se záporem) a idempotence', db.includes('b.refunded = TRUE OR b.deleted = TRUE') && db.includes('refunded_bill_id IS NOT NULL') && db.includes("'storno:' || r.bill_id") && db.includes('reversed_at IS NULL'));
  const init = zdroj('app/api/init/route.ts');
  const sloupce = Array.from(db.matchAll(/ALTER TABLE (\w+) ADD COLUMN IF NOT EXISTS (\w+)/g)).map(x => `${x[1]} ADD COLUMN IF NOT EXISTS ${x[2]}`);
  ok('schéma: každý lazy sloupec je i v init (kontrola SQL čte odtud)', sloupce.length >= 20 && sloupce.every(s => init.includes(`ALTER TABLE ${s.replace(' ADD COLUMN IF NOT EXISTS ', ' ADD COLUMN IF NOT EXISTS ')}`)));
  ok('schéma: tabulka verzí je v init i v mazání účtu', init.includes('CREATE TABLE IF NOT EXISTS client_rule_versions') && zdroj('lib/smazaniUctu.ts').includes("'client_rule_versions'"));
  ok('init: denně propadá kredit a kontroluje se úroveň', /await propadniKredit\(\)/.test(init) && /await zkontrolujUrovneVsem\(\)/.test(init));
  const profil = zdroj('app/api/client/admin/profile/route.ts');
  ok('profil: změna pravidel jde do verzí a prahy se kontrolují jako v UI', profil.includes('zaznamenejZmenuProfilu(') && profil.includes('zkontrolujPrahy('));
  const lo = zdroj('app/api/client/admin/loyalty/route.ts');
  ok('graf: pražské dny a „u kasy" jen skutečná připsání', lo.includes("AT TIME ZONE 'Europe/Prague'") && !lo.includes('CURRENT_DATE') && lo.includes("l.kind IN ('visit', 'order', 'cashback')"));
  ok('ruční úprava bodů a kreditu se zapisuje do historie změn', lo.includes("'client.body'") && lo.includes("'client.kredit'"));
  const popisky = zdroj('lib/auditPopisky.ts');
  ok('historie změn: popisky nových akcí', ['client.body', 'client.kredit', 'client.pravidla', 'client.storno', 'client.export'].every(k => popisky.includes(`'${k}'`)));
  const admin = zdroj('components/client/ClientAdmin.tsx');
  ok('členové: úprava kreditu v UI má vlastní oprávnění', admin.includes("smi('vernost.kredit_upravit')") && admin.includes("what: 'credit'"));
  const tabs = zdroj('components/client/LoyaltyTabs.tsx');
  ok('věrnost: rozšířená pravidla, přehledy a upozornění na Max jsou v obrazovce', tabs.includes('<PokrocilaPravidla') && tabs.includes('<BodyPrehledy') && tabs.includes('<MaxPoznamka'));
  ok('věrnost: prahy mají v UI stejné maximum jako server', tabs.includes('MAX_PRAH_NAVSTEV') && zdroj('app/api/client/admin/profile/route.ts').includes('silver_at, Number(cur.silver_at) || 10, 1, 500') && zdroj('lib/bodyPravidla.ts').includes('silver: 500, gold: 1000, platinum: 2000'));
  ok('pravidla: změny a koncept smí jen vernost.pravidla a jen v plánu Max', (() => { const r = zdroj('app/api/client/admin/loyalty/pravidla/route.ts'); return r.includes("pozaduj('vernost.pravidla')") && r.includes('teamIsMax'); })());
  ok('export: oprávnění zobrazit, audit a kontakt jen s oprávněním', (() => { const r = zdroj('app/api/client/admin/loyalty/export/route.ts'); return r.includes("pozaduj('vernost.zobrazit')") && r.includes("'client.export'") && r.includes('zakaznici.kontakty'); })());
  ok('host: kredit a snížená úroveň na stránce podniku', zdroj('app/api/client/b/[slug]/route.ts').includes('creditExpiring') && zdroj('components/client/BusinessPage.tsx').includes('creditExpiring'));
  ok('úroveň: všechna místa, která ji počítají, znají poslední návštěvu', ['app/api/client/b/[slug]/route.ts', 'app/api/client/b/[slug]/coupons/[id]/claim/route.ts', 'app/api/client/admin/customers/route.ts', 'app/api/client/admin/loyalty/route.ts', 'app/api/client/staff/scan/route.ts', 'lib/walletDb.ts', 'components/client/MyPage.tsx'].every(p => /tierForMember\(.{0,160}?(lastVisitAt|last_visit_at)/.test(zdroj(p).replace(/\n/g, ' '))));
}
