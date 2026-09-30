// Kolo 78 — vícejazyčnost: Rozvrh a Sklad (plánovač, Receptury).
//
// Tvrdí (němčina a angličtina, telefon 390 × 844, světlý i tmavý režim):
//  • Rozvrh vedení (nástroj plánovače): nadpis, hlavní akce, záložky, legenda a okno dne jsou
//    v jazyce uživatele, bez českých slov obalu v nástroji, bez vodorovného přetečení;
//  • Receptury: nástroj (hledání, filtr kategorií, editor) přeložený, bez přetečení;
//  • tmavý režim: text nástroje je čitelný (kontrast vůči ploše ≥ 3 : 1, nic nezmizelo);
//  • čeština zůstává beze změny (nadpisy, tlačítka, záložky).
//
// Čas dne se neuplatní: dny a měsíce fixtur se doplňují podle pražského dne (jako v k69-b1).
// Widgety plochy (jiný balík) se tu netvrdí — kontroluje se jen nástroj stránky.
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, roleMine, DIR, OUT } from './k68-spolecne.mjs';

const praha = (o = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(Date.now() + o * 86400000));
const DNY = { DNES: praha(0), VCERA: praha(-1), PRED3: praha(-3), ZITRA: praha(1), POZITRI: praha(2), ZA3: praha(3), ZA5: praha(5), ZA7: praha(7), ZA10: praha(10) };
const MESIC = DNY.DNES.slice(0, 7);
const pristi = (() => { const [y, m] = MESIC.split('-').map(Number); const d = new Date(Date.UTC(y, m, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; })();
const nacti = (jmeno, mesic = MESIC) => {
  let t = readFileSync(DIR + jmeno + '.json', 'utf8');
  for (const [k, v] of Object.entries(DNY)) t = t.replaceAll(`"${k}"`, `"${v}"`);
  return JSON.parse(t.replaceAll('PRISTI', pristi).replaceAll('"MESIC"', `"${MESIC}"`).replaceAll('"@-', `"${mesic}-`));
};
const JSON_FIX = (jmeno) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8'));

/** Podvrh API rozvrhu, dostupnosti a receptur (tvary jako v k69-b1 a k69-b4). */
const podvrh = ({ mineId = 15 } = {}) => (req, json) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const q = url.searchParams;
  if (req.method() !== 'GET') {
    if (path === '/api/schedule/generate' && !JSON.parse(req.postData() || '{}').commit) return json(nacti('k69-b1-generate'));
    if (['/api/timeoff', '/api/schedule', '/api/availability', '/api/schedule/publish', '/api/pos/products'].includes(path)) return json({ ok: true, notified: 3 });
    return undefined;
  }
  if (path === '/api/schedule') return json(nacti('k69-b1-schedule', q.get('month') ?? MESIC));
  if (path === '/api/schedule/rules') return json(nacti('k69-b1-rules'));
  if (path === '/api/availability') return q.get('mine') ? json(null) : json(nacti('k69-b1-availability'));
  if (path === '/api/timeoff') return json(nacti(q.get('mine') === '1' ? 'k69-b1-timeoff-mine' : 'k69-b1-timeoff'));
  if (path === '/api/shifts/offers') return json(nacti('k69-b1-offers'));
  if (path === '/api/shifts' && q.get('team') === '1') return json(nacti('k69-b1-shifts-team'));
  if (path === '/api/shifts' && q.get('employeeId')) return json(nacti('k69-b1-shifts-mine').map(s => ({ ...s, employeeId: mineId })));
  if (path === '/api/fixed-assignments') return json({ assignments: [] });
  if (path === '/api/events') return json({ events: [] });
  if (path === '/api/pos/products') return json(JSON_FIX('k69-b4-pos-products'));
  if (path === '/api/inventory') return json(JSON_FIX('k69-b4-inventory'));
  if (path === '/api/inventory/categories') return json([{ id: 1, name: 'Bar' }]);
  if (path === '/api/guides') return json({ guides: [] });
  if (path === '/api/pos/status') return json({ connected: true });
  return undefined;
};

const FIX_ROZVRH = nacti('k69-b1-rozlozeni-rozvrh');
const FIX_RECEPTURY = JSON_FIX('k69-b4-rozlozeni-receptury');
const ROZVRH = '/employer/overview?view=shifts';
const RECEPTURY = '/employer/recipes';
const TEL = { width: 390, height: 844 };

const JAZYKY = {
  de: {
    nadpis: 'Dienstplan', generovat: 'Dienstplan erstellen', zalozky: ['Dienstplan', 'Schichtarten', 'Öffnungszeiten'],
    receptury: 'Rezepte', den: 'Tag',
  },
  en: {
    nadpis: 'Schedule', generovat: 'Generate schedule', zalozky: ['Schedule', 'Shift types', 'Opening hours'],
    receptury: 'Recipes', den: 'Day',
  },
};
// Česká slova obalu, která se v cizím jazyce v nástroji nesmí objevit. Obsah podniku (jména typů směn,
// jména lidí, položky menu) je záměrně česky a do seznamu nepatří.
const CESKA_SLOVA = ['Vygenerovat', 'Publikovat', 'Směny podle', 'Uložit', 'Zrušit', 'Zavřít', 'Otevírací doba', 'Pevné dny', 'Typy směn', 'Kalendář', 'Receptury', 'Hledat', 'Jen bez receptury', 'Poznámka'];

const preteka = (p) => p.evaluate(() => ({ doc: document.documentElement.scrollWidth, okno: window.innerWidth }));
const textNastroje = (p, selektor) => p.locator(selektor).first().evaluate(el => el.innerText);
const ceskeSlova = (txt) => CESKA_SLOVA.filter(s => txt.includes(s));

/** Nejhorší kontrast textu proti ploše pod ním mezi (viditelnými) prvky nástroje. */
const kontrastTextu = (p, selektor) => p.evaluate((sel) => {
  const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return null; const x = m[1].split(',').map(parseFloat); return { r: x[0], g: x[1], b: x[2], a: x.length > 3 ? x[3] : 1 }; };
  const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const lum = (c) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const bgOf = (el) => { let acc = null; for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (!c || c.a === 0) continue; acc = acc ? over(acc, c) : c; if (acc.a >= 0.999) return acc; } return acc ?? { r: 255, g: 255, b: 255, a: 1 }; };
  const koren = document.querySelector(sel);
  if (!koren) return { pocet: 0, nejhorsi: null, kde: 'selektor nenalezen' };
  let nejhorsi = 99; let kde = ''; let pocet = 0;
  const w = document.createTreeWalker(koren, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const txt = (n.textContent || '').trim();
    const el = n.parentElement;
    if (!txt || !el || el.offsetParent === null || !/[A-Za-zÀ-ž]/.test(txt)) continue; // emoji avatary se nepočítají
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
    const fg = parse(cs.color); if (!fg) continue;
    const bg = bgOf(el); const e = over(fg, bg);
    const l1 = lum(e), l2 = lum(bg);
    const k = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    pocet++;
    if (k < nejhorsi) { nejhorsi = k; kde = txt.slice(0, 40); }
  }
  return { pocet, nejhorsi: Math.round(nejhorsi * 100) / 100, kde };
}, selektor);

