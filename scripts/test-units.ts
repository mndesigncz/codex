// Malá regresní síť na čistou logiku kolem peněz a napojení na pokladnu.
// Bez frameworku a bez databáze: jen funkce, které se dají zavolat přímo.
// Spouští se `npm test` (Node 22 sám odloupne typy). Když spadne, spadne i CI.
import { tierFor } from '../lib/clientSlots.ts';
import { normName, matchByName, sectionTitles } from '../lib/menuPos.ts';
import { contrast, normalizeQrDesign } from '../lib/qrDesign.ts';
import { sanitizeSvg } from '../lib/svgSanitize.ts';
import { batchesNeeded, planFor, recipeUnit, availableOf, taskTitleFor, checklistFor } from '../lib/productionPlan.ts';
import { earnedFor, wagesTotal, MAX_SHIFT_HOURS } from '../lib/wages.ts';
import { normalizeCurrency, formatMoney, currencySymbol } from '../lib/money.ts';

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.error(`✗ ${name}\n    dostal:  ${a}\n    čekáno: ${b}`); failed++; }
  else console.log(`✓ ${name}`);
};
const ok = (name: string, cond: boolean) => { if (!cond) { console.error(`✗ ${name}`); failed++; } else console.log(`✓ ${name}`); };

// --- Věrnostní úrovně a slevy (peníze) ---
const R = { silverAt: 2, goldAt: 25, memberDiscount: 5, silverDiscount: 10, goldDiscount: 15 };
eq('tier: pod prahem = člen', tierFor(1, R).id, 'bronze');
eq('tier: člen má základní slevu', tierFor(1, R).discount, 5);
eq('tier: od silverAt = stříbro', tierFor(2, R).id, 'silver');
eq('tier: stříbro sleva', tierFor(3, R).discount, 10);
eq('tier: od goldAt = zlato', tierFor(25, R).id, 'gold');
eq('tier: zlato sleva', tierFor(99, R).discount, 15);
eq('tier: do další úrovně', tierFor(3, R).nextAt, 25);
// Sleva nesmí s vyšší úrovní klesnout, i když to podnik zadá blbě.
ok('tier: sleva monotónní i při špatném zadání', tierFor(99, { silverAt: 2, goldAt: 3, memberDiscount: 20, silverDiscount: 5, goldDiscount: 1 }).discount >= 20);
// gold práh vždy nad silver.
ok('tier: gold práh nad silver', tierFor(5, { silverAt: 10, goldAt: 3 }).id !== 'gold' || tierFor(5, { silverAt: 10, goldAt: 3 }).nextAt === null);


// --- Párování názvů menu ↔ pokladna (rodina chyby s tiskem) ---
eq('normName: diakritika a interpunkce pryč', normName('Čaj zelený 0,5 l'), 'caj zeleny 0.5 l');
eq('normName: čárka i tečka splynou', normName('0,5 L') === normName('0.5 l'), true);
const cat = [
  { productId: 'p1', name: 'Sencha Fukujyu', category: 'Čaje', price: 85 },
  { productId: 'p2', name: 'MATCHA', category: 'Čaje', price: 120 },
  { productId: 'p2', name: 'Matcha', category: 'Sety', price: 120 }, // stejný produkt dvě kategorie
  { productId: 'p3', name: 'Konvička', category: 'A', price: 10 },
  { productId: 'p4', name: 'Konvička', category: 'B', price: 10 }, // dva RŮZNÉ produkty stejného jména
];
const m = matchByName([
  { id: 1, name: 'sencha fukujyu' },
  { id: 2, name: 'Matcha' },
  { id: 3, name: 'Konvička' },
  { id: 4, name: 'Neexistuje' },
], cat);
eq('match: shoda podle názvu bez ohledu na velikost', m.matched.find(x => x.id === 1)?.productId, 'p1');
eq('match: jeden produkt ve dvou kategoriích je pořád jednoznačný', m.matched.find(x => x.id === 2)?.productId, 'p2');
ok('match: dva různé produkty stejného jména se nespárují', !m.matched.some(x => x.id === 3) && m.ambiguous.includes('Konvička'));
ok('match: co v kase není, se nespáruje', !m.matched.some(x => x.id === 4));
const titles = sectionTitles(['Nápoje › Čaje › Zelené', 'Nápoje › Čaje › Černé']);
eq('sekce: unikátní poslední článek se zkrátí', titles.get('Nápoje › Čaje › Zelené'), 'Zelené');

