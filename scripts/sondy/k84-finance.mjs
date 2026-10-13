// Kolo 8, balík R8-4 — Finance, tržby, sklad a TO GO: nové widgety a filtry na telefonu
// (390 × 844, dotyk) i na monitoru (1280). Pro každou položku: widget se otevře s daty
// z fixtur, údaje jsou vidět, nic nepřetéká, akce volá správné API.
//  A) Mzdy dnes (finance.mzdy_dnes) v TO GO a na Přehledu: náklad do teď, % z tržby, do konce plánu,
//     Chip proti cíli; M s lidmi na směně; obnova po 2 min (jen interval, netestuje se).
//  B) Tržby vs. mzdy: Kč na hodinu práce se šipkou; M graf po dnech v týdnu.
//  C) Finance za libovolné období: ObdobiLista v hlavičce, srovnání s loňskem, jedna URL s from/to.
//  D) Kdy se prodává (trzby.heatmapa): mřížka den × hodina, na telefonu otočená bez přetečení, okno buňky.
//  E) Marže: přepínač Seznam / Matice, čtyři kvadranty s počty, na telefonu sekce.
//  F) Sklad: „dojde za ~N dní" u docházejících zásob a návrh na 7 dní v nákupním seznamu.
// Snímky: SNIMKY_DIR (jinak scripts/sondy/shots), necommitují se.
//   SONDY_ZAKLAD=http://localhost:3434 node scripts/sondy/k84-finance.mjs [A,B,…]
import { readFileSync, mkdirSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, dokud, dotazyNa, DIR, OUT } from './k68-spolecne.mjs';

const SNIMKY = process.env.SNIMKY_DIR ? process.env.SNIMKY_DIR.replace(/\/?$/, '/') : OUT;
mkdirSync(SNIMKY, { recursive: true });
const casti = process.argv[2] ? process.argv[2].split(',') : ['A', 'B', 'C', 'D', 'E', 'F'];

// Fixtury s relativními časy: "@<min>" = ISO před tolika minutami, "@HM±<min>" = pražské HH:MM,
// "DNES" = dnešní pražský den. Hodiny v prohlížeči se posunou na aspoň 13:00, ať „před 8 h" je dnes.
const POSUN = (() => {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).split(':').map(Number);
  const min = h * 60 + m;
  return min < 13 * 60 ? (13 * 60 - min) * 60000 : 0;
})();
const ted = () => Date.now() + POSUN;
const praha = (o = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(ted() + o * 86400000));
const hmPraha = (min) => new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ted() + min * 60000));
const DNES = praha(0);
const MESIC = DNES.slice(0, 7);
const nacti = (jmeno) => {
  let t = readFileSync(DIR + jmeno + '.json', 'utf8');
  t = t.replace(/"@HM([+-]\d+)"/g, (_, m) => `"${hmPraha(Number(m))}"`);
  t = t.replace(/"@(\d+)"/g, (_, m) => `"${new Date(ted() - Number(m) * 60000).toISOString()}"`);
  t = t.replaceAll('"DNES"', `"${DNES}"`).replaceAll('DNES', DNES).replaceAll('MESIC', MESIC);
  return JSON.parse(t);
};
const text = async (p, widget, n = 0) => (await p.locator(`[data-plocha] li[data-widget="${widget}"]`).nth(n).innerText().catch(() => '')).replace(/ /g, ' ');
/** Přetečení dokumentu nebo <main>; a v daném widgetu potomek, který vyčuhuje z karty (posuvné pásy a sr-only se nepočítají). */
const pretece = (p, widget = null) => p.evaluate((w) => {
  if (document.documentElement.scrollWidth > window.innerWidth + 1) return 'dokument';
  if ([...document.querySelectorAll('main')].some(m => m.scrollWidth > m.clientWidth + 1)) return 'main';
  if (!w) return '';
  for (const s of document.querySelectorAll(`[data-plocha] li[data-widget="${w}"] section`)) {
    const r = s.getBoundingClientRect();
    const ven = [...s.querySelectorAll('*')].find(x => {
      // Posuvné pásy, skrytý text a klepnutelné řádky seznamu (list-row-tap sahá záměrně do odsazení karty) se nepočítají.
      if (x.closest('.overflow-x-auto, .sr-only, .list-row-tap') || x.getAttribute('aria-hidden') === 'true') return false;
      const b = x.getBoundingClientRect();
      return b.width > 0 && (b.right > r.right + 1 || b.left < r.left - 1);
    });
    if (ven) return `${w}: ${ven.tagName.toLowerCase()}.${String(ven.className).slice(0, 40)}`;
  }
  return '';
}, widget);
const snimek = (p, jmeno) => p.screenshot({ path: `${SNIMKY}k84-finance-${jmeno}.png`, fullPage: true });
const TELEFON = { width: 390, height: 844 };
const MONITOR = { width: 1280, height: 900 };

