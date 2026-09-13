// Malá regresní síť na čistou logiku kolem peněz a napojení na pokladnu.
// Bez frameworku a bez databáze: jen funkce, které se dají zavolat přímo.
// Spouští se `npm test` (Node 22 sám odloupne typy). Když spadne, spadne i CI.
import { tierFor } from '../lib/clientSlots.ts';
import { normName, matchByName, sectionTitles } from '../lib/menuPos.ts';
import { contrast, normalizeQrDesign } from '../lib/qrDesign.ts';

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

if (failed) { console.error(`\n${failed} test(ů) selhalo.`); process.exit(1); }
console.log('\nVšechny testy prošly.');
