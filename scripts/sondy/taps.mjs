import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const DIR = new URL('./fixtury/', import.meta.url).pathname;
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const tok = (r) => execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? "design-round-secret-0123456789ab"} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} ${r}`, { encoding: 'utf8' }).trim();
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
const SCREENS = JSON.parse(readFileSync('screens.json', 'utf8'));
const tally = new Map();
for (const [name, role, path] of SCREENS) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'cs-CZ', isMobile: true, hasTouch: true });
  if (role) await ctx.addCookies([{ name: 'next-auth.session-token', value: tok(role), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.route('**/api/**', async route => {
    const u = route.request().url();
    if (u.includes('/api/auth/')) return route.continue();
    if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p = await ctx.newPage();
  try {
    await p.goto('http://localhost:3000' + path, { waitUntil: 'networkidle', timeout: 25000 });
    await p.waitForTimeout(900);
    const small = await p.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('button, a[href], [role=button], select, input[type=checkbox]')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.height >= 34 && r.width >= 34) continue;
        const label = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 34);
        out.push(`${Math.round(r.width)}×${Math.round(r.height)} · ${label}`);
      }
      return out;
    });
    for (const s of small) tally.set(s, (tally.get(s) || 0) + 1);
  } catch {}
  await ctx.close();
}
await b.close();
const sorted = [...tally.entries()].sort((a, c) => c[1] - a[1]);
console.log(`celkem druhů malých cílů: ${sorted.length}`);
for (const [k, v] of sorted.slice(0, 30)) console.log(`${String(v).padStart(3)}×  ${k}`);
