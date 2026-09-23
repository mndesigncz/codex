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
const ctx = await b.newContext({ viewport: { width: 768, height: 1024 }, locale: 'cs-CZ', isMobile: true, hasTouch: true });
await ctx.addCookies([{ name: 'next-auth.session-token', value: tok('kiosk'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
await ctx.route('**/api/**', async route => {
  const u = route.request().url();
  if (u.includes('/api/auth/')) return route.continue();
  if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  const k = keyFor(u);
  if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
  return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
});
const p = await ctx.newPage();
await p.goto('http://localhost:3000/kiosk', { waitUntil: 'networkidle' });
await p.waitForTimeout(1000);
console.log(await p.evaluate(() => {
  const out = [];
  document.querySelectorAll('main .glass-card, main > div').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.height < 30) return;
    out.push(`${Math.round(r.left)}–${Math.round(r.right)} (${Math.round(r.width)}px) ${(el.textContent||'').trim().slice(0,32)}`);
  });
  const nav = document.querySelector('nav');
  if (nav) out.push(`NAV scrollWidth ${nav.scrollWidth} clientWidth ${nav.clientWidth}`);
  return out.join('\n');
}));
await b.close();
