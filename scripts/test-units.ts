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
import { okJson, okText, apiMessage, statusMessage, ApiError, isOffline } from '../lib/api.ts';
import { nextActiveId, needsWho, IDLE_MS } from '../lib/kioskIdentity.ts';
import { buildIcs, escapeText, foldLine } from '../lib/ics.ts';
import { recipeCost, ingredientCost, marginPct, costDecimals } from '../lib/recipeCost.ts';
import { printHtml, esc as escHtml } from '../lib/printDoc.ts';
import { escHtml as escMail, usingSandboxSender } from '../lib/email.ts';
import { formatCost } from '../lib/money.ts';
import { reakceNaZavreni, jePsanePole, jeRozepsano } from '../lib/modalClose.ts';
import { maObsah, slouceni, maSeObnovit, liseSeOdPrazdneho } from '../lib/draft.ts';
import { onAccent, staciKontrast, kontrast } from '../lib/floorplan.ts';
import { zkratkyDnu, poradiDne, odsazeniMesice, zacatekTydne } from '../lib/week.ts';
import { denPrichodu, denUzaverky } from '../lib/businessDay.ts';
import { proHledani, obsahuje, obsahujeNekde } from '../lib/hledani.ts';
import { navodyPodlePolozek, navodZRadku, krokyNavodu } from '../lib/navody.ts';
import { parseStep, serializeStep, parseSteps } from '../lib/steps.ts';
import { odkazNaNavod } from '../lib/otevriNavod.ts';
import { normalizujNastaveni, normalizujRoli, smiPrepnout, smiSdiletZamestnance, VYCHOZI_NASTAVENI } from '../lib/organizace.ts';
import { souhrn, podnikyProPrehled, procNejde, hraniceMesice } from '../lib/prehledOrganizace.ts';
import { describe as popisUkolu } from '../lib/productionPlan.ts';
import { superadminIds, isSuperadminId, rozhodniSpravce } from '../lib/superadmin.ts';
import { adminTokenOk, MIN_TOKEN_LENGTH } from '../lib/adminToken.ts';
import { rozhodni } from '../lib/blokace.ts';
import { planInfoOf } from '../lib/plan.ts';
import { pragueMomentOf } from '../lib/pragueTime.ts';

let failed = 0;
// Testy, co musí doběhnout, než se sáhne na návratový kód.
const pending: Promise<unknown>[] = [];
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


// --- Odpověď serveru, která není v pořádku ---
{
  // `fetch` nepadá na HTTP 500; bez tohohle se chybové tělo uloží jako data.
  const res = (status: number, body: unknown): any => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => String(body),
  });

  const run = async () => {
    eq('api: dobrá odpověď projde', await okJson(res(200, { tasks: [1, 2] })), { tasks: [1, 2] });

    let caught: any = null;
    try { await okJson(res(500, { error: 'Databáze nedostupná' })); } catch (e) { caught = e; }
    ok('api: 500 se vyhodí jako chyba', caught instanceof ApiError);
    eq('api: a nese zprávu ze serveru', caught?.message, 'Databáze nedostupná');
    eq('api: i se stavem', caught?.status, 500);

    // Chybová odpověď nemusí být JSON — třeba HTML stránka od proxy.
    caught = null;
    try { await okJson({ ...res(502, null), json: async () => { throw new Error('not json'); } } as any); }
    catch (e) { caught = e; }
    eq('api: nečitelné tělo = obecná věta', caught?.message, statusMessage(502));

    caught = null;
    try { await okJson(res(403, {})); } catch (e) { caught = e; }
    eq('api: 403 mluví o oprávnění', caught?.message, 'Na tohle nemáš oprávnění.');

    eq('api: okText vrátí text', await okText(res(200, '<svg/>')), '<svg/>');
    caught = null;
    try { await okText(res(404, '')); } catch (e) { caught = e; }
    eq('api: okText na 404 spadne', caught?.message, 'Tohle už neexistuje.');
  };

  pending.push(run());

  // Hláška do obrazovky: anglické „Failed to fetch" z prohlížeče nikomu nic neřekne.
  eq('api: výpadek sítě má českou větu',
    apiMessage(new TypeError('Failed to fetch'), 'Úkoly se nenačetly.'), 'Úkoly se nenačetly.');
  eq('api: zpráva ze serveru se ukáže',
    apiMessage(new ApiError(409, 'Směna už je obsazená.')), 'Směna už je obsazená.');
  eq('api: neznámý objekt = záložní věta', apiMessage({}, 'Nepovedlo se.'), 'Nepovedlo se.');
  ok('api: bez odpovědi serveru jsme offline', isOffline(new TypeError('Failed to fetch')));
  ok('api: s odpovědí serveru offline nejsme', !isOffline(new ApiError(500, 'x')));
}


// --- Kdo se zapisuje na sdíleném tabletu ---
{
  const N = (prev: number | null, onShift: number[], idleFor = 0) =>
    nextActiveId({ prev, onShift, idleFor });

  // Tohle je ta chyba, kvůli které kolo vzniklo: Anně (1) skončila směna
  // a tablet se tiše stal Bobem (2), prvním v rozpisu.
  eq('kiosk: po odchodu vybraného se nesáhne po náhradníkovi', N(1, [2, 3]), null);
  eq('kiosk: vybraný na směně zůstává', N(2, [2, 3]), 2);

  // Jeden člověk na směně odhad není.
  eq('kiosk: jediný na směně se vybere sám', N(null, [7]), 7);
  eq('kiosk: a přebije i cizí uloženou volbu', N(99, [7]), 7);
  eq('kiosk: nikdo na směně = nikdo', N(5, []), null);

  // Jméno drží jen proto, že na tablet nikdo nesáhl.
  eq('kiosk: po nečinnosti se jméno pustí', N(2, [2, 3], IDLE_MS + 1000), null);
  eq('kiosk: těsně pod prahem drží', N(2, [2, 3], IDLE_MS - 1000), 2);
  eq('kiosk: u jediného člověka nečinnost nevadí', N(7, [7], IDLE_MS * 10), 7);

  // Volá se po každé změně rozpisu i v tiku nečinnosti — dvakrát po sobě
  // musí dát totéž, jinak by se obrazovka přepínala sama se sebou.
  eq('kiosk: rozhodnutí je idempotentní', N(N(1, [2, 3]), [2, 3]), null);

  ok('kiosk: bez jména a s lidmi na směně se ptáme', needsWho(null, [2, 3]));
  ok('kiosk: se jménem se neptáme', !needsWho(2, [2, 3]));
  ok('kiosk: prázdná směna není otázka', !needsWho(null, []));
}

