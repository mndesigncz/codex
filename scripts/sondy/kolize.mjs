// Potkají se kategorie a stav na jedné obrazovce?
//
// `cat-1`, `cat-2` a `cat-4` mají doslova tytéž hodnoty jako stavové tóny
// ok, info a wait. DESIGN.md to zakazuje, ale otázka, kterou nestačí
// odhadnout: je ta kolize vidět? Když se „druhý typ směny" a stav „info"
// nikdy neocitnou na téže obrazovce, nemá si je člověk s čím splést.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const DIR = new URL('./fixtury/', import.meta.url).pathname;
const VSE = [
  ...JSON.parse(readFileSync(new URL('./screens.json', import.meta.url).pathname, 'utf8')),
  ...JSON.parse(readFileSync(new URL('./screens-client.json', import.meta.url).pathname, 'utf8')),
];
const SCREENS = [...new Map(VSE.map(r => [r[2], r])).values()];
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const tok = (r) => execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? "design-round-secret-0123456789ab"} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} ${r}`, { encoding: 'utf8' }).trim();

// Dvojice, které sdílejí odstín: kategorie ↔ stav.
const AUDIT = `(() => {
  const vidno = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const jsou = (sel) => [...document.querySelectorAll(sel)].filter(vidno).length;
  return {
    cat1: jsou('.cat-1, .cat-dot-1'), ok: jsou('.chip-ok, .note-ok, .dot-ok'),
    cat2: jsou('.cat-2, .cat-dot-2'), info: jsou('.chip-info, .note-info'),
    cat4: jsou('.cat-4, .cat-dot-4'), wait: jsou('.chip-wait, .note-wait, .dot-wait'),
  };
})()`;

const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
const kolize = { 'limetka (cat-1 × ok)': [], 'modrá (cat-2 × info)': [], 'jantarová (cat-4 × wait)': [] };
let kdeKategorie = 0;
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
  await p.waitForTimeout(800);
  const r = await p.evaluate(AUDIT).catch(() => null);
  if (r) {
    if (r.cat1 + r.cat2 + r.cat4) kdeKategorie++;
    if (r.cat1 && r.ok)   kolize['limetka (cat-1 × ok)'].push(`${name} (${r.cat1}×cat, ${r.ok}×stav)`);
    if (r.cat2 && r.info) kolize['modrá (cat-2 × info)'].push(`${name} (${r.cat2}×cat, ${r.info}×stav)`);
    if (r.cat4 && r.wait) kolize['jantarová (cat-4 × wait)'].push(`${name} (${r.cat4}×cat, ${r.wait}×stav)`);
  }
  await ctx.close();
}
console.log(`Obrazovek s kategoriemi: ${kdeKategorie} z ${SCREENS.length}.\n`);
for (const [jmeno, seznam] of Object.entries(kolize)) {
  console.log(`${jmeno}: ${seznam.length} obrazovek, kde jsou obě naráz`);
  for (const x of seznam.slice(0, 6)) console.log('   ' + x);
}
await b.close();
