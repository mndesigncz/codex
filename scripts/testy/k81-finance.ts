// Kolo 81, balík B2 (Finance): pevné náklady ve výsledku, datum a kategorie
// účtenky, slevy a storna z kasy, ceny menu proti kase, kniha výdajů podle
// dodavatele — jednotkové testy čisté logiky v lib/financeWidgety.ts a
// lib/recepturyPrehled.ts.
//
// Hlídá se hlavně to, co by jinak lhalo potichu: výsledek bez nájmu, který
// tvrdí „v plusu"; starší server bez `fixedCosts`, který se nesmí tvářit, že
// pevné náklady jsou nula vyplněná; procento slev bez tržby (dělení nulou);
// kategorie mimo whitelist a datum nákupu v budoucnosti.

import type { Testy } from './_testy.ts';
import {
  cistePevneNaklady, pevneNakladyZDb, soucetPevnychNakladu, cistyVysledek, castkaNakladuZPole,
  vyberFinance, vyberDenniPokladnu,
  KATEGORIE_UCTENEK, jeKategorieUctenky, datumNakupu, poctyKategorii, POPISKY_KATEGORII_CS,
  podilSlev, slevyNadPrah, PRAH_SLEV_PCT,
  podleDodavatele,
} from '../../lib/financeWidgety.ts';
import { vyberMenu, jinaCena, jinaCenaDesek } from '../../lib/recepturyPrehled.ts';

const financeRaw = (summary: Record<string, unknown> = {}, ledger: unknown[] = []) => ({
  month: '2026-10',
  summary: { revenue: 100000, prevRevenue: 80000, purchases: 20000, wagesCash: 0, wagesWorked: 30000, gross: 50000, mzdySkryte: false, ...summary },
  ledger,
  insights: [],
});

