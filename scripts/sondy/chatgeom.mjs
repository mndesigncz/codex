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
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'cs-CZ', isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await ctx.addCookies([{ name: 'next-auth.session-token', value: tok('employer'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
await ctx.route('**/api/**', async route => {
  const u = route.request().url();
  if (u.includes('/api/auth/')) return route.continue();
  if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  const k = keyFor(u);
  if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
  return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
});
const p = await ctx.newPage();
await p.goto('http://localhost:3000/employer/overview?view=chat', { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
await p.locator('text=Týmový chat').first().click();
await p.waitForTimeout(1200);
console.log(JSON.stringify(await p.evaluate(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { t: Math.round(b.top), b: Math.round(b.bottom), h: Math.round(b.height), l: Math.round(b.left), w: Math.round(b.width) }; };
  const scroller = [...document.querySelectorAll('div')].find(d => d.className.includes('overflow-y-auto') && d.className.includes('px-4') && d.className.includes('py-4'));
  return {
    viewport: window.innerHeight,
    main: r(document.querySelector('main')),
    card: r(document.querySelector('main > div')),
    scroller: r(scroller),
    composer: r(document.querySelector('form')),
    dock: r(document.querySelector('nav')),
  };
}, null), null, 1));
await b.close();
