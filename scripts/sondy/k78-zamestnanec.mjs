// Kolo 78 — vícejazyčnost portálu zaměstnance, tabletu a chatu.
//
// Tvrdí (na telefonu 390 × 844, němčina a angličtina, a v tmavém režimu):
//  • zaměstnanecké obrazovky (Moje směny, Úkoly, Sklad, Uzávěrka, Dostupnost, Odměny, Chat) ukážou
//    už v prvním HTML přeložené texty (slovník se načítá v layoutu /employee, ne až po přepnutí),
//    bez českých vět sekcí `zamestnanec` a `chat`;
//  • tablet (/kiosk): záložky, zamčená obrazovka a chat v jazyce obsluhy;
//  • na 390 px nic nepřetéká (ani dokument, ani tlačítka, záložky a chipy, které by text ořízly);
//  • v tmavém režimu žádný text nesplyne s podkladem.
//
// Jazyk se nastavuje cookie `managero-lang` (stejně jako ho zapíše přepínač), takže sonda
// ověřuje i serverové vykreslení slovníku. Čeština se hlídá ostatními sondami beze změny.
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, roleMine, DIR, OUT, BASE } from './k68-spolecne.mjs';

const nacti = (jmeno) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8'));
const TEL = { width: 390, height: 844 };
const BARISTA = roleMine('barista');
const KIOSK = roleMine('kiosk');

/** Obrazovky zaměstnance: adresa, fixtura rozložení plochy, očekávané německé a české věty. */
const OBRAZOVKY = [
  { id: 'moje-smeny', url: '/employee/shifts?view=my-shifts', fix: 'k69-b1-rozlozeni-moje-zamestnanec', plocha: 'zamestnanec.moje_smeny',
    de: ['Meine Schichten', 'Kommende Schichten'], en: ['My shifts', 'Upcoming shifts'], cs: ['Nadcházející směny', 'Do kalendáře'] },
  { id: 'ukoly', url: '/employee/shifts?view=tasks', fix: 'k69-b6a-rozlozeni-ukoly-zam', plocha: 'zamestnanec.ukoly',
    de: ['Aufgaben'], en: ['Tasks'], cs: ['Žádné úkoly', 'Zobrazení'] },
  { id: 'sklad', url: '/employee/shifts?view=inventory', fix: 'k69-b3-rozlozeni-sklad-zam', plocha: 'zamestnanec.sklad',
    de: ['Lager', 'Alle Artikel'], en: ['Stock', 'All items'], cs: ['Všechny položky', 'Hledat položku'] },
  { id: 'uzaverka', url: '/employee/shifts?view=closing', fix: 'k69-b5a-rozlozeni-uzaverka', plocha: 'zamestnanec.uzaverka',
    de: ['Schichtabschluss', 'Kassenprüfung'], en: ['Shift closing', 'Till check'], cs: ['Uzávěrka směny', 'Kontrola kasy', 'Tržby'] },
  { id: 'dostupnost', url: '/employee/shifts?view=availability', fix: 'k69-b1-rozlozeni-dostupnost', plocha: 'zamestnanec.dostupnost',
    de: ['Verfügbarkeitskalender', 'Urlaub und Freizeit'], en: ['Availability calendar', 'Vacation and time off'], cs: ['Kalendář dostupnosti', 'Dovolená a volno'] },
  { id: 'odmeny', url: '/employee/shifts?view=rewards', fix: 'k69-b7-rozlozeni-odmeny-zam', plocha: 'zamestnanec.odmeny',
    de: ['Belohnungen'], en: ['Rewards'], cs: ['Body za směny'] },
  { id: 'chat', url: '/employee/shifts?view=chat', fix: null, plocha: null,
    de: ['Nachrichten'], en: ['Messages'], cs: ['Zprávy'] },
];

const podvrh = (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  if (path === '/api/account' && req.method() === 'PATCH') { (stav.ucet ??= []).push(req.postDataJSON()); return json({ ok: true, user: {} }); }
  if (path === '/api/closings/handover' && req.method() === 'GET') return json(nacti('k69-b9-handover'));
  if (path === '/api/procedures/runs' && req.method() === 'GET') return json(nacti('k69-b6b-runs'));
  return undefined;
};

