// Co stálo líné načítání pohledů: jak dlouho trvá přepnutí záložky.
//
// Kolo 39 sneslo první načtení ze 421 na 160 kB, ale zaplatilo se to tím,
// že se pohled stahuje až při otevření. Otázka, kterou nestačí odhadnout:
// probliká kostra rušivě, nebo je to nepozorovatelné?
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const DIR = new URL('./fixtury/', import.meta.url).pathname;
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const tok = (r) => execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? "design-round-secret-0123456789ab"} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} ${r}`, { encoding: 'utf8' }).trim();

const ZALOZKY = ['Rozvrh', 'Sklad', 'Úkoly', 'Chat', 'Postupy', 'Finance'];
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });

for (const [popis, rychlost] of [['bez omezení', null], ['pomalá 3G', { download: 400 * 1024 / 8, upload: 400 * 1024 / 8, latency: 400 }]]) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'cs-CZ' });
  await ctx.addCookies([{ name: 'next-auth.session-token', value: tok('employer'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.route('**/api/**', async route => {
    const u = route.request().url();
    if (u.includes('/api/auth/')) return route.continue();
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p = await ctx.newPage();
  if (rychlost) { const cdp = await ctx.newCDPSession(p); await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, ...rychlost }); }
  await p.goto('http://localhost:3000/employer/overview?view=overview', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(1500);
  console.log(`\n=== ${popis} ===`);
  for (const z of ZALOZKY) {
    const btn = p.locator('button:visible, a:visible').filter({ hasText: new RegExp(`^${z}$`) }).first();
    if (!(await btn.count().catch(() => 0))) { console.log(`  ? ${z}: nenalezeno`); continue; }
    const t0 = Date.now();
    await btn.click({ timeout: 5000 }).catch(() => {});
    // Kostra zmizí, až je pohled na obrazovce.
    await p.waitForFunction(() => !document.querySelector('.animate-pulse, [data-skeleton]'), { timeout: 20000 }).catch(() => {});
    const ms = Date.now() - t0;
    console.log(`  ${z.padEnd(10)} ${String(ms).padStart(5)} ms`);
  }
  await ctx.close();
}
await b.close();