// --- Soubor do kalendáře (lib/ics) ---
{
  const NOW = new Date('2026-09-18T02:30:00.000Z');
  const has = (ics: string, line: string) => ics.split('\r\n').includes(line);

  const smena = buildIcs([{
    uid: 'managero-shift-7@managero',
    date: '2026-09-20',
    startTime: '08:00',
    endTime: '16:00',
    summary: 'Ranní — Managero',
  }], '-//Managero//Smeny//CS', NOW);

  // Bez `DTSTAMP` Outlook a Exchange soubor odmítnou — člověk klikne
  // na „Do kalendáře" a nestane se nic.
  ok('ics: událost má DTSTAMP', has(smena, 'DTSTAMP:20260918T023000Z'));
  ok('ics: DTSTAMP je v UTC', /DTSTAMP:\d{8}T\d{6}Z/.test(smena));

  // `TZID` bez popisu pásma je jen nápis: klient, co Prahu nezná, ukáže
  // ranní směnu o dvě hodiny jinde.
  ok('ics: pásmo je popsané', has(smena, 'BEGIN:VTIMEZONE') && has(smena, 'TZID:Europe/Prague'));
  ok('ics: a má obě poloviny roku', has(smena, 'TZNAME:CEST') && has(smena, 'TZNAME:CET'));
  ok('ics: začátek se na pásmo odkazuje', has(smena, 'DTSTART;TZID=Europe/Prague:20260920T080000'));
  ok('ics: konec taky', has(smena, 'DTEND;TZID=Europe/Prague:20260920T160000'));
  ok('ics: soubor končí správně', smena.endsWith('END:VCALENDAR\r\n'));
  ok('ics: řádky oddělují CRLF', smena.includes('\r\n') && !/[^\r]\n/.test(smena));

  // Čárka v názvu akce dřív rozdělila vlastnost na dvě a událost se rozsypala.
  const akce = buildIcs([{
    uid: 'e1', date: '2026-10-03', startTime: '18:00', endTime: '22:00',
    summary: 'Degustace, ročník 2019',
    location: 'Hlavní 5; vchod ze dvora',
    description: 'Přijďte\nv 18:00',
  }], '-//Managero//Akce//CS', NOW);
  ok('ics: čárka v názvu se ošetří', has(akce, 'SUMMARY:Degustace\\, ročník 2019'));
  ok('ics: středník v adrese taky', has(akce, 'LOCATION:Hlavní 5\\; vchod ze dvora'));
  ok('ics: nový řádek se nepromítne do souboru', has(akce, 'DESCRIPTION:Přijďte\\nv 18:00'));
  eq('ics: zpětné lomítko se zdvojí', escapeText('C:\\cesta'), 'C:\\\\cesta');

  // Celodenní: konec je nevýlučný, musí to být den následující.
  const cely = buildIcs([{ uid: 'e2', date: '2026-12-31', summary: 'Silvestr' }], '-//x//CS', NOW);
  ok('ics: celodenní má DTSTART jako datum', has(cely, 'DTSTART;VALUE=DATE:20261231'));
  ok('ics: a končí dalším dnem, i přes rok', has(cely, 'DTEND;VALUE=DATE:20270101'));

  // Konec před začátkem by kalendář nakreslil pozpátku.
  const pozpatku = buildIcs([{ uid: 'e3', date: '2026-05-05', startTime: '22:00', endTime: '06:00', summary: 'Noční' }], '-//x//CS', NOW);
  ok('ics: konec před začátkem se vynechá', !pozpatku.includes('DTEND;TZID'));
  ok('ics: začátek zůstane', has(pozpatku, 'DTSTART;TZID=Europe/Prague:20260505T220000'));

  // Nepoužitelné datum by jen rozbilo soubor.
  const spatne = buildIcs([{ uid: 'e4', date: 'zítra', summary: 'Nic' }], '-//x//CS', NOW);
  ok('ics: událost bez data se vynechá', !spatne.includes('BEGIN:VEVENT'));
  ok('ics: a soubor zůstane platný', has(spatne, 'BEGIN:VCALENDAR') && has(spatne, 'END:VCALENDAR'));

  // Zalomení na 75 oktetů: měří se bajty UTF-8, ne znaky.
  const dlouhy = 'DESCRIPTION:' + 'ě'.repeat(200);
  const zalomeny = foldLine(dlouhy);
  const bytesOf = (t: string) => new TextEncoder().encode(t).length;
  ok('ics: dlouhý řádek se zalomil', zalomeny.includes('\r\n '));
  ok('ics: žádný kus nepřeleze 75 oktetů',
    zalomeny.split('\r\n').every(l => bytesOf(l) <= 75));
  ok('ics: pokračování začíná mezerou',
    zalomeny.split('\r\n').slice(1).every(l => l.startsWith(' ')));
  eq('ics: po slepení zpět je to původní řádek', zalomeny.split('\r\n ').join(''), dlouhy);
  eq('ics: krátký řádek se nesahá', foldLine('SUMMARY:Směna'), 'SUMMARY:Směna');
}

// --- Cena receptury na porci (lib/recipeCost) ---
{
  // Pět gramů cukru z kilového balení za 25 Kč. Dvanáct haléřů — ne nula.
  eq('receptura: cukr po pěti gramech', ingredientCost(25, 1, 0.005), 0.125);
  // Kusovka nemá velikost balení: cena položky je rovnou cena za kus.
  eq('receptura: kusovka se násobí rovnou', ingredientCost(2, 0, 3), 6);
  eq('receptura: bez ceny je to nula', ingredientCost(0, 1, 0.5), 0);
  eq('receptura: bez množství taky', ingredientCost(25, 1, 0), 0);

  // Tohle je ta chyba, kvůli které kolo vzniklo: čtyři levné suroviny,
  // každá zaokrouhlená zvlášť na nulu, daly nápoj zadarmo.
  const ctyriLevne = [
    { unitCost: 40, packageSize: 1, amount: 0.01 },  // 0,40
    { unitCost: 40, packageSize: 1, amount: 0.01 },  // 0,40
    { unitCost: 40, packageSize: 1, amount: 0.01 },  // 0,40
    { unitCost: 40, packageSize: 1, amount: 0.01 },  // 0,40
  ];
  eq('receptura: levné suroviny se nesčítají do nuly', recipeCost(ctyriLevne).total, 2);
  eq('receptura: a přesný součet zůstává přesný', Math.round(recipeCost(ctyriLevne).exact * 100) / 100, 1.6);

  // A opačný směr: každá 1,50 zaokrouhlená nahoru dělala z šesti osm.
  const ctyriPulky = Array.from({ length: 4 }, () => ({ unitCost: 150, packageSize: 100, amount: 1 }));
  eq('receptura: ani se nenafouknou nahoru', recipeCost(ctyriPulky).total, 6);

  // Surovina bez ceny je díra v součtu, ne nula.
  const sDirou = [
    { unitCost: 250, packageSize: 1, amount: 0.02 },
    { unitCost: 0, packageSize: 1, amount: 0.01 },
  ];
  eq('receptura: chybějící cena se počítá zvlášť', recipeCost(sDirou).missingPrice, 1);
  eq('receptura: a součet je jen z toho, co cenu má', recipeCost(sDirou).total, 5);
  eq('receptura: množství nula není chybějící cena',
    recipeCost([{ unitCost: 0, packageSize: 1, amount: 0 }]).missingPrice, 0);

  // Marže se počítá z nezaokrouhleného nákladu.
  eq('receptura: marže z ceny a nákladu', marginPct(100, 35), 65);
  eq('receptura: bez ceny se marže nepočítá', marginPct(null, 35), null);
  eq('receptura: nulová cena taky ne', marginPct(0, 35), null);
  eq('receptura: náklad nad cenou dá zápornou marži', marginPct(50, 75), -50);

  // Zobrazení: haléře musí být vidět, jinak je to zase nula.
  eq('receptura: setiny pod korunou', costDecimals(0.125), 2);
  eq('receptura: desetiny pod desítkou', costDecimals(5.5), 1);
  eq('receptura: celé nad deset', costDecimals(42), 0);
  eq('receptura: nula je nula', costDecimals(0), 0);
  eq('měna: haléře se vypíšou', formatCost(0.125, 'CZK', 'cs-CZ').replace(/\s/g, ' '), '0,13 Kč');
  eq('měna: velké číslo zůstává celé', formatCost(1250, 'CZK', 'cs-CZ').replace(/\s/g, ' '), '1 250 Kč');
}

