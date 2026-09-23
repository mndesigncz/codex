// Je vidět, kde zrovna jsem?
//
// Kolo 7 zařídilo, že se klávesnicí dá všude dojít. Jestli je poznat, na
// čem fokus stojí, nikdo neměřil — a bez toho je průchod klávesnicí chůze
// poslepu.
//
// Pozor na past, do které spadla první verze téhle sondy: aplikace kreslí
// prstenec přes `:focus-visible`, což je správně (u myši se neukazuje).
// Programové `el.focus()` ale `:focus-visible` nespustí, takže se první
// verzi jevilo 30 z 92 prvků jako „bez označení" — falešně. Proto se tu
// mačká skutečný Tab.
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

// Co se počítá za viditelné označení: obrys nebo prstenec ve stínu.
const ZNAK = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return null;
  const cs = getComputedStyle(el);
  const obrys = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0
    && !/rgba\\(0,\\s*0,\\s*0,\\s*0\\)|transparent/.test(cs.outlineColor);
  const prstenec = cs.boxShadow !== 'none' && /0px 0px 0px [1-9]/.test(cs.boxShadow);
  const kde = (el.className || '').toString().replace(/\\s+/g, ' ').slice(0, 46) || el.tagName.toLowerCase();
  return { ok: obrys || prstenec, kde, tag: el.tagName.toLowerCase(),
           jmeno: (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\\s+/g,' ').slice(0, 24) };
})()`;

const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
let celkem = 0, bez = 0;
const vzorky = new Map();
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
  await p.waitForTimeout(900);
  let naObrazovce = 0, bezTady = 0;
  const videno = new Set();
  for (let i = 0; i < 35; i++) {
    await p.keyboard.press('Tab');
    const r = await p.evaluate(ZNAK).catch(() => null);
    if (!r) continue;
    const klic = r.tag + '|' + r.kde + '|' + r.jmeno;
    if (videno.has(klic)) continue;
    videno.add(klic);
    naObrazovce++;
    if (!r.ok) { bezTady++; const v = `${r.tag} ${r.kde}`; vzorky.set(v, (vzorky.get(v) ?? 0) + 1); }
  }
  celkem += naObrazovce; bez += bezTady;
  if (bezTady) console.log(`  ✗ ${name}: ${bezTady} z ${naObrazovce} bez viditelného fokusu`);
  await ctx.close();
}
console.log(`\nProšlo Tabem ${celkem} prvků. Bez viditelného označení: ${bez}.`);
for (const [v, n] of [...vzorky.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 10)) console.log(`  ${String(n).padStart(4)}×  ${v}`);
await b.close();