async function otevriEmployee(p, o) {
  await p.goto(BASE + o.url, { waitUntil: 'networkidle' });
  if (o.plocha) await p.locator(`[data-plocha="${o.plocha}"] li[data-instance]:not([hidden])`).first().waitFor({ timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(1200);
}

/** Prvky, které čnějí za pravý okraj okna (mimo vodorovně posuvné kontejnery) — příčina přetečení. */
const preteceni = (p) => p.evaluate(() => {
  const okno = window.innerWidth;
  const out = [];
  const vPosuvnem = (el) => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const o = getComputedStyle(e).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true; } return false; };
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest('.sr-only, [hidden], [aria-hidden="true"]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const st = getComputedStyle(el);
    if (st.position === 'fixed' || st.visibility === 'hidden' || st.display === 'none') continue;
    if (r.right > okno + 1 && !vPosuvnem(el)) out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')} right=${Math.round(r.right)} „${(el.textContent || '').trim().slice(0, 30)}"`);
  }
  return { dokument: document.documentElement.scrollWidth - okno, prvky: out.slice(0, 5) };
});

/** Tlačítka, záložky a chipy, kterým text ořezává okraj (mimo záměrné `.truncate` / `line-clamp`). */
const orezane = (p) => p.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('button, a.btn, .chip, [class*="filter-pill"], [role="tab"], [role="radio"], [role="menuitem"]')) {
    if (el.closest('.sr-only, [hidden], [aria-hidden="true"]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const st = getComputedStyle(el);
    if (st.overflowX === 'visible') {
      // text přesahuje vnitřní obsah tlačítka (nowrap) — přesah o víc než vnitřní odsazení
      if (el.scrollWidth > el.clientWidth + 2 && st.whiteSpace === 'nowrap') out.push(`${el.tagName.toLowerCase()} „${(el.textContent || '').trim().slice(0, 30)}" ${el.scrollWidth}>${el.clientWidth}`);
      continue;
    }
    const uvnitrTruncate = [...el.querySelectorAll('*')].some(c => /\btruncate\b|\bline-clamp/.test(String(c.className)) ) || /\btruncate\b|\bline-clamp/.test(String(el.className));
    if (!uvnitrTruncate && el.scrollWidth > el.clientWidth + 2) out.push(`${el.tagName.toLowerCase()} „${(el.textContent || '').trim().slice(0, 30)}" ${el.scrollWidth}>${el.clientWidth}`);
  }
  return out.slice(0, 6);
});

const cs = (t) => t.replace(/\s+/g, ' ');

// ============================================================ zaměstnanec: němčina a angličtina na telefonu
for (const [kod, klic] of [['de', 'de'], ['en', 'en']]) {
  for (const o of OBRAZOVKY) {
    const k = await kontext({ role: 'employee', viewport: TEL, mobil: true, mineData: BARISTA, dalsi: podvrh, fix: o.fix ? nacti(o.fix) : nacti('k69-b6a-rozlozeni-ukoly-zam') });
    await k.ctx.addCookies([{ name: 'managero-lang', value: kod, domain: 'localhost', path: '/' }]);
    await otevriEmployee(k.p, o);
    const text = cs(await k.p.evaluate(() => document.body.innerText));
    tvrdi(`${kod} · ${o.id}: <html lang="${kod}">`, await k.p.evaluate(() => document.documentElement.lang) === kod);
    for (const veta of o[klic]) tvrdi(`${kod} · ${o.id}: „${veta}" je přeloženo`, text.includes(veta), text.slice(0, 220));
    for (const veta of o.cs) tvrdi(`${kod} · ${o.id}: bez české věty „${veta}"`, !text.includes(veta), veta);
    const pt = await preteceni(k.p);
    tvrdi(`${kod} · ${o.id}: na 390 px bez vodorovného přetečení`, pt.dokument <= 0 && pt.prvky.length === 0, JSON.stringify(pt));
    const oz = await orezane(k.p);
    tvrdi(`${kod} · ${o.id}: tlačítka, záložky a chipy nemají oříznutý text`, oz.length === 0, oz.join(' | '));
    if (kod === 'de') await k.p.screenshot({ path: `${OUT}k78-${o.id}-de-390.png`, fullPage: true });
    tvrdi(`${kod} · ${o.id}: stránka bez chyby ve skriptu`, k.chyby.filter(c => !/Failed to load|net::ERR|fetch/i.test(c)).length === 0, k.chyby[0]);
    await k.ctx.close();
  }
}