// --- Papír (lib/printDoc) ---
{
  const NOW = new Date('2026-09-18T03:30:00.000Z');
  const doc = printHtml({
    title: 'Nákupní seznam',
    subtitle: '3 položky',
    body: '<table><tbody><tr><td>Mléko</td></tr></tbody></table>',
    business: 'Café U Nás',
  }, NOW);

  ok('tisk: je to celý dokument', doc.startsWith('<!doctype html>') && doc.trim().endsWith('</html>'));
  ok('tisk: má český jazyk', doc.includes('<html lang="cs">'));
  // Papír nemá stav: bez razítka za dva dny nikdo neví, jestli je aktuální.
  ok('tisk: v patičce je podnik i čas', doc.includes('Café U Nás') && doc.includes('vytištěno'));
  // Tiskárna v kavárně je černobílá a stránka se láme.
  ok('tisk: stránka je A4', doc.includes('@page') && doc.includes('A4'));
  ok('tisk: hlavička tabulky se opakuje', doc.includes('thead { display: table-header-group'));
  ok('tisk: řádek se neláme vejpůl', doc.includes('page-break-inside: avoid'));

  // „R&D" se dřív rozpadlo na entitu, protože se escapovalo jen `<`.
  eq('tisk: ampersand se ošetří', escHtml('R&D'), 'R&amp;D');
  eq('tisk: špičaté závorky taky', escHtml('<script>'), '&lt;script&gt;');
  eq('tisk: uvozovky do atributů', escHtml('20" pult'), '20&quot; pult');
  eq('tisk: nic není prázdný řetězec', escHtml(null), '');
  ok('tisk: název z dat se neprovede',
    printHtml({ title: '<img src=x onerror=alert(1)>', body: '' }, NOW).includes('&lt;img'));
}

