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
for (const [name, width, url, role, type] of [
  ['search-inventory-open', 1280, '/employer/inventory', 'employer', 'click'],
  ['search-inventory-open-m', 390, '/employer/inventory', 'employer', 'click'],
  ['search-guides-typed', 1280, '/employer/overview?view=guides', 'employer', 'type'],
]) {
  const ctx = await b.newContext({ viewport: { width, height: width <= 500 ? 844 : 900 }, locale: 'cs-CZ', isMobile: width <= 500, hasTouch: width <= 500 });
  // Na telefonu je výchozí režim TO GO bez hledání — sonda měří plnou aplikaci.
  await ctx.addInitScript(() => { try { localStorage.setItem('managero-app-mode', 'full'); } catch {} });
  await ctx.addCookies([{ name: 'next-auth.session-token', value: tok(role), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.route('**/api/**', async route => {
    const u = route.request().url();
    if (u.includes('/api/auth/')) return route.continue();
    if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    // Kolo 69 (B3): Sklad je plocha s widgety — rozložení (widgety skladu a položky jako nástroj) z fixtury balíku.
    if (new URL(u).pathname === '/api/rozlozeni' && new URL(u).searchParams.get('stranka') === 'vedeni.sklad') return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + 'k69-b3-rozlozeni-sklad.json', 'utf8') });
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  await p.goto('http://localhost:3000' + url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  const input = p.locator('input[placeholder*="Hledat"]').first();
  await input.click();
  await p.waitForTimeout(400);
  if (type === 'type') { await input.pressSequentially('ka', { delay: 70 }); await p.waitForTimeout(500); }
  await p.screenshot({ path: new URL(`./shots/${name}.png`, import.meta.url).pathname });
  console.log(errs.length ? `✗ ${name} PAGEERROR: ${errs.join(' | ')}` : `✓ ${name}`);
  await ctx.close();
}
await b.close();