// --- QR kontrast (nečitelný kód se nesmí uložit) ---
ok('qr: bílá na bílé má mizerný kontrast', contrast('#FFFFFF', '#FFFFFF') < 1.5);
ok('qr: černá na bílé je čitelná', contrast('#16181A', '#FFFFFF') > 3);
eq('qr: nečitelná barva kódu se vrátí na černou', normalizeQrDesign({ dark: '#EEEEEE', light: '#FFFFFF' }).dark, '#16181A');
eq('qr: nesmyslný formát → výchozí', normalizeQrDesign({ sheet: 'hack', style: 'x' }).sheet, 'card');
eq('qr: velikost se ořízne do rozsahu', normalizeQrDesign({ size: 999 }).size, 120);

// --- Sanitizace nahraného SVG (bezpečnost: podklad plánku stolů) ---
ok('svg: skript se odstraní', !/script/i.test(sanitizeSvg('<svg viewBox="0 0 100 100"><script>alert(1)</script><rect/></svg>').svg));
ok('svg: onload atribut se odstraní', !/onload/i.test(sanitizeSvg('<svg viewBox="0 0 10 10"><rect onload="x()" width="5" height="5"/></svg>').svg));
ok('svg: href/xlink se odstraní', !/href/i.test(sanitizeSvg('<svg viewBox="0 0 10 10"><a href="javascript:1"><rect width="5" height="5"/></a></svg>').svg));
ok('svg: foreignObject padá i s obsahem', !/foreignobject|<div/i.test(sanitizeSvg('<svg viewBox="0 0 10 10"><foreignObject><div>x</div></foreignObject><rect width="5" height="5"/></svg>').svg));
ok('svg: image se odstraní', !/<image/i.test(sanitizeSvg('<svg viewBox="0 0 10 10"><image href="x.png"/><rect width="5" height="5"/></svg>').svg));
eq('svg: poměr stran z viewBoxu', Math.round(sanitizeSvg('<svg viewBox="0 0 200 100"><rect width="10" height="10"/></svg>').ratio * 100) / 100, 2);
let threw = false; try { sanitizeSvg('tohle není svg'); } catch { threw = true; }
ok('svg: co není SVG, vyhodí chybu', threw);
let threwBig = false; try { sanitizeSvg('<svg>' + 'a'.repeat(500000) + '</svg>'); } catch { threwBig = true; }
ok('svg: příliš velký soubor vyhodí chybu', threwBig);

if (failed) { console.error(`\n${failed} test(ů) selhalo.`); process.exit(1); }
console.log('\nVšechny testy prošly.');

// --- Výroba vlastních produktů: dávky, suroviny, co chybí (lib/productionPlan) ---
{
  const row = (o: any) => ({
    id: 1, name: 'X', category: 'Nápoje', categoryId: null, quantity: 0, minQuantity: 3, criticalQuantity: 1, maxQuantity: 10,
    unit: 'l', packageSize: null, openAmount: null, contentUnit: null, madeInHouse: true, batchYield: 5, batchSteps: null,
    productionLabel: null, packaging: null, status: 'low', ...o,
  });
  const lim = row({ id: 1, name: 'Limonáda', quantity: 1 });
  eq('výroba: dávky do plného stavu (10−1)/5 → 2', batchesNeeded(lim), 2);
  eq('výroba: bez max míří na 2×min', batchesNeeded(row({ id: 1, quantity: 0, maxQuantity: 0, minQuantity: 4, batchYield: 2 })), 4);
  eq('výroba: aspoň jedna dávka', batchesNeeded(row({ id: 1, quantity: 9 })), 1);
  eq('výroba: strop 10 dávek', batchesNeeded(row({ id: 1, quantity: 0, maxQuantity: 1000, batchYield: 1 })), 10);
  const citron = row({ id: 2, name: 'Citron', unit: 'kg', quantity: 1, madeInHouse: false, batchYield: null });
  const cukr = row({ id: 3, name: 'Cukr', unit: 'ks', quantity: 2, packageSize: 1000, openAmount: 500, contentUnit: 'g', madeInHouse: false, batchYield: null });
  const stock = new Map<number, any>([[1, lim], [2, citron], [3, cukr]]);
  eq('výroba: jednotka receptury u baleného = obsah', recipeUnit(cukr), 'g');
  eq('výroba: dostupné u baleného = balení×velikost + načaté', availableOf(cukr), 2500);
  const plan = planFor(lim, [{ ingredientId: 2, amount: 1 }, { ingredientId: 3, amount: 800 }], stock);
  eq('výroba: potřeba × dávky', plan.lines.map(l => l.need), [2, 1600]);
  eq('výroba: chybí jen citron (1 kg z 2)', plan.missing.map(l => `${l.name}:${l.missing}`), ['Citron:1']);
  eq('výroba: výnos celkem', plan.yieldTotal, 10);
  eq('výroba: neznámá surovina se přeskočí', planFor(lim, [{ ingredientId: 99, amount: 1 }], stock).lines.length, 0);
  eq('výroba: název úkolu default', taskTitleFor(lim), 'Vyrobit Limonáda');
  eq('výroba: název úkolu vlastní', taskTitleFor(row({ productionLabel: 'Uvař limonádu' })), 'Uvař limonádu');
  eq('výroba: kroky postupu jako checklist', checklistFor(planFor(row({ batchSteps: '1. Nakrájet\n- Svařit\n\nStočit' }), [], stock)).map(c => c.text), ['Nakrájet', 'Svařit', 'Stočit']);
  // toLocaleString('cs-CZ') odděluje tisíce nezlomitelnou mezerou — pro srovnání ji narovnáme.
  eq('výroba: bez postupu checklist ze surovin', checklistFor(plan).map(c => c.text.replace(/\s/g, ' ')), ['Odměřit Citron 2 kg', 'Odměřit Cukr 1 600 g']);
}

