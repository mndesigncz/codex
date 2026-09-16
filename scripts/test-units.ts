// Malá regresní síť na čistou logiku kolem peněz a napojení na pokladnu.
// Bez frameworku a bez databáze: jen funkce, které se dají zavolat přímo.
// Spouští se `npm test` (Node 22 sám odloupne typy). Když spadne, spadne i CI.
import { tierFor } from '../lib/clientSlots.ts';
import { normName, matchByName, sectionTitles } from '../lib/menuPos.ts';
import { contrast, normalizeQrDesign } from '../lib/qrDesign.ts';
import { sanitizeSvg } from '../lib/svgSanitize.ts';
import { batchesNeeded, planFor, recipeUnit, availableOf, taskTitleFor, checklistFor } from '../lib/productionPlan.ts';
import {
  planForSubscription, subscriptionLive, czkToMinor, platformFeeMinor, checkoutLines, linesTotalMinor,
  integrationId, sessionPaid, merchantReady, requirementsDue, periodEndOf, subscriptionIdOfInvoice, idOf, intOf,
} from '../lib/stripeBilling.ts';
import { planInfoOf } from '../lib/plan.ts';

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

// --- Stripe: předplatné, haléře, provize, objednávka (peníze) ---
{
  eq('stripe: active = pro', planForSubscription('active'), 'pro');
  eq('stripe: trialing = pro', planForSubscription('trialing'), 'pro');
  eq('stripe: past_due zůstává pro (Stripe zkouší kartu znovu)', planForSubscription('past_due'), 'pro');
  eq('stripe: canceled = free', planForSubscription('canceled'), 'free');
  eq('stripe: unpaid = free', planForSubscription('unpaid'), 'free');
  eq('stripe: incomplete = free', planForSubscription('incomplete'), 'free');
  eq('stripe: bez stavu = free', planForSubscription(null), 'free');
  eq('stripe: živé předplatné', ['active', 'trialing', 'past_due', 'paused', 'canceled', null].map(subscriptionLive), [true, true, true, true, false, false]);

  eq('stripe: koruny → haléře', czkToMinor(249), 24900);
  eq('stripe: desetinná čárka', czkToMinor('12,50'), 1250);
  eq('stripe: zaokrouhlení haléřů', czkToMinor(0.015), 2);
  eq('stripe: záporné a nesmysl = 0', [czkToMinor(-5), czkToMinor('abc'), czkToMinor(null)], [0, 0, 0]);

  eq('stripe: provize 1,5 % z 10 000 Kč', platformFeeMinor(1000000, 1.5), 15000);
  eq('stripe: provize 0 % = nic', platformFeeMinor(1000000, 0), 0);
  eq('stripe: provize nikdy nad částku', platformFeeMinor(1000, 150), 1000);
  eq('stripe: provize z nesmyslu = 0', [platformFeeMinor(NaN, 5), platformFeeMinor(1000, NaN), platformFeeMinor(-1, 5)], [0, 0, 0]);

  const lines = checkoutLines([
    { name: 'Sencha', price: 85, count: 2 },
    { name: 'Matcha', price: '120', count: '1' },
    { name: 'Nula', price: 0, count: 3 },        // zdarma se do Checkoutu nedává
    { name: 'Bez kusů', price: 50, count: 0 },
    { name: 'Půl', price: 10, count: 1.7 },      // kusy se zaokrouhlí dolů
  ]);
  eq('stripe: položky objednávky → Checkout', lines, [
    { name: 'Sencha', unitAmount: 8500, quantity: 2 },
    { name: 'Matcha', unitAmount: 12000, quantity: 1 },
    { name: 'Půl', unitAmount: 1000, quantity: 1 },
  ]);
  eq('stripe: součet položek v haléřích', linesTotalMinor(lines), 8500 * 2 + 12000 + 1000);
  eq('stripe: prázdné položky', [checkoutLines(null), checkoutLines(undefined), checkoutLines('x' as any)], [[], [], []]);

  const id = integrationId('managero_pro', () => 0);
  eq('stripe: integration_identifier tvar', id, 'managero_pro_aaaaaaaa');
  ok('stripe: integration_identifier náhodná přípona 8 písmen', /^managero_order_[a-z]{8}$/.test(integrationId('managero-order')));

  eq('stripe: zaplacená session', [sessionPaid({ payment_status: 'paid' }), sessionPaid({ payment_status: 'no_payment_required' }), sessionPaid({ payment_status: 'unpaid' }), sessionPaid(null)], [true, true, false, false]);
  eq('stripe: účet připravený = card_payments active', merchantReady({ configuration: { merchant: { capabilities: { card_payments: { status: 'active' } } } } }), true);
  eq('stripe: účet pending není připravený', merchantReady({ configuration: { merchant: { capabilities: { card_payments: { status: 'pending' } } } } }), false);
  eq('stripe: účet bez konfigurace', merchantReady({}), false);
  eq('stripe: požadavky účtu', [requirementsDue({ requirements: { entries: [{}, {}] } }), requirementsDue({})], [2, 0]);

  eq('stripe: konec období z položky (nové API)', periodEndOf({ items: { data: [{ current_period_end: 1700000000 }] } })?.toISOString(), '2023-11-14T22:13:20.000Z');
  eq('stripe: konec období ze starého tvaru', periodEndOf({ current_period_end: 1700000000 })?.toISOString(), '2023-11-14T22:13:20.000Z');
  eq('stripe: konec období chybí', periodEndOf({}), null);
  eq('stripe: předplatné z faktury (nový tvar)', subscriptionIdOfInvoice({ parent: { subscription_details: { subscription: 'sub_1' } } }), 'sub_1');
  eq('stripe: předplatné z faktury (starý tvar, rozbalené)', subscriptionIdOfInvoice({ subscription: { id: 'sub_2' } }), 'sub_2');
  eq('stripe: faktura bez předplatného', subscriptionIdOfInvoice({}), null);
  eq('stripe: idOf', [idOf('cus_1'), idOf({ id: 'cus_2' }), idOf(null)], ['cus_1', 'cus_2', null]);
  eq('stripe: intOf', [intOf('12'), intOf(7), intOf('x'), intOf(0), intOf(undefined)], [12, 7, null, null, null]);

  // Plán podniku vidí živé předplatné; podnik z historie (pro bez Stripe) žádné nemá.
  const now = Date.parse('2026-09-16T12:00:00Z');
  eq('plán: pro s předplatným', planInfoOf({ plan: 'pro', stripe_subscription_status: 'active', stripe_current_period_end: '2026-10-16T00:00:00Z' }, now).subscription, { status: 'active', periodEnd: '2026-10-16T00:00:00.000Z' });
  eq('plán: grandfathered pro bez předplatného', planInfoOf({ plan: 'pro' }, now).subscription, null);
  eq('plán: zrušené předplatné se neukazuje', planInfoOf({ plan: 'free', stripe_subscription_status: 'canceled' }, now).subscription, null);
  eq('plán: chybějící sloupce nevadí', planInfoOf({ plan: 'free', trial_ends_at: null }, now).effective, 'free');
}

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
