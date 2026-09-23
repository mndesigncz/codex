// Přístupnost: co odečítač obrazovky přečte. Klávesnici jsme řešili
// v kole 7, jména a popisky nikdy.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const DIR = new URL('./fixtury/', import.meta.url).pathname;
const SCREENS = JSON.parse(readFileSync(new URL('./screens.json', import.meta.url).pathname, 'utf8'));
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const tok = (r) => execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? "design-round-secret-0123456789ab"} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} ${r}`, { encoding: 'utf8' }).trim();

const AUDIT = `(() => {
  const vidno = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  // Přístupné jméno: co odečítač řekne. Zjednodušeně, ale poctivě.
  const jmeno = (el) => {
    const lab = el.getAttribute('aria-label');
    if (lab && lab.trim()) return lab.trim();
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const t = by.split(/\\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' ').trim();
      if (t) return t;
    }
    if (el.id) {
      const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (l?.textContent?.trim()) return l.textContent.trim();
    }
    if (el.closest('label')?.textContent?.trim()) return el.closest('label').textContent.trim();
    const txt = (el.innerText || el.textContent || '').trim();
    if (txt) return txt;
    const t = el.getAttribute('title');
    if (t && t.trim()) return t.trim();
    const ph = el.getAttribute('placeholder');
    if (ph && ph.trim()) return '(jen placeholder) ' + ph.trim();
    const alt = el.querySelector('img[alt]')?.getAttribute('alt');
    if (alt && alt.trim()) return alt.trim();
    return '';
  };
  const kde = (el) => (el.className || '').toString().replace(/\\s+/g, ' ').slice(0, 48);

  const bezJmena = [];
  for (const el of document.querySelectorAll('button, a[href], [role="button"], summary')) {
    if (!vidno(el) || el.closest('[aria-hidden="true"]')) continue;
    const n = jmeno(el);
    if (!n) bezJmena.push(kde(el) || el.tagName.toLowerCase());
  }

  const poleBezPopisku = [];
  for (const el of document.querySelectorAll('input, select, textarea')) {
    if (!vidno(el)) continue;
    const typ = (el.getAttribute('type') || '').toLowerCase();
    if (typ === 'hidden') continue;
    const n = jmeno(el);
    if (!n) poleBezPopisku.push((el.getAttribute('name') || kde(el) || el.tagName.toLowerCase()));
    else if (n.startsWith('(jen placeholder)')) poleBezPopisku.push(n);
  }

  const obrBezAlt = [];
  for (const el of document.querySelectorAll('img')) {
    if (!vidno(el)) continue;
    if (el.getAttribute('alt') === null) obrBezAlt.push((el.getAttribute('src') || '').slice(0, 40));
  }

  // aria-* ukazující do prázdna: odečítač pak nepřečte nic.
  const slepeOdkazy = [];
  for (const el of document.querySelectorAll('[aria-labelledby], [aria-describedby], [aria-controls]')) {
    for (const attr of ['aria-labelledby', 'aria-describedby', 'aria-controls']) {
      const v = el.getAttribute(attr);
      if (!v) continue;
      for (const id of v.split(/\\s+/)) {
        if (id && !document.getElementById(id)) slepeOdkazy.push(attr + '="' + id + '" na ' + kde(el));
      }
    }
  }

  const h1 = document.querySelectorAll('h1').length;
  return { bezJmena, poleBezPopisku, obrBezAlt, slepeOdkazy, h1 };
})()`;

const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
const soucet = { bezJmena: 0, poleBezPopisku: 0, obrBezAlt: 0, slepeOdkazy: 0, bezH1: 0 };
const vzorky = { bezJmena: new Map(), poleBezPopisku: new Map(), slepeOdkazy: new Map() };
for (const [name, role, path] of SCREENS) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'cs-CZ' });
  if (role) await ctx.addCookies([{ name: 'next-auth.session-token', value: tok(role), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.route('**/api/**', async route => {
    const u = route.request().url();
    if (u.includes('/api/auth/')) return route.continue();
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p = await ctx.newPage();
  await p.goto('http://localhost:3000' + path, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const r = await p.evaluate(AUDIT);
  soucet.bezJmena += r.bezJmena.length;
  soucet.poleBezPopisku += r.poleBezPopisku.length;
  soucet.obrBezAlt += r.obrBezAlt.length;
  soucet.slepeOdkazy += r.slepeOdkazy.length;
  if (r.h1 === 0) soucet.bezH1++;
  for (const k of ['bezJmena', 'poleBezPopisku', 'slepeOdkazy']) for (const v of r[k]) vzorky[k].set(v, (vzorky[k].get(v) ?? 0) + 1);
  const potiz = r.bezJmena.length + r.poleBezPopisku.length + r.obrBezAlt.length + r.slepeOdkazy.length;
  if (potiz) console.log(`  ✗ ${name}: ${r.bezJmena.length} bez jména · ${r.poleBezPopisku.length} polí bez popisku · ${r.obrBezAlt.length} obrázků bez alt · ${r.slepeOdkazy.length} slepých aria`);
  await ctx.close();
}
console.log(`\nCelkem: ${soucet.bezJmena} ovládacích prvků bez přístupného jména, ${soucet.poleBezPopisku} polí bez popisku, ${soucet.obrBezAlt} obrázků bez alt, ${soucet.slepeOdkazy} aria do prázdna, ${soucet.bezH1} obrazovek bez h1.`);
for (const [k, m] of Object.entries(vzorky)) {
  const top = [...m.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 6);
  if (top.length) console.log(`${k}:`, top.map(([v, n]) => `${n}× ${v}`).join(' | '));
}
await b.close();
