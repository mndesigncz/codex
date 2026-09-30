// Kolo 72, audit oblasti Sklad / Inventura / Receptury / Menu / Měny.
//
// Hlídá to, co se v auditu ukázalo jako skutečná chyba: desetinné ceny a počty
// (4,50 € v menu, 4,99 € u balení, 0,68 l v načatém), jednotku nákupních vlajek,
// odložené suroviny ve výrobním plánu a texty rad v jiné měně než koruně.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { cenaZFormulare, cenaZDb, cenaProSloupec, cenaDoPole, cenaMenu, naHalere } from '../../lib/cena.ts';
import { pocetZPole, pocetDoPole } from '../../lib/inventura.ts';
import { chybiVJednotcePolozky, planFor, describe, type StockRow } from '../../lib/productionPlan.ts';
import { menaZRadku, prahVMene } from '../../lib/mena.ts';
import { formatPrice } from '../../lib/money.ts';
import { navrhMnozstvi, type PolozkaSkladu } from '../../lib/skladPrehled.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

const radek = (x: Partial<StockRow> & { id: number; name: string }): StockRow => ({
  category: '', categoryId: null, quantity: 0, minQuantity: 1, criticalQuantity: 0, maxQuantity: 10,
  unit: 'ks', packageSize: null, openAmount: null, contentUnit: null,
  madeInHouse: false, batchYield: null, batchSteps: null, productionLabel: null,
  packaging: null, status: 'ok', ...x,
});