// ============================================================ přepnutí jazyka z nabídky zaměstnance (klient)
{
  const { ctx, p, stav } = await kontext({ role: 'employee', viewport: TEL, mobil: true, mineData: BARISTA, dalsi: podvrh, fix: nacti('k69-b6a-rozlozeni-ukoly-zam') });
  await p.goto(BASE + '/employee/shifts?view=tasks', { waitUntil: 'networkidle' });
  await p.locator('[data-plocha="zamestnanec.ukoly"] li[data-instance]:not([hidden])').first().waitFor({ timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(800);
  tvrdi('přepnutí: česky je přepínač „Seznam" a „Týden"', /Seznam/.test(cs(await p.evaluate(() => document.body.innerText))));
  await p.getByRole('button', { name: 'Více' }).click();
  await p.getByRole('button', { name: /^Jazyk: Čeština/ }).click();
  await p.getByRole('radio', { name: /Deutsch/ }).click();
  await p.waitForFunction(() => document.documentElement.lang === 'de', null, { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(1500);
  await p.keyboard.press('Escape');
  const text = cs(await p.evaluate(() => document.body.innerText));
  tvrdi('přepnutí: po přepnutí na němčinu je nadpis „Aufgaben" a přepínač „Liste" bez nového načtení stránky', text.includes('Aufgaben') && text.includes('Liste') && !text.includes('Seznam'), text.slice(0, 200));
  tvrdi('přepnutí: jazyk se uložil na účet (PATCH /api/account)', !!stav.ucet?.some(x => x.lang === 'de'), JSON.stringify(stav.ucet));
  await ctx.close();
}

// ============================================================ tablet
for (const [kod, nazvy, zamek] of [
  ['de', ['Schicht', 'Aufgaben', 'Abläufe', 'Lager', 'Bestellungen', 'Kassenabschluss', 'Anleitungen'], 'Das Tablet wartet auf eine Schicht'],
  ['en', ['Shift', 'Tasks', 'Procedures', 'Stock', 'Orders', 'Closing', 'Guides'], 'The tablet is waiting for a shift'],
]) {
  const { ctx, p } = await kontext({ role: 'kiosk', viewport: { width: 1024, height: 1366 }, mobil: true, mineData: KIOSK, dalsi: podvrh, fix: nacti('k69-b9-rozlozeni-smena') });
  await ctx.addCookies([{ name: 'managero-lang', value: kod, domain: 'localhost', path: '/' }]);
  await p.goto(BASE + '/kiosk', { waitUntil: 'networkidle' });
  await p.locator('[data-plocha="kiosk.smena"] li[data-instance]:not([hidden])').first().waitFor({ timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(1000);
  const tabs = await p.locator('nav button').evaluateAll(els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  tvrdi(`tablet ${kod}: záložky v jazyce obsluhy`, nazvy.every(n => tabs.some(t => t.startsWith(n))), JSON.stringify(tabs));
  tvrdi(`tablet ${kod}: <html lang="${kod}">`, await p.evaluate(() => document.documentElement.lang) === kod);
  const text = cs(await p.evaluate(() => document.body.innerText));
  tvrdi(`tablet ${kod}: bez českých záložek (Směna, Úkoly, Uzávěrka)`, !/\bSměna\b|\bÚkoly\b|\bUzávěrka\b/.test(text), text.slice(0, 200));
  await p.getByRole('button', { name: new RegExp(`^${nazvy[5]}`) }).click();
  await p.waitForTimeout(1200);
  const t2 = cs(await p.evaluate(() => document.body.innerText));
  tvrdi(`tablet ${kod}: Uzávěrka bez směny ukáže zamčený tablet (nebo uzávěrku) v jazyce`, t2.includes(zamek) || t2.includes(nazvy[5]), t2.slice(0, 160));
  await p.screenshot({ path: `${OUT}k78-kiosk-${kod}.png` });
  await ctx.close();
}
{
  // telefon 390: záložky tabletu a zamčená obrazovka v němčině bez přetečení
  const a = nacti('attendance');
  const nikdo = { ...a, roster: a.roster.map(r => ({ ...r, openSince: null, openEntryId: null })) };
  const { ctx, p } = await kontext({ role: 'kiosk', viewport: TEL, mobil: true, mineData: KIOSK, fix: nacti('k69-b9-rozlozeni-smena'),
    dalsi: (req, json, stav) => { if (new URL(req.url()).pathname === '/api/attendance' && req.method() === 'GET') return json(nikdo); return podvrh(req, json, stav); } });
  await ctx.addCookies([{ name: 'managero-lang', value: 'de', domain: 'localhost', path: '/' }]);
  await p.goto(BASE + '/kiosk', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  const text = cs(await p.evaluate(() => document.body.innerText));
  tvrdi('tablet de 390: zamčená obrazovka německy („Ich bin in der Schicht")', text.includes('Das Tablet wartet auf eine Schicht') && text.includes('Ich bin in der Schicht'), text.slice(0, 240));
  const pt = await preteceni(p);
  tvrdi('tablet de 390: bez vodorovného přetečení', pt.dokument <= 0 && pt.prvky.length === 0, JSON.stringify(pt));
  const oz = await orezane(p);
  tvrdi('tablet de 390: tlačítka a záložky bez oříznutého textu', oz.length === 0, oz.join(' | '));
  await p.getByRole('button', { name: 'Ich bin in der Schicht' }).click();
  await p.waitForTimeout(600);
  const pt2 = await preteceni(p);
  tvrdi('tablet de 390: výběr příchodu bez přetečení', pt2.dokument <= 0 && pt2.prvky.length === 0, JSON.stringify(pt2));
  await p.screenshot({ path: `${OUT}k78-kiosk-zamek-de-390.png`, fullPage: true });
  await ctx.close();
}

// ============================================================ tmavý režim: žádný text nesplyne s podkladem
const neviditelne = (p) => p.evaluate(() => {
  const barva = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[, /]+/).map(Number); return { r, g, b, a }; };
  const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const podklad = (el) => { for (let e = el; e; e = e.parentElement) { const c = barva(getComputedStyle(e).backgroundColor); if (c && c.a > 0.85) return c; } return barva(getComputedStyle(document.body).backgroundColor) ?? { r: 255, g: 255, b: 255, a: 1 }; };
  const out = [];
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const t = n.textContent.trim();
    if (t.length < 2 || /^\p{Extended_Pictographic}+$/u.test(t)) continue;
    const el = n.parentElement;
    if (!el || el.closest('.sr-only, [hidden], [aria-hidden="true"], script, style') || el.offsetParent === null) continue;
    const st = getComputedStyle(el);
    if (Number(st.opacity) < 0.05) continue;
    const c = barva(st.color); if (!c) continue;
    const bg = podklad(el);
    const l1 = lum(c), l2 = lum(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    if (ratio < 1.6) out.push(`„${t.slice(0, 26)}" ${ratio.toFixed(2)}`);
  }
  return out.slice(0, 6);
});
for (const o of [OBRAZOVKY[0], OBRAZOVKY[3], OBRAZOVKY[6]]) {
  const k = await kontext({ role: 'employee', viewport: TEL, mobil: true, tmavy: true, mineData: BARISTA, dalsi: podvrh, fix: o.fix ? nacti(o.fix) : nacti('k69-b6a-rozlozeni-ukoly-zam') });
  await k.ctx.addCookies([{ name: 'managero-lang', value: 'de', domain: 'localhost', path: '/' }]);
  await otevriEmployee(k.p, o);
  const text = cs(await k.p.evaluate(() => document.body.innerText));
  tvrdi(`tmavý · ${o.id} (de): texty jsou vidět (přeloženo: „${o.de[0]}")`, text.includes(o.de[0]), text.slice(0, 160));
  const nev = await neviditelne(k.p);
  tvrdi(`tmavý · ${o.id} (de): žádný text nesplyne s podkladem`, nev.length === 0, nev.join(' | '));
  await k.p.screenshot({ path: `${OUT}k78-${o.id}-de-tmavy-390.png` });
  await k.ctx.close();
}
{
  const { ctx, p } = await kontext({ role: 'kiosk', viewport: { width: 1024, height: 1366 }, mobil: true, tmavy: true, mineData: KIOSK, dalsi: podvrh, fix: nacti('k69-b9-rozlozeni-smena') });
  await ctx.addCookies([{ name: 'managero-lang', value: 'de', domain: 'localhost', path: '/' }]);
  await p.goto(BASE + '/kiosk', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  const nev = await neviditelne(p);
  tvrdi('tmavý · tablet (de): žádný text nesplyne s podkladem', nev.length === 0, nev.join(' | '));
  await ctx.close();
}
await konec();