{
  const H = 3600000;
  // Zaokrouhluje se po záznamu, protože účetní sečte to, co je vytištěné
  // v CSV řádcích — a celkové číslo tomu musí odpovídat.
  eq('mzdy: jeden záznam se zaokrouhlí', earnedFor(2.5 * H, 155), 388);
  eq('mzdy: bez sazby nic', earnedFor(8 * H, 0), 0);
  eq('mzdy: záporný čas nic', earnedFor(-1 * H, 155), 0);

  // Právě tenhle případ dělal ze tří obrazovek tři různá čísla: Finance
  // zapomenuté odpíchnutí počítaly celé, Uzávěrky ho vyhazovaly.
  eq('mzdy: zapomenuté odpíchnutí se nepočítá', earnedFor(30 * H, 200), 0);
  eq('mzdy: hranice je 24 h', earnedFor(MAX_SHIFT_HOURS * H, 200), 0);
  eq('mzdy: těsně pod hranicí se počítá', earnedFor(23.5 * H, 200), 4700);

  const dvaZaznamy = [{ ms: 2.5 * H, rate: 155 }, { ms: 3.5 * H, rate: 155 }];
  eq('mzdy: součet = součet zaokrouhlených řádků',
    wagesTotal(dvaZaznamy).total,
    earnedFor(2.5 * H, 155) + earnedFor(3.5 * H, 155));
  // Kdyby se zaokrouhlovalo až na konci, vyšlo by 930 — a CSV by nesedělo.
  eq('mzdy: a liší se od zaokrouhlení až součtu', wagesTotal(dvaZaznamy).total, 931);

  const sZapomenutym = [...dvaZaznamy, { ms: 30 * H, rate: 155 }];
  eq('mzdy: vynechané se počítají zvlášť', wagesTotal(sZapomenutym).skipped, 1);
  eq('mzdy: a do součtu nejdou', wagesTotal(sZapomenutym).total, wagesTotal(dvaZaznamy).total);
  eq('mzdy: bez sazby se nepočítá ani jako vynechané',
    wagesTotal([{ ms: 8 * H, rate: 0 }]).skipped, 0);
}

{
  // Starší podniky mají uložený symbol místo kódu; `Intl` na symbol spadne.
  eq('měna: symbol na kód', normalizeCurrency('Kč'), 'CZK');
  eq('měna: euro', normalizeCurrency('€'), 'EUR');
  eq('měna: kód zůstane', normalizeCurrency('EUR'), 'EUR');
  eq('měna: prázdno = koruna', normalizeCurrency(''), 'CZK');
  eq('měna: null = koruna', normalizeCurrency(null), 'CZK');

  // Hostovská stránka psala „120 EUR" místo „120 €" a tisíce neoddělovala.
  eq('měna: euro se vykreslí symbolem', formatMoney(120, 'EUR', 'cs-CZ').includes('€'), true);
  eq('měna: euro není kód', formatMoney(120, 'EUR', 'cs-CZ').includes('EUR'), false);
  eq('měna: tisíce se oddělují', formatMoney(12500, 'CZK', 'cs-CZ').replace(/\s/g, ' '), '12 500 Kč');
  eq('měna: uložený symbol se taky naformátuje',
    formatMoney(12500, 'Kč', 'cs-CZ').replace(/\s/g, ' '), '12 500 Kč');
  eq('měna: symbol pro popisek', currencySymbol('EUR', 'cs-CZ'), '€');
}