export default function ({ eq, ok }: Testy) {
  // ---- ceny s haléři ----
  eq('cena: eurová cena s čárkou', cenaZFormulare('4,50'), { ok: true, hodnota: 4.5 });
  eq('cena: s tečkou', cenaZFormulare('12.90'), { ok: true, hodnota: 12.9 });
  eq('cena: mezera jako oddělovač tisíců', cenaZFormulare('1 234,5'), { ok: true, hodnota: 1234.5 });
  eq('cena: prázdné pole není nula', cenaZFormulare('  '), { ok: true, hodnota: null });
  eq('cena: nevyplněno z těla požadavku', [cenaZFormulare(null), cenaZFormulare(undefined)], [{ ok: true, hodnota: null }, { ok: true, hodnota: null }]);
  eq('cena: nula je platná cena', cenaZFormulare('0'), { ok: true, hodnota: 0 });
  eq('cena: víc než haléře se zaokrouhlí na haléře', cenaZFormulare('4,999'), { ok: true, hodnota: 5 });
  eq('cena: písmena, záporné a víc oddělovačů jsou chyba, ne nula',
    ['abc', '-3', '1,2,3', '4 €', '1e9'].map(t => cenaZFormulare(t).ok), [false, false, false, false, false]);
  eq('cena: číslo z JSONu', [cenaZFormulare(4.99), cenaZFormulare(-1), cenaZFormulare(NaN)], [{ ok: true, hodnota: 4.99 }, { ok: false }, { ok: false }]);
  eq('cena: strop proti překlepu', cenaZFormulare('99999999'), { ok: true, hodnota: 1_000_000 });
  eq('cena: 1,005 se zaokrouhlí nahoru (ne na 1,00)', naHalere(1.005), 1.01);

  // NUMERIC chodí z Neonu jako řetězec, INTEGER jako číslo — čtení musí vrátit číslo v obou případech.
  eq('cena z databáze: NUMERIC řetězec, INTEGER číslo, null', [cenaZDb('4.99'), cenaZDb(120), cenaZDb(null), cenaZDb('120.00')], [4.99, 120, null, 120]);
  eq('cena z databáze: nesmysl není nula', cenaZDb('abc'), null);
  // Nemigrovaný sloupec INTEGER by desetinnou cenu odmítl; zapisuje se zaokrouhlená jako dřív.
  eq('cena do sloupce: INTEGER zaokrouhlí, NUMERIC nechá haléře, null zůstane null',
    [cenaProSloupec(4.99, false), cenaProSloupec(4.99, true), cenaProSloupec(null, true)], [5, 4.99, null]);
  eq('cena do pole: české čárky, haléře jen kde jsou', [cenaDoPole(4.5), cenaDoPole(49), cenaDoPole(null), cenaDoPole(12.9)], ['4,50', '49', '', '12,90']);

  // cena položky menu: „4,50" se nesmí slít do 450 ani zaokrouhlit na 5
  eq('menu: cena drží haléře', [cenaMenu('4,50', 100000), cenaMenu(4.5, 100000), cenaMenu('12.90', 100000), cenaMenu(49, 100000)], [4.5, 4.5, 12.9, 49]);
  eq('menu: nesmysl a záporné jsou 0 (položka bez ceny)', [cenaMenu('abc', 100000), cenaMenu(-5, 100000), cenaMenu(null, 100000)], [0, 0, 0]);
  eq('menu: cena má strop', cenaMenu('99999999', 100000), 100000);
  ok('menu: cleanPrice v lib/menu jde přes tutéž funkci', zdroj('lib/menu.ts').includes('cenaMenu(raw, MAX_PRICE)'));

  // zobrazení: 4,50 € se nesmí ukázat jako „5 €"
  const eur = (n: number) => formatPrice(n, 'EUR', 'cs-CZ').replace(/\s/g, '');
  eq('formatPrice: haléře jen tam, kde jsou', [eur(4.5), eur(49), eur(4.99)], ['4,50€', '49€', '4,99€']);

  // ---- inventura: počty z pole ----
  // Řízený input dřív při každém úhozu rozparsoval hodnotu a vykreslil ji zpět:
  // „0," → 0 → čárka zmizela a 0,68 skončilo jako 68.
  eq('inventura: postup psaní 0 → 0, → 0,6 → 0,68 dává vždy platné číslo',
    ['0', '0,', '0,6', '0,68'].map(t => pocetZPole(t, true)),
    [{ ok: true, hodnota: 0 }, { ok: true, hodnota: 0 }, { ok: true, hodnota: 0.6 }, { ok: true, hodnota: 0.68 }]);
  eq('inventura: zbytek v načatém s tečkou', pocetZPole('0.68', true), { ok: true, hodnota: 0.68 });
  eq('inventura: počet na celé odmítne desetiny místo tiché zaokrouhlení (2,35 kg → 2 kg)', pocetZPole('2,35', false), { ok: false, duvod: 'cele' });
  eq('inventura: celé číslo a „2,0" jsou v pořádku i bez desetin', [pocetZPole('2', false), pocetZPole('2,0', false)], [{ ok: true, hodnota: 2 }, { ok: true, hodnota: 2 }]);
  eq('inventura: sloupec s desetinami přijme 2,35', pocetZPole('2,35', true), { ok: true, hodnota: 2.35 });
  eq('inventura: prázdné pole = nespočítáno, ne nula', [pocetZPole('', true), pocetZPole(null, false)], [{ ok: true, hodnota: null }, { ok: true, hodnota: null }]);
  eq('inventura: nečíslo je chyba', [pocetZPole('abc', true), pocetZPole('-1', true), pocetZPole('1,2,3', true)],
    [{ ok: false, duvod: 'cislo' }, { ok: false, duvod: 'cislo' }, { ok: false, duvod: 'cislo' }]);
  eq('inventura: víc než tři desetinná místa se zaokrouhlí', pocetZPole('0,68449', true), { ok: true, hodnota: 0.684 });
  eq('inventura: číslo zpět do pole s čárkou', [pocetDoPole(0.68), pocetDoPole(2), pocetDoPole(null)], ['0,68', '2', '']);

  // ---- nákupní vlajka: jednotka položky, ne receptury ----
  // Chybí 1 500 g cukru, balení má 1 000 g → do nákupu patří 1,5 balení, ne 1 500 kusů.
  const cukr = radek({ id: 5, name: 'Cukr', unit: 'ks', packageSize: 1000, contentUnit: 'g', quantity: 0, openAmount: 0 });
  const limonada = radek({ id: 9, name: 'Limonáda', unit: 'l', madeInHouse: true, batchYield: 5, quantity: 0, minQuantity: 2, maxQuantity: 15 });
  const stock = new Map<number, StockRow>([[cukr.id, cukr], [limonada.id, limonada]]);
  const plan = planFor(limonada, [{ ingredientId: cukr.id, amount: 500 }], stock, 3);
  eq('výroba: chybí 1 500 g cukru (jednotka receptury)', plan.missing.map(l => [l.ingredientId, l.missing, l.unit]), [[5, 1500, 'g']]);
  eq('výroba: do vlajky jde 1,5 balení', chybiVJednotcePolozky(plan.missing[0], cukr), 1.5);
  eq('výroba: kusovka bez balení zůstává v kusech', chybiVJednotcePolozky({ missing: 7 }, radek({ id: 6, name: 'Citron', unit: 'ks' })), 7);
  // Nákupní seznam pak ceil(1,5) = 2 balení, ne 1 500.
  const zCukru: PolozkaSkladu = { id: 5, name: 'Cukr', quantity: 0, minQuantity: 1, criticalQuantity: 0, maxQuantity: 0, unit: 'ks', buyFor: [{ itemId: 9, name: 'Limonáda', amount: 1.5 }] } as any;
  eq('nákup: navrhne 2 balení, ne 1 500 kusů', navrhMnozstvi(zCukru), 2);

  // ---- odložená surovina zůstane v plánu ----
  const odlozena = { ...cukr, archived: true };
  const planOdlozeny = planFor(limonada, [{ ingredientId: cukr.id, amount: 500 }], new Map([[cukr.id, odlozena], [limonada.id, limonada]]), 2);
  eq('výroba: odložená surovina z plánu nezmizí', planOdlozeny.lines.map(l => [l.name, l.archived === true]), [['Cukr', true]]);
  ok('výroba: text úkolu řekne, že je surovina odložená, a neslibuje nákupní seznam', (() => {
    const t = describe(planOdlozeny);
    return t.includes('odložená') && !t.includes('je v nákupním seznamu');
  })());

  // ---- měna v textech rad ----
  const eurMena = menaZRadku('EUR', 'cs-CZ');
  ok('měna: euro v textu rady, ne koruny', eurMena.money(3200).includes('€') && !eurMena.money(3200).includes('Kč'));
  ok('měna: staré uložené „Kč" se pozná jako koruna', menaZRadku('Kč', 'cs-CZ').money(3200).includes('Kč'));
  ok('měna: bez podniku koruna jako dřív', menaZRadku(null, null).money(1500).includes('Kč'));
  ok('měna: náklad na porci pod eurem má desetiny (0,62 €, ne 1 €)', eurMena.cost(0.62).replace(/\s/g, '') === '0,62€');
  eq('měna: práh 2 000 Kč v korunách zůstává, v eurech je ~80, ve forintech ~31 000',
    [prahVMene(2000, 'CZK'), prahVMene(2000, 'EUR'), prahVMene(2000, 'HUF')], [2000, 80, 31000]);
  eq('měna: práh se přepočítá i přes uložený symbol', prahVMene(2000, '€'), 80);

  // ---- pojistky nad zdrojáky: co se nedá otestovat bez databáze ----
  const kodBezKomentaru = (cesta: string) => zdroj(cesta).split('\n').filter(r => !/^\s*(\/\/|\*|\/\*)/.test(r)).join('\n');
  ok('smazání položky uklízí odkazy (kasa, receptury, vlajky) — i hromadné', ['app/api/inventory/[id]/route.ts', 'app/api/inventory/bulk/route.ts']
    .every(f => kodBezKomentaru(f).includes('uklidOdkazyNaPolozky(')));
  ok('uklid odkazů maže mapování kasy', kodBezKomentaru('lib/skladOdkazy.ts').includes('DELETE FROM pos_product_map'));
  ok('inventura po dokončení srovná výrobní úkoly', kodBezKomentaru('app/api/stocktake/route.ts').includes('ensureProductionTasks('));
  ok('uložení receptury kasy jde v transakci', kodBezKomentaru('app/api/pos/products/route.ts').includes('sql.transaction('));
  ok('rady ze serveru nepíšou koruny natvrdo', ['app/api/finance/advice/route.ts', 'app/api/finance/route.ts', 'app/api/pos/margins/route.ts', 'app/api/pos/daily/route.ts', 'app/api/inventory/shrinkage/route.ts']
    .every(f => !/Kč/.test(kodBezKomentaru(f))));
}
