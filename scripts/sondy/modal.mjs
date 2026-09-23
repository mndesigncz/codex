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
for (const w of [1280, 390]) {
  const ctx = await b.newContext({ viewport: { width: w, height: w <= 500 ? 844 : 800 }, locale: 'cs-CZ', isMobile: w <= 500, hasTouch: w <= 500 });
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
  const errs = []; p.on('pageerror', e => errs.push(e.message.slice(0, 100)));
  await p.goto('http://localhost:3000/employer/planning', { waitUntil: 'networkidle' });
  await p.waitForTimeout(900);
  // otevřít „···" na první kartě a zvolit Upravit kartu
  const more = p.locator('button[aria-label*="Další"], button:has-text("···")').first();
  try { await more.click({ timeout: 4000 }); await p.waitForTimeout(350);
        await p.getByText('Upravit kartu').first().click({ timeout: 4000 }); await p.waitForTimeout(500); }
  catch { console.log(`  (${w}) nabídku se nepodařilo otevřít`); }
  await p.screenshot({ path: `shots/modal-planning-${w}.png` });
  console.log(errs.length ? `✗ ${w} ${errs[0]}` : `✓ okno ${w}`);
  await ctx.close();
}
await b.close();