const posunMesic = (mesic, o) => { const [y, m] = mesic.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + o, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
const pocetMesicu = (od, doM) => { const [y1, m1] = od.split('-').map(Number); const [y2, m2] = doM.split('-').map(Number); return (y2 - y1) * 12 + (m2 - m1) + 1; };
/**
 * /api/finance jako skutečná routa (kolo 8): `?month=` nebo `?from=&to=`; odpověď nese from/to/months a srovnávané
 * období. Kniha výdajů dostane data rozprostřená po měsících rozsahu (nejnovější měsíc první), ať jde seskupit.
 * Loňský rozsah vrací nižší tržby (160 000), ať srovnání „loni" ukáže jinou změnu než „předchozí období".
 */
const financeZaObdobi = (u) => {
  const f = nacti('k84-finance-finance');
  const od = u.searchParams.get('from') ?? u.searchParams.get('month') ?? MESIC;
  const doM = u.searchParams.get('to') ?? od;
  const n = pocetMesicu(od, doM);
  const ledger = f.ledger.map((r, i) => ({ ...r, date: `${posunMesic(doM, -(i % n))}-${String(10 + i).padStart(2, '0')}` }));
  // Stejné měsíce loni: 160 000 (+15 % proti nim); jakékoli dřívější období: 171 450 jako prevRevenue (+8 %); jinak čísla fixtury.
  const lonske = od === `${Number(MESIC.slice(0, 4)) - 1}-01` && doM === `${Number(MESIC.slice(0, 4)) - 1}-${MESIC.slice(5)}`;
  const predchozi = !lonske && doM < MESIC;
  const summary = lonske ? { ...f.summary, revenue: 160000, purchases: 50000, wagesWorked: 40000, gross: 70000, net: 70000 }
    : predchozi ? { ...f.summary, revenue: 171450, purchases: 60000, wagesWorked: 46000, gross: 65450, net: 65450 } : f.summary;
  return { ...f, summary, ledger, month: od, prevMonth: posunMesic(od, -n), from: od, to: doM, months: n, prevFrom: posunMesic(od, -n), prevTo: posunMesic(od, -1) };
};

/** Datové endpointy balíku; `chyby` = cesta → HTTP kód. */
const data = (opts = {}) => (req, json) => {
  const u = new URL(req.url()); const path = u.pathname;
  if (req.method() !== 'GET') return undefined;
  if (opts.chyby?.[path]) return json({ error: 'Server spadl' }, opts.chyby[path]);
  if (path === '/api/attendance') return json(nacti('k84-finance-attendance'));
  if (path === '/api/finance') return json(opts.finance ? opts.finance(u) : financeZaObdobi(u));
  if (path === '/api/pos/insights') return json(nacti('k84-finance-pos-insights'));
  if (path === '/api/finance/advice') return json(nacti('k69-b5b-finance-advice'));
  if (path === '/api/pos/daily') return json(opts.daily ? opts.daily(u) : u.searchParams.get('heat') === '1' ? nacti('k84-finance-pos-daily-heat') : nacti('k69-b5b-pos-daily'));
  if (path === '/api/pos/margins') return json(nacti('k69-b5b-pos-margins'));
  if (path === '/api/pos/status') return json(nacti('k69-b5b-pos-status'));
  if (path === '/api/receipts') return json(nacti('k69-b5b-receipts'));
  if (path === '/api/inventory/shrinkage') return json(nacti('k69-b5b-shrinkage'));
  if (path === '/api/closings/calendar') return json({ month: u.searchParams.get('month'), days: {} });
  return undefined;
};

// ===========================================================================
// A) Mzdy dnes
// ===========================================================================
if (casti.includes('A')) {
  for (const [jmeno, viewport, mobil] of [['telefon', TELEFON, true], ['monitor', MONITOR, false]]) {
    const { ctx, p, chyby } = await kontext({ viewport, mobil, fix: nacti('k84-finance-rozlozeni-togo'), dalsi: data(), posunCasu: POSUN });
    await ctx.addInitScript(() => { try { localStorage.setItem('managero-app-mode', 'togo'); } catch { /* soukromé okno */ } });
    await otevri(p, '/employer/overview', 'vedeni.togo');
    await dokud(async () => /Náklad do teď/.test(await text(p, 'finance.mzdy_dnes')), 6000);
    await p.waitForTimeout(500);
    const s = await text(p, 'finance.mzdy_dnes', 0);
    // Eva 4 h × 150 = 600, Honza 4 h × 200 = 800 → 1 400 Kč; tržba 18 450 → 8 %; do konce: Eva ~4 h × 150 + Petra 6 h × 180 ≈ 1 680
    // (plán je na celé minuty, zbytek běžící směny o pár vteřin kratší — proto 1 67x–1 680).
    tvrdi(`A ${jmeno}: malá karta ukazuje náklad 1 400 Kč, 8 % z dnešní tržby a do konce plánu ~1 680 Kč`, /1 400 Kč/.test(s) && /8 % z tržby/.test(s) && /~1 6[78]\d Kč/.test(s), s.slice(0, 200));
    tvrdi(`A ${jmeno}: Chip proti cíli podniku (28 %) říká „v cíli"`, /v cíli/.test(s), s.slice(0, 120));
    const m = await text(p, 'finance.mzdy_dnes', 1);
    tvrdi(`A ${jmeno}: střední karta má lidi na směně (Eva 600 Kč, Jakub bez sazby) a tržbu z pokladny v poznámce`, /2 lidé na směně/i.test(m) && /Eva Testová/.test(m) && /600 Kč/.test(m) && /bez sazby/.test(m) && /8 % z dnešní tržby 18 450 Kč/.test(m), m.slice(0, 300));
    tvrdi(`A ${jmeno}: jeden člověk bez sazby je přiznaný`, /1 člověk bez sazby/.test(m), m.slice(0, 300));
    const pre = await pretece(p, 'finance.mzdy_dnes');
    tvrdi(`A ${jmeno}: nic nepřetéká`, !pre, pre);
    tvrdi(`A ${jmeno}: žádná chyba v konzoli`, chyby.filter(c => !/418|423|425/.test(c)).length === 0, chyby.slice(0, 2).join(' | '));
    if (mobil) {
      // Hlavní údaj nad ohybem: malá karta Mzdy dnes je vidět bez posunu.
      const r = await p.locator('[data-plocha] li[data-widget="finance.mzdy_dnes"]').first().boundingBox();
      tvrdi('A telefon: Mzdy dnes S stojí nad ohybem (pod Pokladnou dnes)', !!r && r.y + r.height <= 844, JSON.stringify(r));
    }
    await snimek(p, `A-togo-${jmeno}`);
    await ctx.close();
  }
  // Bez tržeb z pokladny (nepropojená) widget stále ukáže náklad, jen bez procenta.
  {
    const { ctx, p } = await kontext({ viewport: TELEFON, mobil: true, fix: nacti('k84-finance-rozlozeni-togo'), posunCasu: POSUN,
      dalsi: (req, json) => (new URL(req.url()).pathname === '/api/pos/summary' ? json({ connected: false }) : data()(req, json)) });
    await ctx.addInitScript(() => { try { localStorage.setItem('managero-app-mode', 'togo'); } catch { /* soukromé okno */ } });
    await otevri(p, '/employer/overview', 'vedeni.togo');
    await dokud(async () => /Náklad do teď/.test(await text(p, 'finance.mzdy_dnes')), 6000);
    const s = await text(p, 'finance.mzdy_dnes', 0);
    tvrdi('A nepropojená pokladna: náklad 1 400 Kč zůstává, místo procenta „pokladna není propojená"', /1 400 Kč/.test(s) && /pokladna není propojená/.test(s), s.slice(0, 160));
    await ctx.close();
  }
}

// ===========================================================================
// B) Tržba na hodinu práce
// ===========================================================================
if (casti.includes('B')) {
  for (const [jmeno, viewport, mobil] of [['telefon', TELEFON, true], ['monitor', MONITOR, false]]) {
    const { ctx, p, chyby } = await kontext({ viewport, mobil, fix: nacti('k84-finance-rozlozeni-finance'), dalsi: data() });
    await otevri(p, '/employer/overview?view=finance', 'vedeni.finance');
    await dokud(async () => /na hodinu práce/.test(await text(p, 'finance.trzby_vs_mzdy')), 8000);
    await p.waitForTimeout(400);
    const s = await text(p, 'finance.trzby_vs_mzdy', 0);
    // 184 320 Kč / 148,6 h = 1 240 Kč/h; minulý měsíc 171 450 / 152 = 1 128 → +10 %.
    tvrdi(`B ${jmeno}: malá karta Tržby vs. mzdy má druhé číslo 1 240 Kč na hodinu práce se šipkou +10 %`, /1 240 Kč na hodinu práce/.test(s) && /↑ \+10 %/.test(s), s.slice(0, 200));
    const m = await text(p, 'finance.trzby_vs_mzdy', 1);
    tvrdi(`B ${jmeno}: střední karta má graf po dnech v týdnu a jmenuje nejslabší úterý (820 Kč)`, /nejslabší úterý · 820 Kč na hodinu/i.test(m), m.slice(0, 400));
    const sloupku = await p.locator('[data-plocha] li[data-widget="finance.trzby_vs_mzdy"]').nth(1).getByRole('group', { name: /po dnech v týdnu/ }).count();
    tvrdi(`B ${jmeno}: graf Po–Ne je přístupný (skupina s popiskem a skrytým seznamem hodnot)`, sloupku === 1, String(sloupku));
    const h = await text(p, 'trzby.hodiny');
    tvrdi(`B ${jmeno}: Špičky během dne (měsíc s obsazením) mají řádek Na člověka a hodinu s nejslabší hodinou`, /Na člověka a hodinu/i.test(h) && /nejslabší hodina 19:00 · 325 Kč na člověka/.test(h), h.slice(0, 400));
    const pre = (await pretece(p, 'finance.trzby_vs_mzdy')) || (await pretece(p, 'trzby.hodiny'));
    tvrdi(`B ${jmeno}: nic nepřetéká`, !pre, pre);
    tvrdi(`B ${jmeno}: žádná chyba v konzoli`, chyby.filter(c => !/418|423|425/.test(c)).length === 0, chyby.slice(0, 2).join(' | '));
    await snimek(p, `B-finance-${jmeno}`);
    await ctx.close();
  }
}

// ===========================================================================
// C) Finance za libovolné období a srovnání s loňskem
// ===========================================================================
if (casti.includes('C')) {
  const rok = MESIC.slice(0, 4);
  for (const [jmeno, viewport, mobil] of [['telefon', TELEFON, true], ['monitor', MONITOR, false]]) {
    const { ctx, p, stav, chyby } = await kontext({ viewport, mobil, fix: nacti('k69-b5b-rozlozeni-finance'), dalsi: data() });
    await otevri(p, '/employer/overview?view=finance', 'vedeni.finance');
    await p.waitForTimeout(800);
    const tlacitko = p.getByRole('button', { name: /Tento měsíc/ }).first();
    tvrdi(`C ${jmeno}: v hlavičce je výběr období „Tento měsíc · <měsíc>" (ne jen šipky měsíce)`, await tlacitko.isVisible());
    await tlacitko.click();
    const okno = p.getByRole('dialog', { name: 'Období' });
    await dokud(() => okno.isVisible(), 3000);
    if (mobil) {
      await p.waitForTimeout(600);
      const r = await okno.boundingBox();
      tvrdi('C telefon: okno období vyjíždí zdola', !!r && Math.abs(r.y + r.height - TELEFON.height) <= 2, JSON.stringify(r));
      // Dotyková plocha = výška tlačítka, nebo jeho ::before (tap-target rozšiřuje zásah, ne vzhled).
      const cile = await okno.getByRole('button').filter({ hasNot: p.locator('[aria-label="Zavřít"]') }).evaluateAll(bs => bs.filter(b => b.getAttribute('aria-label') !== 'Zavřít').map(b => Math.round(Math.max(b.getBoundingClientRect().height, parseFloat(getComputedStyle(b, '::before').height) || 0))));
      tvrdi('C telefon: všechny volby mají dotykovou plochu ≥ 44 px', cile.every(h => h >= 44), cile.join(','));
      await snimek(p, 'C-obdobi-okno-telefon');
    }
    tvrdi(`C ${jmeno}: okno nabízí Tento měsíc, Minulý měsíc, Čtvrtletí, Od začátku roku, Loňský rok, Vlastní a Srovnat s`,
      (await Promise.all(['Tento měsíc', 'Minulý měsíc', 'Čtvrtletí', 'Od začátku roku', 'Loňský rok', 'Vlastní'].map(n => okno.getByRole('button', { name: n, exact: true }).isVisible()))).every(Boolean)
      && await okno.getByRole('tablist', { name: 'Srovnat s' }).isVisible());
    const od = Date.now();
    await okno.getByRole('button', { name: 'Od začátku roku', exact: true }).click();
    await dokud(() => okno.isVisible().then(v => !v), 3000);
    await dokud(async () => /Souhrn období[\s\S]*proti/.test(await text(p, 'finance.souhrn_mesice')), 8000);
    await p.waitForTimeout(600);
    const url = `/api/finance?from=${rok}-01&to=${MESIC}`;
    const dotazy = new Set(dotazyNa(stav, ['/api/finance'], od).filter(d => !d.path.includes('advice')).map(d => new URL(d.u).pathname + new URL(d.u).search));
    tvrdi(`C ${jmeno}: volba rozsahu pošle ${url} a předchozí období; widgety i kniha sdílí tytéž URL`, dotazy.has(url) && dotazy.size === 2, [...dotazy].join(' | '));
    const souhrn = await text(p, 'finance.souhrn_mesice');
    tvrdi(`C ${jmeno}: Souhrn období nese od–do, počet měsíců a změnu v % u čísel`, /Souhrn období/.test(souhrn) && /leden \d{4} – /i.test(souhrn) && /měsíců/.test(souhrn) && /\+8 % proti předchozímu období/.test(souhrn), souhrn.slice(0, 260));
    const nastroj = p.locator('[data-plocha] li[data-widget="nastroj"]');
    const skupin = await nastroj.locator('section[aria-label]').count();
    tvrdi(`C ${jmeno}: kniha výdajů za víc měsíců je ve skupinách po měsících`, skupin >= 2, String(skupin));
    tvrdi(`C ${jmeno}: tlačítko období říká „Od začátku roku"`, await p.getByRole('button', { name: /Od začátku roku/ }).first().isVisible());
    // Srovnání s loňskem: druhý dotaz jde na stejné měsíce o rok dřív a změna se přepočítá.
    const od2 = Date.now();
    await p.getByRole('button', { name: /Od začátku roku/ }).first().click();
    await dokud(() => okno.isVisible(), 3000);
    await okno.getByRole('tab', { name: 'Stejné období loni' }).click();
    await okno.getByRole('button', { name: 'Hotovo' }).click();
    await dokud(async () => /proti stejnému období loni/.test(await text(p, 'finance.souhrn_mesice')), 8000);
    const dotazy2 = dotazyNa(stav, ['/api/finance'], od2).map(d => new URL(d.u).search);
    const lonsky = `?from=${Number(rok) - 1}-01&to=${Number(rok) - 1}-${MESIC.slice(5)}`;
    tvrdi(`C ${jmeno}: Srovnat s loňskem načte ${lonsky} a souhrn říká změnu proti stejnému období loni (+15 %)`, dotazy2.includes(lonsky) && /\+15 % proti stejnému období loni/.test(await text(p, 'finance.souhrn_mesice')), dotazy2.join(' | ') + ' ' + (await text(p, 'finance.souhrn_mesice')).slice(0, 200));
    const pre = await pretece(p, 'finance.souhrn_mesice');
    tvrdi(`C ${jmeno}: nic nepřetéká`, !pre, pre);
    tvrdi(`C ${jmeno}: žádná chyba v konzoli`, chyby.filter(c => !/418|423|425/.test(c)).length === 0, chyby.slice(0, 2).join(' | '));
    await snimek(p, `C-finance-obdobi-${jmeno}`);
    await ctx.close();
  }
}

// ===========================================================================
// D) Kdy se prodává: teplotní mapa den v týdnu × hodina
// ===========================================================================
if (casti.includes('D')) {
  for (const [jmeno, viewport, mobil] of [['telefon', TELEFON, true], ['monitor', MONITOR, false]]) {
    const { ctx, p, stav, chyby } = await kontext({ viewport, mobil, fix: nacti('k84-finance-rozlozeni-finance'), dalsi: data() });
    await otevri(p, '/employer/overview?view=finance', 'vedeni.finance');
    const w = p.locator('[data-plocha] li[data-widget="trzby.heatmapa"]');
    await dokud(async () => /nejsilnější/.test(await text(p, 'trzby.heatmapa')), 8000);
    await w.scrollIntoViewIfNeeded();
    await p.waitForTimeout(400);
    const h = await text(p, 'trzby.heatmapa');
    const url = dotazyNa(stav, ['/api/pos/daily']).map(d => new URL(d.u).search).find(q => /heat=1/.test(q));
    tvrdi(`D ${jmeno}: widget Kdy se prodává čte /api/pos/daily s lite=1&heat=1`, !!url && /lite=1/.test(url), url ?? '—');
    tvrdi(`D ${jmeno}: jmenuje nejsilnější okno — pátek 17–18 h (průměr 6 720 Kč)`, /nejsilnější pátek 17–18 h · průměr 6 720 Kč/i.test(h), h.slice(0, 200));
    tvrdi(`D ${jmeno}: lišta období a přepínač Tržba / Účtenky jsou v kartě`, await w.getByRole('button', { name: /Posledních 30 dní/ }).count() === 1 && await w.getByRole('tab', { name: 'Účtenky' }).count() === 1);
    const bunky = w.getByRole('group', { name: /Teplotní mapa/ }).getByRole('button');
    const n = await bunky.count();
    // 7 dnů × 13 hodin (7–19); neděle bez prodeje = zakázané buňky.
    tvrdi(`D ${jmeno}: mřížka má 7 × 13 buněk (hodiny otevírací doby 7–19)`, n === 91, String(n));
    const rozmery = await bunky.evaluateAll(bs => { const r = bs.map(b => b.getBoundingClientRect()); const x0 = r[0].x, y0 = r[0].y; return { vodorovne: r.filter(b => Math.abs(b.y - y0) < 1).length, svisle: r.filter(b => Math.abs(b.x - x0) < 1).length }; });
    tvrdi(`D ${jmeno}: ${mobil ? 'na telefonu dny ve sloupcích a hodiny v řádcích (7 × 13)' : 'na monitoru hodiny ve sloupcích a dny v řádcích (13 × 7)'}`,
      mobil ? rozmery.vodorovne === 7 && rozmery.svisle === 13 : rozmery.vodorovne === 13 && rozmery.svisle === 7, JSON.stringify(rozmery));
    if (!mobil) tvrdi('D monitor: v buňkách jsou čísla (pátek 17 h „6,7k")', (await bunky.allInnerTexts()).some(x => x === '6,7k'));
    const pre = await pretece(p, 'trzby.heatmapa');
    tvrdi(`D ${jmeno}: nic nepřetéká`, !pre, pre);
    await snimek(p, `D-heatmapa-${jmeno}`);
    // Klepnutí na buňku otevře okno s průměrem, účtenkami a lidmi na směně.
    await w.getByRole('button', { name: /^pátek 17–18 h/i }).click();
    const okno = p.getByRole('dialog', { name: /pátek 17–18 h/i });
    await dokud(() => okno.isVisible(), 3000);
    const o = (await okno.innerText()).replace(/\u00a0/g, ' ');
    tvrdi(`D ${jmeno}: okno buňky: průměr 6 720 Kč, 39,5 účtenky, 2 lidé na směně, ze 4 dnů`, /6 720 Kč/.test(o) && /39,5/.test(o) && /\n2\n/.test(o) && /4 dnů s prodejem/.test(o), o.slice(0, 300));
    if (mobil) {
      await p.waitForTimeout(600);
      const rr = await okno.boundingBox();
      tvrdi('D telefon: okno buňky vyjíždí zdola', !!rr && Math.abs(rr.y + rr.height - TELEFON.height) <= 2, JSON.stringify(rr));
    }
    await snimek(p, `D-heatmapa-okno-${jmeno}`);
    await p.keyboard.press('Escape');
    // Přepnutí na účtenky přepočítá buňky (pátek 17 h = 40 účtenek za den).
    await w.getByRole('tab', { name: 'Účtenky' }).click();
    await p.waitForTimeout(300);
    tvrdi(`D ${jmeno}: přepínač Účtenky přepočítá buňky (pátek 17–18 h: 40 účtenek)`, /pátek 17–18 h: 40 účtenek/i.test(await bunky.evaluateAll(bs => bs.map(b => b.getAttribute('aria-label')).join('\n'))));
    tvrdi(`D ${jmeno}: žádná chyba v konzoli`, chyby.filter(c => !/418|423|425/.test(c)).length === 0, chyby.slice(0, 2).join(' | '));
    await ctx.close();
  }
}

// ===========================================================================
// E) Marže: Seznam / Matice (hvězdy, tahouni, hádanky, psi)
// ===========================================================================
if (casti.includes('E')) {
  for (const [jmeno, viewport, mobil] of [['telefon', TELEFON, true], ['monitor', MONITOR, false]]) {
    const { ctx, p, stav, chyby } = await kontext({ viewport, mobil, fix: nacti('k84-finance-rozlozeni-finance'), dalsi: data() });
    await otevri(p, '/employer/overview?view=finance', 'vedeni.finance');
    const w = p.locator('[data-plocha] li[data-widget="finance.marze"]');
    await dokud(async () => await w.getByRole('tab', { name: 'Matice' }).count() === 1, 8000);
    await w.scrollIntoViewIfNeeded();
    tvrdi(`E ${jmeno}: velká karta Marže má přepínač Seznam / Matice`, await w.getByRole('tab', { name: 'Seznam' }).count() === 1 && await w.getByRole('tab', { name: 'Matice' }).count() === 1);
    await w.getByRole('tab', { name: 'Matice' }).click();
    await p.waitForTimeout(400);
    const m = await text(p, 'finance.marze');
    // Fixtura: Flat white 640 ks / 84 %, Croissant 410 / 58 %, Cheesecake 120 / 42 %; průměr 390 ks a 61 % → hvězda, tahoun, pes; Matcha bez receptury.
    tvrdi(`E ${jmeno}: kvadranty s počty (Hvězdy 1, Tahouni 1, Hádanky 0, Psi 1) a 1 položka bez receptury`,
      /Hvězdy[^\d]*1/.test(m) && /Tahouni[^\d]*1/.test(m) && /Hádanky[^\d]*0/.test(m) && /Psi[^\d]*1/.test(m) && /1 položka bez receptury/.test(m), m.slice(0, 400));
    if (mobil) {
      // Telefon: žádný graf, čtyři sbalitelné sekce; Hvězdy rozbalené s Flat white, Psi se rozbalí klepnutím.
      tvrdi('E telefon: místo grafu čtyři sbalitelné sekce (Hvězdy rozbalené s Flat white)', await w.getByRole('img').count() === 0 && (await w.locator('section[aria-label="Hvězdy"]').innerText()).includes('Flat white'));
      await w.locator('section[aria-label="Psi"]').getByRole('button', { name: /Psi/ }).click();
      await p.waitForTimeout(300);
      tvrdi('E telefon: Psi po rozbalení ukážou Cheesecake (42 %)', /Cheesecake[\s\S]{0,60}42 %/.test(await w.locator('section[aria-label="Psi"]').innerText()));
      const cile = await w.locator('section[aria-label] > button').evaluateAll(bs => bs.map(b => Math.round(Math.max(b.getBoundingClientRect().height, parseFloat(getComputedStyle(b, '::before').height) || 0))));
      tvrdi('E telefon: hlavičky sekcí mají dotykovou plochu ≥ 44 px', cile.every(h => h >= 44), cile.join(','));
    } else {
      const graf = w.getByRole('img', { name: /Matice menu/ });
      tvrdi('E monitor: bodový graf s popiskem a třemi body (položky s recepturou)', await graf.count() === 1 && await graf.locator('circle').count() === 3, `${await graf.count()} / ${await graf.locator('circle').count()}`);
      // Chip Psi filtruje seznam na Cheesecake; druhé klepnutí filtr zruší.
      await w.getByRole('button', { name: /^Psi/ }).click();
      await p.waitForTimeout(200);
      const seznam = await w.locator('ul.list').last().innerText();
      tvrdi('E monitor: klepnutí na Chip Psi zúží seznam na Cheesecake', /Cheesecake/.test(seznam) && !/Flat white/.test(seznam), seznam.slice(0, 120));
      await w.getByRole('button', { name: /^Psi/ }).click();
      await p.waitForTimeout(200);
      tvrdi('E monitor: druhé klepnutí filtr zruší', /Flat white/.test(await w.locator('ul.list').last().innerText()));
    }
    // Klepnutí na položku vede do receptury (pohled recipes s productId).
    const pred = p.url();
    await w.locator('ul.list').last().getByText('Cheesecake').first().click();
    await p.waitForTimeout(800);
    tvrdi(`E ${jmeno}: položka vede do receptury (view=recipes)`, /view=recipes/.test(p.url()) || await p.locator('[data-plocha="vedeni.receptury"]').count() === 1, p.url() + ' (před: ' + pred + ')');
    const pre = await pretece(p, 'finance.marze');
    tvrdi(`E ${jmeno}: nic nepřetéká`, !pre, pre);
    tvrdi(`E ${jmeno}: žádná chyba v konzoli`, chyby.filter(c => !/418|423|425/.test(c)).length === 0, chyby.slice(0, 2).join(' | '));
    await ctx.close();
  }
  // Snímky matice (před prokliknutím do receptury).
  for (const [jmeno, viewport, mobil] of [['telefon', TELEFON, true], ['monitor', MONITOR, false]]) {
    const { ctx, p } = await kontext({ viewport, mobil, fix: nacti('k84-finance-rozlozeni-finance'), dalsi: data() });
    await ctx.addInitScript(() => { try { localStorage.setItem('managero-volba-marze-pohled', 'matice'); } catch { /* soukromé okno */ } });
    await otevri(p, '/employer/overview?view=finance', 'vedeni.finance');
    const w = p.locator('[data-plocha] li[data-widget="finance.marze"]');
    await dokud(async () => /Hvězdy/.test(await text(p, 'finance.marze')), 8000);
    await w.scrollIntoViewIfNeeded();
    await p.waitForTimeout(400);
    await w.screenshot({ path: `${SNIMKY}k84-finance-E-matice-${jmeno}.png` });
    await ctx.close();
  }
}

await konec();
