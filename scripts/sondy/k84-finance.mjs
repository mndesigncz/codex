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
      if (x.closest('.overflow-x-auto, .sr-only') || x.getAttribute('aria-hidden') === 'true') return false;
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

/** Datové endpointy balíku; `chyby` = cesta → HTTP kód. */
const data = (opts = {}) => (req, json) => {
  const u = new URL(req.url()); const path = u.pathname;
  if (req.method() !== 'GET') return undefined;
  if (opts.chyby?.[path]) return json({ error: 'Server spadl' }, opts.chyby[path]);
  if (path === '/api/attendance') return json(nacti('k84-finance-attendance'));
  if (path === '/api/finance') return json(opts.finance ? opts.finance(u) : { ...nacti('k69-b5b-finance'), month: u.searchParams.get('month') ?? MESIC });
  if (path === '/api/finance/advice') return json(nacti('k69-b5b-finance-advice'));
  if (path === '/api/pos/daily') return json(opts.daily ? opts.daily(u) : nacti('k69-b5b-pos-daily'));
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

await konec();