// --- E-mail (lib/email) ---
{
  // Do šablony se dřív vkládala jména syrová: „Café <U Nás>" rozbilo HTML.
  eq('e-mail: špičaté závorky se ošetří', escMail('Café <U Nás>'), 'Café &lt;U Nás&gt;');
  eq('e-mail: ampersand taky', escMail('Sirup R&D'), 'Sirup R&amp;D');
  eq('e-mail: uvozovky do atributů', escMail('20" pult'), '20&quot; pult');
  eq('e-mail: nic je prázdný řetězec', escMail(undefined), '');

  // Bez `EMAIL_FROM` se posílá zkušební adresou Resendu. To u pozvánky
  // projde, ale objednávka dodavateli tak nedojde — volající to má vědět.
  const puvodni = process.env.EMAIL_FROM;
  delete process.env.EMAIL_FROM;
  ok('e-mail: bez EMAIL_FROM jedeme na zkušební adresu', usingSandboxSender());
  process.env.EMAIL_FROM = 'objednavky@kavarna.cz';
  ok('e-mail: s EMAIL_FROM už ne', !usingSandboxSender());
  process.env.EMAIL_FROM = '   ';
  ok('e-mail: samá mezera se nepočítá', usingSandboxSender());
  if (puvodni === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = puvodni;
}

// —— Zavírání oken ——————————————————————————————————————————————
{
  // Prázdné okno se zavře, ať se o to uživatel pokusí jakkoli.
  for (const zpusob of ['uklepnuti', 'zavrit', 'zahodit'] as const)
    eq(`okno: prázdné se zavře (${zpusob})`, reakceNaZavreni({ rozepsano: false, ptameSe: false, zpusob }), 'zavrit');

  // Rozepsané okno se na uklepnutí a na křížek zeptá.
  eq('okno: Escape u rozepsaného se zeptá', reakceNaZavreni({ rozepsano: true, ptameSe: false, zpusob: 'uklepnuti' }), 'zeptat se');
  eq('okno: křížek u rozepsaného se zeptá', reakceNaZavreni({ rozepsano: true, ptameSe: false, zpusob: 'zavrit' }), 'zeptat se');
  // Na tlačítku Zrušit je napsané, co dělá. Ptát se podruhé je práce navíc.
  eq('okno: Zrušit se neptá', reakceNaZavreni({ rozepsano: true, ptameSe: false, zpusob: 'zahodit' }), 'zavrit');

  // Druhý Escape nad otázkou nesmí zahodit to, na co se okno právě ptá.
  eq('okno: Escape nad otázkou vrací k úpravám', reakceNaZavreni({ rozepsano: true, ptameSe: true, zpusob: 'uklepnuti' }), 'zpet k upravam');
  eq('okno: křížek nad otázkou taky', reakceNaZavreni({ rozepsano: true, ptameSe: true, zpusob: 'zavrit' }), 'zpet k upravam');
  eq('okno: Zahodit nad otázkou zavře', reakceNaZavreni({ rozepsano: true, ptameSe: true, zpusob: 'zahodit' }), 'zavrit');

  // Co se počítá jako psaný text.
  ok('okno: textarea je psané pole', jePsanePole('TEXTAREA'));
  ok('okno: input bez typu taky', jePsanePole('input', ''));
  ok('okno: input type=text', jePsanePole('INPUT', 'text'));
  ok('okno: input type=number', jePsanePole('INPUT', 'number'));
  // Hledání je filtr, ne obsah — a zaškrtávátko se ukládá hned při kliknutí.
  ok('okno: hledání se nepočítá', !jePsanePole('INPUT', 'search'));
  ok('okno: zaškrtávátko se nepočítá', !jePsanePole('INPUT', 'checkbox'));
  ok('okno: přepínač se nepočítá', !jePsanePole('INPUT', 'radio'));
  ok('okno: výběr z nabídky se nepočítá', !jePsanePole('SELECT'));
  ok('okno: soubor se nepočítá', !jePsanePole('INPUT', 'file'));

  // Napsat a zase smazat není ztráta.
  ok('okno: prázdná pole nejsou rozepsaná', !jeRozepsano(['', '   ', null, undefined]));
  ok('okno: jedno vyplněné stačí', jeRozepsano(['', 'Ranní směna má nový postup']));
}

// —— Rozepsaný formulář ————————————————————————————————————————
{
  // Co se počítá za „je co zachraňovat".
  ok('koncept: prázdný formulář nic nenese', !maObsah({ nazev: '', popis: '   ', body: [] }));
  ok('koncept: jedno vyplněné pole stačí', maObsah({ nazev: '', popis: 'Umýt okna' }));
  ok('koncept: text v seznamu se počítá', maObsah({ kroky: ['', 'Zalít konvici'] }));
  ok('koncept: nula ani false nejsou obsah', !maObsah({ pocet: 0, hotovo: false }));

  // Uložený koncept se skládá na výchozí tvar, ne naopak — formulář se
  // mezitím mohl změnit a koncept o tom neví.
  const vychozi = { nazev: '', popis: '', priorita: 'normal', kroky: [] as string[] };
  eq('koncept: přebírá jen známé klíče',
    slouceni(vychozi, { nazev: 'Umýt okna', neznamy: 'smetí' }),
    { nazev: 'Umýt okna', popis: '', priorita: 'normal', kroky: [] });
  eq('koncept: nesedící typ propadne',
    slouceni(vychozi, { nazev: 42, popis: 'ok' }),
    { nazev: '', popis: 'ok', priorita: 'normal', kroky: [] });
  eq('koncept: pole vs. text se nezamění',
    slouceni(vychozi, { kroky: 'tohle není pole' }),
    { nazev: '', popis: '', priorita: 'normal', kroky: [] });
  eq('koncept: nesmysl místo objektu vrací výchozí', slouceni(vychozi, 'rozbité'), vychozi);
  eq('koncept: null vrací výchozí', slouceni(vychozi, null), vychozi);

  // Výchozí hodnota není rozepsaný text. První verze se ptala jen na obsah,
  // takže formulář s předvolenou prioritou vypadal rozepsaně navždycky
  // a v úložišti zůstával prázdný koncept. Chytila to sonda, ne úvaha.
  ok('koncept: předvolená hodnota se nepočítá za rozepsané',
    !liseSeOdPrazdneho({ ...vychozi }, vychozi));
  ok('koncept: vyplněné pole se počítá',
    liseSeOdPrazdneho({ ...vychozi, nazev: 'Umýt okna' }, vychozi));
  ok('koncept: změna předvolby se počítá',
    liseSeOdPrazdneho({ ...vychozi, priorita: 'high' }, vychozi));
  ok('koncept: neznámý klíč navíc se nepočítá',
    !liseSeOdPrazdneho({ ...vychozi, smetí: 'x' }, vychozi));

  // Kdy se obnovuje.
  ok('koncept: obnoví se, když něco nese',
    maSeObnovit({ upravujeSe: false, ulozeny: { nazev: 'Umýt okna' }, vychozi }));
  ok('koncept: při úpravě existujícího záznamu nikdy',
    !maSeObnovit({ upravujeSe: true, ulozeny: { nazev: 'Umýt okna' }, vychozi }));
  ok('koncept: prázdný se neobnovuje',
    !maSeObnovit({ upravujeSe: false, ulozeny: { nazev: '  ' }, vychozi }));
  // Předvyplnit formulář tím, co v něm stejně bylo, je hláška o ničem.
  ok('koncept: shodný s prázdným formulářem se neobnovuje',
    !maSeObnovit({ upravujeSe: false, ulozeny: { ...vychozi }, vychozi }));
  ok('koncept: koncept jen s neznámými klíči se neobnovuje',
    !maSeObnovit({ upravujeSe: false, ulozeny: { zruseno: 'x' }, vychozi }));
}

// ---- Text na barvě značky podniku ----------------------------------------
// Barvu si podnik volí sám v Nastavení → Vzhled, takže projít musí celý
// barevný prostor, ne jen naše limetka. Dřív o inkoustu rozhodoval vnímaný
// jas (BT.601, práh 150) a na 28 % barev vyšel text pod 4,5:1.
{
  const slozky = (h: string): [number, number, number] =>
    [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const pomer = (h: string) => kontrast(slozky(onAccent(h)), slozky(h));

  // Barvy, které stará heuristika pokazila — u každé je uvedeno, co dávala.
  for (const [barva, drive] of [['#F97316', '2,80:1'], ['#14B8A6', '2,49:1'], ['#00FF00', '1,37:1'],
    ['#16A34A', '3,30:1'], ['#EC4899', '3,53:1'], ['#0A84FF', '3,65:1']] as const) {
    ok(`barva značky ${barva}: text nad 4,5:1 (dřív ${drive})`, pomer(barva) >= 4.5);
  }

  // Značková limetka a tmavý inkoust musí zůstat, jak byly.
  eq('barva značky: na limetce zůstává tmavý inkoust', onAccent('#C8F542'), '#16181A');
  eq('barva značky: na tmavé zůstává bílá', onAccent('#16181A'), '#FFFFFF');

  // Nesmyslný nebo chybějící vstup nesmí shodit stránku hosta.
  eq('barva značky: prázdná hodnota dá tmavý inkoust', onAccent(''), '#16181A');
  eq('barva značky: null dá tmavý inkoust', onAccent(null), '#16181A');
  eq('barva značky: nesmysl dá tmavý inkoust', onAccent('zelená'), '#16181A');

  // Žádná barva se nesmí dostat pod 3:1 — to je práh i pro velký text.
  let nejhorsi = 99, kde = '';
  for (let r = 0; r < 256; r += 15) for (let g = 0; g < 256; g += 15) for (let b = 0; b < 256; b += 15) {
    const h = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    const p2 = pomer(h);
    if (p2 < nejhorsi) { nejhorsi = p2; kde = h; }
  }
  ok(`barva značky: nejhorší z celého prostoru je ${nejhorsi.toFixed(2)}:1 (${kde}), nad 3:1`, nejhorsi >= 3);

  // Varování podniku sedí s tím, co se dá dosáhnout.
  ok('barva značky: limetka nepotřebuje varovat', staciKontrast('#C8F542'));
  ok('barva značky: purpurová #DC14C8 varuje (nejlepší možné 4,22:1)', !staciKontrast('#DC14C8'));
}

// ---- Začátek týdne -------------------------------------------------------
// Podnik si volí, jestli mu týden začíná pondělím, nebo nedělí. Rozvrh
// a dostupnost to dřív ignorovaly a kreslily vždycky od pondělí, zatímco
// kalendáře vedle nastavení ctily.
{
  eq('týden: hlavička od pondělí', zkratkyDnu(1), ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne']);
  eq('týden: hlavička od neděle', zkratkyDnu(0), ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So']);

  // 2026-09-14 je pondělí, 2026-09-20 neděle.
  eq('týden: pondělí je při pondělním začátku první', poradiDne('2026-09-14', 1), 0);
  eq('týden: neděle je při pondělním začátku poslední', poradiDne('2026-09-20', 1), 6);
  eq('týden: neděle je při nedělním začátku první', poradiDne('2026-09-20', 0), 0);
  eq('týden: pondělí je při nedělním začátku druhé', poradiDne('2026-09-14', 0), 1);

  // Odsazení měsíce: 1. 9. 2026 je úterý.
  eq('týden: odsazení září 2026 při pondělním začátku', odsazeniMesice('2026-09-01', 1), 1);
  eq('týden: odsazení září 2026 při nedělním začátku', odsazeniMesice('2026-09-01', 0), 2);

  // Hodnota z databáze bývá i null nebo řetězec.
  eq('týden: chybějící nastavení znamená pondělí', zacatekTydne(null), 1);
  eq('týden: nula znamená neděli', zacatekTydne(0), 0);
  eq('týden: „0" z databáze znamená neděli', zacatekTydne('0'), 0);
  eq('týden: nesmysl znamená pondělí', zacatekTydne('kdykoliv'), 1);

  // Příchod po půlnoci. 2026-09-19 je sobota, 20. neděle, 21. pondělí.
  const v = (den: string, hm: string) => pragueMomentOf(den, hm)!;
  const bar = { open: '20:00', close: '02:00', closed: false };
  eq('příchod: sobotní bar, klepnuto v neděli 0:20 → patří sobotě',
    denPrichodu({ at: v('2026-09-20', '00:20'), otevrenoVcera: bar }), '2026-09-19');
  eq('příchod: v sobotu zavřeno → neděle zůstane nedělí',
    denPrichodu({ at: v('2026-09-20', '00:20'), otevrenoVcera: { ...bar, closed: true } }), '2026-09-20');
  eq('příchod: bez otevírací doby i bez směn → kalendářní den',
    denPrichodu({ at: v('2026-09-20', '00:20') }), '2026-09-20');
  eq('příchod: pekárna otevřená 6–18, pekař přijde v úterý ve 4:00 → úterý, ne pondělí',
    denPrichodu({ at: v('2026-09-22', '04:00'), otevrenoVcera: { open: '06:00', close: '18:00', closed: false } }), '2026-09-22');
  eq('příchod: podnik zavírá 23:30 (ne přes půlnoc) → 0:20 je už dnešek',
    denPrichodu({ at: v('2026-09-20', '00:20'), otevrenoVcera: { open: '10:00', close: '23:30', closed: false } }), '2026-09-20');
  eq('příchod: plánovaná sobotní směna 18–02 pokrývá 0:20 → sobota i bez otevírací doby',
    denPrichodu({ at: v('2026-09-20', '00:20'), smenyVcera: [{ start_time: '18:00', end_time: '02:00' }] }), '2026-09-19');
  eq('příchod: sobotní ranní směna 8–16 už dávno skončila → neděle',
    denPrichodu({ at: v('2026-09-20', '00:20'), smenyVcera: [{ start_time: '08:00', end_time: '16:00' }] }), '2026-09-20');
  eq('příchod: sobota 21:00 se nikdy nepřesune na pátek, i když pátek zavíral po půlnoci',
    denPrichodu({ at: v('2026-09-19', '21:00'), otevrenoVcera: bar }), '2026-09-19');
  eq('příchod: tolerance na úklid — 4:59 po zavíračce ve 2:00 je ještě sobota',
    denPrichodu({ at: v('2026-09-20', '04:59'), otevrenoVcera: bar }), '2026-09-19');
  eq('příchod: 5:01 už je za tolerancí → neděle',
    denPrichodu({ at: v('2026-09-20', '05:01'), otevrenoVcera: bar }), '2026-09-20');
  eq('příchod: směna má přednost před otevírací dobou (ranní směna, ale bar otevřený) → řídí se otevírací dobou až po směně',
    denPrichodu({ at: v('2026-09-20', '00:20'), smenyVcera: [{ start_time: '08:00', end_time: '16:00' }], otevrenoVcera: bar }), '2026-09-19');

  // ---- Uzávěrka: ke kterému dni patří -------------------------------------
  // Formulář posílá datum vždy (má pole s hodnotou). „Neděle" v poli deset
  // minut po půlnoci je hodina na zdi, ne odpracovaný den.
  const sobotniBar = { open: '16:00', close: '00:00', closed: false };
  eq('uzávěrka: sobotní směna 16–23, zavírá 0:20 v neděli, v poli „dnes" → sobota',
    denUzaverky('2026-09-20', { at: v('2026-09-20', '00:20'), smenyVcera: [{ start_time: '16:00', end_time: '23:00' }] }), '2026-09-19');
  eq('uzávěrka: totéž bez směny, ale bar měl v sobotu do půlnoci → sobota',
    denUzaverky('2026-09-20', { at: v('2026-09-20', '00:20'), otevrenoVcera: sobotniBar }), '2026-09-19');
  eq('uzávěrka: v neděli 0:20, ale v sobotu zavřeno a žádná směna → neděle (nemáme co přebít)',
    denUzaverky('2026-09-20', { at: v('2026-09-20', '00:20'), otevrenoVcera: { ...sobotniBar, closed: true } }), '2026-09-20');
  eq('uzávěrka: vedení doplňuje starý den → zvolené datum se respektuje',
    denUzaverky('2026-09-12', { at: v('2026-09-20', '14:00'), smenyVcera: [{ start_time: '16:00', end_time: '23:00' }] }), '2026-09-12');
  eq('uzávěrka: zaměstnanec si vybral včerejší směnu ze seznamu → včera, bez hádání',
    denUzaverky('2026-09-19', { at: v('2026-09-20', '00:20') }), '2026-09-19');
  eq('uzávěrka: bez data → totéž pravidlo jako příchod',
    denUzaverky(null, { at: v('2026-09-20', '00:20'), smenyVcera: [{ start_time: '18:00', end_time: '02:00' }] }), '2026-09-19');
  eq('uzávěrka: nesmysl v poli data se ignoruje, ne spadne',
    denUzaverky('včera', { at: v('2026-09-20', '14:00') }), '2026-09-20');
  eq('uzávěrka: sobotní ranní 8–16, zavírá v neděli 0:20 → to už je neděle (směna dávno skončila)',
    denUzaverky('2026-09-20', { at: v('2026-09-20', '00:20'), smenyVcera: [{ start_time: '08:00', end_time: '16:00' }] }), '2026-09-20');
  eq('uzávěrka: ve 14:00 v neděli s pondělkem v poli (budoucnost) → dnes; budoucnost hlídá server zvlášť',
    denUzaverky('2026-09-21', { at: v('2026-09-20', '14:00') }), '2026-09-20');

  // Hledání bez diakritiky — přesně ten případ ze Skladu.
  eq('hledání: „mraz" najde „Mražená malina"', obsahuje('Mražená malina', 'mraz'), true);
  eq('hledání: „mraž" taky najde (diakritika na obou stranách)', obsahuje('Mrazena malina', 'mraž'), true);
  eq('hledání: „cerstve" najde „Čerstvé"', obsahuje('Čerstvé', 'cerstve'), true);
  eq('hledání: „dzem" najde „Džem"', obsahuje('Džem', 'dzem'), true);
  eq('hledání: „RIZEK" najde „řízek" (velikost písmen)', obsahuje('řízek', 'RIZEK'), true);
  eq('hledání: co tam není, se nenajde', obsahuje('Mražená malina', 'bramboro'), false);
  eq('hledání: prázdný dotaz projde vším', obsahuje('cokoliv', '   '), true);
  eq('hledání: chybějící text nenajde nic', obsahuje(null, 'mraz'), false);
  eq('hledání: normalizace je idempotentní', proHledani(proHledani(' Mražená ')), 'mrazena');
  eq('hledání: ch zůstává dvě písmena', obsahuje('Chléb', 'chl'), true);
  eq('hledání: přes víc polí — trefa ve druhém', obsahujeNekde('makro', 'Mléko', 'Makro s.r.o.'), true);
  eq('hledání: přes víc polí — nikde', obsahujeNekde('lidl', 'Mléko', 'Makro s.r.o.'), false);
  eq('hledání: přes víc polí — prázdné pole nevadí', obsahujeNekde('mleko', 'Mléko', null, undefined), true);

  // ---- Návod připnutý ke skladové položce -------------------------------
  // Postup výroby se dřív psal jako holý text k položce. Vazba na návod
  // rozhoduje o tom, co uvidí obsluha v úkolu „Vyrobit X" — takže když se
  // tahle logika splete, pracuje se podle špatného postupu.
  eq('návod: řádek bez item_id se ignoruje',
    navodyPodlePolozek([{ id: 1, title: 'A', checklist: [], item_id: null }]).size, 0);
  eq('návod: kroky se normalizují ze starého pole řetězců',
    krokyNavodu(navodZRadku({ id: 1, title: 'A', checklist: ['Uvařit', ' Stočit '] })), ['Uvařit', 'Stočit']);
  eq('návod: checklist uložený jako text projde taky',
    krokyNavodu(navodZRadku({ id: 1, title: 'A', checklist: '[{"text":"Uvařit"}]' })), ['Uvařit']);
  eq('návod: rozbitý JSON nespadne, jen nemá kroky',
    krokyNavodu(navodZRadku({ id: 1, title: 'A', checklist: '{nevalidní' })), []);
  eq('návod: prázdný krok se zahodí',
    krokyNavodu(navodZRadku({ id: 1, title: 'A', checklist: [{ text: 'Uvařit' }, { text: '   ' }] })), ['Uvařit']);
  {
    // Dva návody na jednu položku: vyhrát musí schválený. Nepotvrzený návrh
    // od zaměstnance nesmí obsluze přebít postup, který vedení schválilo.
    const m = navodyPodlePolozek([
      { id: 5, title: 'Návrh', checklist: [], item_id: 3, approved: false },
      { id: 9, title: 'Schválený', checklist: [], item_id: 3, approved: true },
    ]);
    eq('návod: schválený bije nepotvrzený návrh', m.get(3)?.title, 'Schválený');
  }
  {
    // Mezi stejně schválenými rozhoduje nižší id — ten, co tam byl dřív.
    const m = navodyPodlePolozek([
      { id: 9, title: 'Novější', checklist: [], item_id: 3, approved: true },
      { id: 5, title: 'Starší', checklist: [], item_id: 3, approved: true },
    ]);
    eq('návod: mezi schválenými vyhraje starší', m.get(3)?.title, 'Starší');
  }
  {
    const m = navodyPodlePolozek([
      { id: 1, title: 'Limonáda', checklist: [{ text: 'Svařit' }], item_id: 4 },
      { id: 2, title: 'Ice tea', checklist: [], item_id: 7 },
    ]);
    eq('návod: dvě položky, dva návody', m.size, 2);
    eq('návod: kroky dojdou ke správné položce', krokyNavodu(m.get(4)), ['Svařit']);
  }

  // ---- Krok postupu s návodem -------------------------------------------
  // `guideId` se přidával do modelu, který v databázi leží jako JSON u stovek
  // postupů. Když se zpětná kompatibilita rozbije, přijdou lidi o kroky.
  eq('krok: starý prostý řetězec projde beze změny',
    parseStep('Vyčistit kávovar').guideId, null);
  eq('krok: bez návodu se pořád serializuje jako holý řetězec',
    serializeStep(parseStep('Vyčistit kávovar')), 'Vyčistit kávovar');
  eq('krok: s návodem už musí být objekt',
    (serializeStep(parseStep({ text: 'Vyčistit kávovar', guideId: 7 })) as any).guideId, 7);
  eq('krok: návod přežije kolečko tam a zpět',
    parseStep(serializeStep(parseStep({ text: 'X', guideId: 7 }))).guideId, 7);
  eq('krok: nesmysl místo id se zahodí (nula, záporné, text)',
    [parseStep({ text: 'X', guideId: 0 }).guideId,
     parseStep({ text: 'X', guideId: -3 }).guideId,
     parseStep({ text: 'X', guideId: 'abc' }).guideId], [null, null, null]);
  eq('krok: desetinné id se zaokrouhlí, ne zahodí',
    parseStep({ text: 'X', guideId: 7.4 }).guideId, 7);
  eq('krok: ostatní pole zůstanou, když přibude návod',
    (() => { const s2 = serializeStep(parseStep({ text: 'X', minutes: 5, weight: 'key', guideId: 2 })) as any;
      return [s2.minutes, s2.weight, s2.guideId]; })(), [5, 'key', 2]);
  eq('krok: prázdný text vypadne i s návodem',
    parseSteps([{ text: '  ', guideId: 3 }, { text: 'Zůstane' }]).length, 1);

  // ---- Kam vede „Otevřít návod" ------------------------------------------
  // Špatná cesta by obsluhu poslala do cizí části aplikace.
  eq('odkaz: vedení', odkazNaNavod('/employer/overview', 12), '/employer/overview?view=guides&guide=12');
  eq('odkaz: zaměstnanec', odkazNaNavod('/employee/shifts', 12), '/employee/shifts?view=guides&guide=12');
  eq('odkaz: tablet odkazem nejde — řeší si to sám', odkazNaNavod('/kiosk', 12), null);
  eq('odkaz: neznámá cesta radši nic', odkazNaNavod('/', 12), null);

  // ---- Organizace nad podniky --------------------------------------------
  // Kdo smí přepnout kam, rozhoduje o tom, čí data člověk uvidí.
  eq('organizace: prázdné nastavení → výchozí', normalizujNastaveni(null), VYCHOZI_NASTAVENI);
  eq('organizace: neznámá fakturace → per_team', normalizujNastaveni({ fakturace: 'ročně' }).fakturace, 'per_team');
  eq('organizace: per_org projde', normalizujNastaveni({ fakturace: 'per_org' }).fakturace, 'per_org');
  eq('organizace: řetězec místo booleanu se ignoruje', normalizujNastaveni({ sdileniLidi: 'ano' }).sdileniLidi, true);
  eq('organizace: false zůstane false', normalizujNastaveni({ konsolidovanyPrehled: false }).konsolidovanyPrehled, false);
  eq('organizace: role — cokoli kromě employer je employee', [normalizujRoli('employer'), normalizujRoli('kiosk'), normalizujRoli(undefined)], ['employer', 'employee', 'employee']);
  {
    const cl = [
      { teamId: 1, role: 'employer' as const, teamName: 'Kavárna A', organizationId: 9 },
      { teamId: 2, role: 'employee' as const, teamName: 'Kavárna B', organizationId: 9 },
    ];
    eq('organizace: přepnout na podnik, kde jsem členem → ano, s rolí toho členství', smiPrepnout(cl, 2)?.role, 'employee');
    eq('organizace: přepnout na cizí podnik → ne (ani vlastník organizace)', smiPrepnout(cl, 3), null);
  }
  eq('organizace: vedení sdílet jde vždy', smiSdiletZamestnance({ ...VYCHOZI_NASTAVENI, sdileniLidi: false }, 'employer'), true);
  eq('organizace: zaměstnanec jen se zapnutým sdílením', smiSdiletZamestnance({ ...VYCHOZI_NASTAVENI, sdileniLidi: false }, 'employee'), false);
  eq('organizace: zaměstnanec se zapnutým sdílením ano', smiSdiletZamestnance(VYCHOZI_NASTAVENI, 'employee'), true);

  // ---- Konsolidovaný přehled ---------------------------------------------
  {
    const r = (o: Partial<Parameters<typeof souhrn>[0][number]>) => ({
      teamId: 1, name: 'A', currency: 'CZK', revenue: 0, wages: 0, closings: 0, missingClosings: 0,
      pendingApproval: 0, members: 0, onShiftNow: 0, stockAlerts: 0, ...o,
    });
    const s = souhrn([r({ revenue: 100000, wages: 30000, missingClosings: 1 }), r({ teamId: 2, revenue: 50000, wages: 10000, pendingApproval: 2 })]);
    eq('přehled: tržby a mzdy se sečtou', [s.revenue, s.wages], [150000, 40000]);
    eq('přehled: podíl mezd z celku, ne průměr podílů', s.laborPct, 26.7);
    eq('přehled: chybějící uzávěrky a schválení se sečtou', [s.missingClosings, s.pendingApproval], [1, 2]);
    const mix = souhrn([r({ revenue: 100000 }), r({ teamId: 2, currency: 'EUR', revenue: 4000 })]);
    eq('přehled: koruny s eury se NESČÍTAJÍ — celek přizná různé měny', [mix.currency, mix.revenue, mix.laborPct], [null, 0, null]);
    eq('přehled: bez tržeb není podíl mezd', souhrn([r({ wages: 500 })]).laborPct, null);
    eq('přehled: prázdno má měnu null', souhrn([]).currency, null);
  }
  {
    const cl = [
      { teamId: 1, role: 'employer' as const, teamName: 'A', organizationId: 9 },
      { teamId: 2, role: 'employee' as const, teamName: 'B', organizationId: 9 },
      { teamId: 3, role: 'employer' as const, teamName: 'C', organizationId: 7 },
    ];
    eq('přehled: jen podniky organizace, kde jsem vedení', podnikyProPrehled(cl, 9), [1]);
    eq('přehled: bez organizace → důvod', procNejde(null, [1, 2]), 'bez_organizace');
    eq('přehled: vypnuto v nastavení → důvod', procNejde({ nastaveni: { ...VYCHOZI_NASTAVENI, konsolidovanyPrehled: false } }, [1, 2]), 'vypnuto');
    eq('přehled: jeden viditelný podnik → není co sčítat', procNejde({ nastaveni: VYCHOZI_NASTAVENI }, [1]), 'jeden_podnik');
    eq('přehled: dva podniky a zapnuto → jde', procNejde({ nastaveni: VYCHOZI_NASTAVENI }, [1, 2]), null);
  }
  eq('přehled: hranice února v přestupném roce', hraniceMesice('2028-02'), ['2028-02-01', '2028-02-29']);
  eq('přehled: nesmysl místo měsíce → null', hraniceMesice('2026-13'), null);

  // ---- Postup v úkolu: návod bije holý text -----------------------------
  {
    const polozka = { name: 'Limonáda', unit: 'l', batchSteps: 'Starý postup\nDruhý řádek' } as any;
    const plan = { item: polozka, batches: 1, yieldTotal: 0, lines: [], missing: [] } as any;
    eq('úkol: bez návodu se použije text u položky',
      checklistFor(plan).map(k => k.text), ['Starý postup', 'Druhý řádek']);
    eq('úkol: návod s kroky text přebije',
      checklistFor(plan, { id: 1, title: 'N', steps: ['Z návodu'] }).map(k => k.text), ['Z návodu']);
    eq('úkol: návod bez kroků text nepřebije',
      checklistFor(plan, { id: 1, title: 'N', steps: [] }).map(k => k.text), ['Starý postup', 'Druhý řádek']);
    ok('úkol: popis jmenuje návod, podle kterého se pracuje',
      popisUkolu(plan, { id: 1, title: 'Domácí limonáda', steps: ['Z návodu'] }).includes('Domácí limonáda'));
    ok('úkol: popis bez návodu jmenuje jen „Postup"',
      popisUkolu(plan).includes('Postup:'));
  }

  // Správce platformy: kdo to je — id účtu, ne e-mail.
  eq('správce: id z prostředí, čárka/mezera/středník', superadminIds(' 7, 12;300  '), [7, 12, 300]);
  eq('správce: prázdné prostředí = nikdo', superadminIds(''), []);
  eq('správce: nesmysl se ignoruje (e-mail, nula, záporné, desetinné)', superadminIds('admin@firma.cz, 0, -3, 2.5, 9'), [9]);
  eq('správce: id v seznamu ano', isSuperadminId(7, '7,12'), true);
  eq('správce: id jako text z tokenu ano', isSuperadminId('12', '7,12'), true);
  eq('správce: cizí id ne', isSuperadminId(8, '7,12'), false);
  eq('správce: undefined ne', isSuperadminId(undefined, '7,12'), false);
  eq('správce: vedení s id v seznamu → ano', rozhodniSpravce({ id: 7, role: 'employer', seznam: '7' }), true);
  eq('správce: kiosk s id v seznamu → ne (překlep v prostředí nesmí udělat správce z tabletu)', rozhodniSpravce({ id: 7, role: 'kiosk', seznam: '7' }), false);
  eq('správce: zaměstnanec → ne', rozhodniSpravce({ id: 7, role: 'employee', seznam: '7' }), false);
  eq('správce: vedení mimo seznam → ne', rozhodniSpravce({ id: 8, role: 'employer', seznam: '7' }), false);

  // Token pro MCP.
  const tok = 'x'.repeat(MIN_TOKEN_LENGTH);
  eq('token: správný Bearer projde', adminTokenOk(`Bearer ${tok}`, tok), true);
  eq('token: bez Bearer ne', adminTokenOk(tok, tok), false);
  eq('token: jiná hodnota ne', adminTokenOk(`Bearer ${'y'.repeat(MIN_TOKEN_LENGTH)}`, tok), false);
  eq('token: chybějící tajemství = nikdo', adminTokenOk(`Bearer ${tok}`, undefined), false);
  eq('token: krátké tajemství = nikdo', adminTokenOk('Bearer abc', 'abc'), false);
  eq('token: prázdná hlavička ne', adminTokenOk(null, tok), false);

  // Blokace: čisté rozhodnutí.
  const B = new Set([7]);
  eq('blokace: nezablokovaný podnik projde', rozhodni({ pathname: '/api/shifts', teamId: 3, blokovane: B, superadmin: false }), { akce: 'pustit' });
  eq('blokace: zablokovaný na API → 423', rozhodni({ pathname: '/api/shifts', teamId: 7, blokovane: B, superadmin: false }), { akce: 'api', status: 423 });
  eq('blokace: zablokovaný na stránce → /pozastaveno', rozhodni({ pathname: '/employer/overview', teamId: 7, blokovane: B, superadmin: false }), { akce: 'presmerovat', kam: '/pozastaveno' });
  eq('blokace: odhlášení jde vždycky', rozhodni({ pathname: '/api/auth/signout', teamId: 7, blokovane: B, superadmin: false }), { akce: 'pustit' });
  eq('blokace: správce se nikdy nezablokuje', rozhodni({ pathname: '/employer/overview', teamId: 7, blokovane: B, superadmin: true }), { akce: 'pustit' });
  eq('blokace: bez týmu není co blokovat', rozhodni({ pathname: '/api/shifts', teamId: null, blokovane: B, superadmin: false }), { akce: 'pustit' });
  eq('blokace: kiosk zablokovaného podniku taky', rozhodni({ pathname: '/kiosk', teamId: 7, blokovane: B, superadmin: false }), { akce: 'presmerovat', kam: '/pozastaveno' });
  eq('blokace: admin API se neblokuje samo', rozhodni({ pathname: '/api/admin/teams', teamId: 7, blokovane: B, superadmin: false }), { akce: 'pustit' });

  // Ruční tarif přebíjí všechno.
  eq('tarif: bez override platí uložený', planInfoOf({ plan: 'free' }).effective, 'free');
  eq('tarif: override max na free týmu', planInfoOf({ plan: 'free', plan_override: 'max' }).effective, 'max');
  eq('tarif: override free na placeném max — uložené zůstává max', planInfoOf({ plan: 'max', plan_override: 'free' }), { ...planInfoOf({ plan: 'max', plan_override: 'free' }), effective: 'free', plan: 'max', override: 'free' });
  eq('tarif: nesmyslný override se ignoruje', planInfoOf({ plan: 'pro', plan_override: 'vip' }).override, null);
  eq('tarif: override přebije i běžící zkušební dobu', planInfoOf({ plan: 'free', trial_ends_at: new Date(Date.now() + 5 * 86400000).toISOString(), plan_override: 'free' }).effective, 'free');

  // Každý den musí padnout do jiného sloupce, jinak se mřížka překrývá.
  for (const z of [0, 1] as const) {
    const sloupce = new Set<number>();
    for (let d = 14; d <= 20; d++) sloupce.add(poradiDne(`2026-09-${d}`, z));
    ok(`týden: sedm dnů dá sedm různých sloupců (začátek ${z})`, sloupce.size === 7);
  }
}

// ---- Otevírací doba: klíč 0 = pondělí ------------------------------------
// Tohle NENÍ zobrazení a se začátkem týdne se nemění. Kdyby to někdo
// „sjednotil" s mřížkou, posunul by otevírací dobu všem podnikům o den.
{
  const weekdayKey = (date: string) => String((new Date(date + 'T00:00:00').getDay() + 6) % 7);
  eq('otevírací doba: pondělí má klíč 0', weekdayKey('2026-09-14'), '0');
  eq('otevírací doba: neděle má klíč 6', weekdayKey('2026-09-20'), '6');
}

// Kontrola je až tady a čeká i na asynchronní testy. Dřív seděla uprostřed
// souboru — všechno pod ní se sice vypsalo, ale do návratového kódu se
// nepromítlo, takže `npm test` mohl skončit nulou s křížky na obrazovce.
Promise.all(pending).then(() => {
  if (failed) { console.error(`\n${failed} test(ů) selhalo.`); process.exit(1); }
  console.log('\nVšechny testy prošly.');
});