async function zaloz({ jazyk, viewport, mobil = false, tmavy = false, role = 'employer', fix, mineData }) {
  const { ctx, p, chyby } = await kontext({ role, fix, viewport, mobil, tmavy, mineData, dalsi: podvrh({ mineId: 16 }) });
  if (jazyk) await ctx.addCookies([{ name: 'managero-lang', value: jazyk, domain: 'localhost', path: '/' }]);
  return { ctx, p, chyby };
}

// ============================================================ čeština: beze změny
{
  const { ctx, p } = await zaloz({ jazyk: null, viewport: { width: 1280, height: 950 }, fix: FIX_ROZVRH });
  await otevri(p, ROZVRH, 'vedeni.rozvrh');
  const nastroj = 'section[aria-labelledby="planovac-nadpis"]';
  tvrdi('čeština: nadpis Rozvrh a akce Vygenerovat rozvrh', await p.getByRole('heading', { level: 1, name: 'Rozvrh' }).isVisible() && await p.getByRole('button', { name: 'Vygenerovat rozvrh' }).isVisible());
  tvrdi('čeština: záložky Rozvrh / Typy směn / Otevírací doba', await p.getByRole('tab', { name: 'Typy směn' }).isVisible() && await p.getByRole('tab', { name: 'Otevírací doba' }).isVisible());
  tvrdi('čeština: v nástroji „Rychlý výběr měsíce“ a legenda česky', (await textNastroje(p, nastroj)).includes('Tento měsíc') && await p.getByRole('group', { name: 'Rychlý výběr měsíce' }).isVisible());
  await ctx.close();
}