export default function ({ eq, ok }: Testy) {
  // ---- pevné náklady ----
  eq('pevné náklady: očista přijme platné řádky, ořeže mezery', cistePevneNaklady([{ name: ' Nájem ', amount: 40000 }, { name: 'Energie', amount: 0 }]),
    [{ name: 'Nájem', amount: 40000 }, { name: 'Energie', amount: 0 }]);
  eq('pevné náklady: prázdný název, záporná nebo necelá částka, přes 20 řádků a ne-pole = null (odmítne se celá změna)', [
    cistePevneNaklady([{ name: '', amount: 1 }]), cistePevneNaklady([{ name: 'A', amount: -1 }]), cistePevneNaklady([{ name: 'A', amount: 1.5 }]),
    cistePevneNaklady([{ name: 'A', amount: 'x' }]), cistePevneNaklady(Array.from({ length: 21 }, () => ({ name: 'A', amount: 1 }))),
    cistePevneNaklady('nic'), cistePevneNaklady([{ name: 'x'.repeat(41), amount: 1 }]),
  ], [null, null, null, null, null, null, null]);
  eq('pevné náklady: z databáze vadný záznam = prázdný seznam, ne pád', [pevneNakladyZDb(null), pevneNakladyZDb('{'), pevneNakladyZDb([{ name: 'Nájem', amount: 1 }])],
    [[], [], [{ name: 'Nájem', amount: 1 }]]);
  eq('pevné náklady: součet a výsledek po nich', [soucetPevnychNakladu([{ name: 'a', amount: 40000 }, { name: 'b', amount: 8500 }]), cistyVysledek(50000, 48500), cistyVysledek(30000, 48500)],
    [48500, 1500, -18500]);
  eq('pevné náklady: částka z pole snese mezery a čárku, záporné a nečitelné je null',
    [castkaNakladuZPole('12 000'), castkaNakladuZPole('1200,60'), castkaNakladuZPole('-5'), castkaNakladuZPole('abc'), castkaNakladuZPole('')], [12000, 1201, null, null, null]);

  // ---- /api/finance s pevnými náklady a bez nich ----
  const sPevnymi = vyberFinance(financeRaw({ fixedCosts: 48500, net: 1500, fixedCostsSet: true }));
  eq('finance: souhrn nese fixedCosts, net i fixedCostsSet', [sPevnymi.souhrn.fixedCosts, sPevnymi.souhrn.net, sPevnymi.souhrn.fixedCostsSet], [48500, 1500, true]);
  const bez = vyberFinance(financeRaw());
  eq('finance: starší server bez pevných nákladů — net = gross, nic není „vyplněno"', [bez.souhrn.fixedCosts, bez.souhrn.net, bez.souhrn.fixedCostsSet], [0, 50000, false]);
  const prazdne = vyberFinance(financeRaw({ fixedCosts: 0, net: 50000, fixedCostsSet: false }));
  ok('finance: podnik bez vyplněných nákladů má fixedCostsSet false (poznámka „bez nájmu")', prazdne.souhrn.fixedCostsSet === false && prazdne.souhrn.net === 50000);

  // ---- kategorie a datum účtenky ----
  eq('kategorie: pět pevných hodnot, každá má český popisek', KATEGORIE_UCTENEK.map(k => POPISKY_KATEGORII_CS[k]), ['Suroviny', 'Nápoje', 'Provoz', 'Vybavení', 'Jiné']);
  eq('kategorie: whitelist', [jeKategorieUctenky('napoje'), jeKategorieUctenky('Nápoje'), jeKategorieUctenky(''), jeKategorieUctenky(null)], [true, false, false, false]);
  eq('datum nákupu: platné a nejpozději dnes; budoucí, nesmyslné (31. 2.) a jiný tvar = null', [
    datumNakupu('2026-10-12', '2026-10-12'), datumNakupu('2026-09-30', '2026-10-12'), datumNakupu('2026-10-13', '2026-10-12'),
    datumNakupu('2026-02-31', '2026-10-12'), datumNakupu('12.10.2026', '2026-10-12'), datumNakupu(20261012, '2026-10-12'),
  ], ['2026-10-12', '2026-09-30', null, null, null, null]);
  const kniha = vyberFinance(financeRaw({}, [
    { date: '2026-10-02', kind: 'receipt', label: 'Makro', amount: 1200, category: 'suroviny', supplier: 'Makro' },
    { date: '2026-10-03', kind: 'receipt', label: 'MAKRO', amount: 800, category: 'napoje', supplier: 'MAKRO' },
    { date: '2026-10-04', kind: 'receipt', label: 'Účtenka', amount: 300, category: 'nesmysl' },
    { date: '2026-10-05', kind: 'order', label: 'Objednávka — Monin', amount: 2000, orderId: 7, supplier: 'Monin', orderedBy: 'Eva', items: [{ name: 'Sirup Mango', qty: 6, unit: 'ks' }, { nazev: 'bez jména' }] },
    { date: '2026-10-06', kind: 'expense', label: 'Výdaj z kasy', amount: 700 },
    { date: '2026-10-07', kind: 'wage', label: 'Denní výplata', amount: 5000 },
  ])).kniha;
  eq('kniha: kategorie mimo whitelist je null, položky objednávky bez jména vypadnou', [kniha[2].category, kniha[3].orderId, kniha[3].items, kniha[3].orderedBy],
    [null, 7, [{ name: 'Sirup Mango', qty: 6, unit: 'ks' }], 'Eva']);
  eq('kniha: počty kategorií jen z účtenek; bez kategorie se počítá jako „jiné"', poctyKategorii(kniha), { suroviny: 1, napoje: 1, provoz: 0, vybaveni: 0, jine: 1 });

  // ---- podle dodavatele ----
  const dod = podleDodavatele(kniha);
  eq('podle dodavatele: „Makro" a „MAKRO" je jeden dodavatel, největší první, procento z celé knihy (10 000)',
    dod.map(d => [d.nazev, d.castka, d.dokladu, d.pct]), [['Makro', 2000, 2, 20], ['Monin', 2000, 1, 20], ['', 300, 1, 3]]);
  eq('podle dodavatele: prázdná kniha = nic', podleDodavatele([]), []);

  // ---- slevy z kasy ----
  eq('slevy: podíl v celých procentech, bez tržby nebo bez slev 0 (žádné dělení nulou)', [podilSlev(650, 10000), podilSlev(0, 10000), podilSlev(500, 0), podilSlev(7, 100)], [7, 0, 0, 7]);
  eq('slevy: práh 5 % — přesně 5 není varování, 6 je', [PRAH_SLEV_PCT, slevyNadPrah(500, 10000), slevyNadPrah(600, 10000)], [5, false, true]);
  const pokladna = vyberDenniPokladnu({ connected: true, totals: { total: 10000, discounts: 650, voidCount: 3, voidTotal: 1240 }, days: [] });
  eq('pokladna: součty nesou slevy a storna; starší server bez nich = nuly', [pokladna.soucty.discounts, pokladna.soucty.voidCount, pokladna.soucty.voidTotal,
    vyberDenniPokladnu({ connected: true, totals: { total: 1 }, days: [] }).soucty.voidCount], [650, 3, 1240, 0]);

  // ---- cena v menu proti kase ----
  const menu = vyberMenu({ boards: [{ id: 1, slug: 'akce', name: 'Akce', enabled: true, sections: [{ title: 'Káva', items: [
    { id: 1, name: 'Latte', price: 75, posProductId: 'p1', posPrice: 75 },
    { id: 2, name: 'Flat white', price: 80, posProductId: 'p2', posPrice: 85 },
    { id: 3, name: 'Čaj', price: 60, posProductId: null, posPrice: null },
    { id: 4, name: 'Matcha', price: 0, posProductId: 'p4', posPrice: 95 },
  ] }] }] });
  eq('menu: jiná cena než v kase = spárovaná položka s cenou kasy a jinou cenou v menu (i nula)', [jinaCena(menu.desky[0].polozky), menu.desky[0].jinaCena, jinaCenaDesek(menu.desky)], [2, 2, 2]);
  eq('menu: slabá odpověď (jen=vyprodano) bez cen nic nepočítá', vyberMenu({ boards: [{ id: 1, slug: 'a', name: 'A', sections: [{ title: 'x', items: [{ id: 1, name: 'L', soldOut: false }] }] }] }).desky[0].jinaCena, 0);
}