// ============================================================ němčina a angličtina
for (const [kod, T] of Object.entries(JAZYKY)) {
  // --- Rozvrh vedení, desktop
  {
    const { ctx, p, chyby } = await zaloz({ jazyk: kod, viewport: { width: 1280, height: 950 }, fix: FIX_ROZVRH });
    await otevri(p, ROZVRH, 'vedeni.rozvrh');
    const nastroj = 'section[aria-labelledby="planovac-nadpis"]';
    tvrdi(`${kod}: <html lang="${kod}">`, await p.evaluate(() => document.documentElement.lang) === kod);
    tvrdi(`${kod}: Rozvrh — nadpis „${T.nadpis}“ a hlavní akce „${T.generovat}“`, await p.getByRole('heading', { level: 1, name: T.nadpis }).isVisible() && await p.getByRole('button', { name: T.generovat }).isVisible());
    for (const z of T.zalozky) tvrdi(`${kod}: Rozvrh — záložka „${z}“`, await p.getByRole('tab', { name: z, exact: true }).first().isVisible().catch(() => false));
    const txt = await textNastroje(p, nastroj);
    tvrdi(`${kod}: Rozvrh — nástroj bez českých slov obalu`, ceskeSlova(txt).length === 0, ceskeSlova(txt).join(', '));
    // okno dne: klepnutí na den s rozvrhem otevře modální okno v jazyce uživatele
    await p.locator(`${nastroj} button[aria-label*="${DNY.ZITRA.slice(8)}"]`).first().click().catch(async () => { await p.locator(`${nastroj} .grid.grid-cols-7 button`).nth(10).click(); });
    const okno = p.getByRole('dialog').first();
    await okno.waitFor({ timeout: 8000 });
    await p.waitForTimeout(500);
    const oknoTxt = await okno.innerText();
    tvrdi(`${kod}: okno dne — bez českých slov obalu`, ceskeSlova(oknoTxt).length === 0, ceskeSlova(oknoTxt).join(', '));
    tvrdi(`${kod}: okno dne — tlačítko Zavřít přeložené`, await okno.getByRole('button', { name: kod === 'de' ? 'Schließen' : 'Close' }).first().isVisible());
    await p.keyboard.press('Escape');
    tvrdi(`${kod}: Rozvrh — stránka bez chyby ve skriptu`, chyby.length === 0, chyby.slice(0, 2).join(' | '));
    await ctx.close();
  }
  // --- Rozvrh na telefonu 390 px: nic nepřetéká, návrh (generování) se vejde
  {
    const { ctx, p } = await zaloz({ jazyk: kod, viewport: TEL, mobil: true, fix: FIX_ROZVRH });
    await otevri(p, ROZVRH, 'vedeni.rozvrh');
    let pt = await preteka(p);
    tvrdi(`${kod}: Rozvrh na 390 px bez vodorovného přetečení`, pt.doc <= pt.okno + 1, JSON.stringify(pt));
    await p.getByRole('button', { name: T.generovat }).click();
    await p.waitForTimeout(1200);
    pt = await preteka(p);
    tvrdi(`${kod}: Rozvrh s návrhem na 390 px bez přetečení`, pt.doc <= pt.okno + 1, JSON.stringify(pt));
    const txt = await textNastroje(p, 'section[aria-labelledby="planovac-nadpis"]');
    tvrdi(`${kod}: náhled návrhu bez českých slov obalu`, ceskeSlova(txt).length === 0, ceskeSlova(txt).join(', '));
    await p.screenshot({ path: `${OUT}k78-rozvrh-${kod}-390.png`, fullPage: true });
    await ctx.close();
  }
  // --- Rozvrh v tmavém režimu: text čitelný
  {
    const { ctx, p } = await zaloz({ jazyk: kod, viewport: { width: 1280, height: 950 }, fix: FIX_ROZVRH, tmavy: true });
    await otevri(p, ROZVRH, 'vedeni.rozvrh');
    const k = await kontrastTextu(p, 'section[aria-labelledby="planovac-nadpis"]');
    tvrdi(`${kod}: Rozvrh v tmavém režimu — text nástroje je čitelný (≥ 3 : 1)`, k.pocet > 10 && k.nejhorsi >= 3, JSON.stringify(k));
    await p.screenshot({ path: `${OUT}k78-rozvrh-${kod}-tmavy.png` });
    await ctx.close();
  }
  // --- Receptury (Sklad)
  {
    for (const [viewport, mobil, nazev] of [[{ width: 1280, height: 950 }, false, 'desktop'], [TEL, true, '390 px']]) {
      const { ctx, p } = await zaloz({ jazyk: kod, viewport, mobil, fix: FIX_RECEPTURY });
      await otevri(p, RECEPTURY, 'vedeni.receptury');
      tvrdi(`${kod}: Receptury (${nazev}) — nadpis „${T.receptury}“`, await p.getByRole('heading', { level: 1, name: T.receptury }).isVisible());
      const txt = await textNastroje(p, '[data-plocha] li[data-widget="nastroj"]');
      tvrdi(`${kod}: Receptury (${nazev}) — nástroj bez českých slov obalu`, ceskeSlova(txt).length === 0, ceskeSlova(txt).join(', '));
      const pt = await preteka(p);
      tvrdi(`${kod}: Receptury (${nazev}) bez vodorovného přetečení`, pt.doc <= pt.okno + 1, JSON.stringify(pt));
      // editor receptury: klepnutí na první řádek seznamu
      await p.locator('[data-plocha] li[data-widget="nastroj"] ul.list li').first().click();
      await p.waitForTimeout(700);
      const ed = await textNastroje(p, '[data-plocha] li[data-widget="nastroj"]');
      tvrdi(`${kod}: Receptury (${nazev}) — editor bez českých slov obalu`, ceskeSlova(ed).length === 0, ceskeSlova(ed).join(', '));
      const pt2 = await preteka(p);
      tvrdi(`${kod}: Receptury — editor (${nazev}) bez vodorovného přetečení`, pt2.doc <= pt2.okno + 1, JSON.stringify(pt2));
      if (mobil) await p.screenshot({ path: `${OUT}k78-receptury-${kod}-390.png`, fullPage: true });
      await ctx.close();
    }
    const { ctx, p } = await zaloz({ jazyk: kod, viewport: { width: 1280, height: 950 }, fix: FIX_RECEPTURY, tmavy: true });
    await otevri(p, RECEPTURY, 'vedeni.receptury');
    const k = await kontrastTextu(p, '[data-plocha] li[data-widget="nastroj"]');
    tvrdi(`${kod}: Receptury v tmavém režimu — text je čitelný (≥ 3 : 1)`, k.pocet > 5 && k.nejhorsi >= 3, JSON.stringify(k));
    await ctx.close();
  }
}
await konec();
