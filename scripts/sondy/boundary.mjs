import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
const tok = (r) => execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? "design-round-secret-0123456789ab"} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} ${r}`, { encoding: 'utf8' }).trim();
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'cs-CZ' });
await ctx.addCookies([{ name: 'next-auth.session-token', value: tok('employer'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
await ctx.route('**/api/**', async route => {
  const u = route.request().url();
  if (u.includes('/api/auth/')) return route.continue();
  // Rozbitý tvar: ready:true, ale rows chybí → komponenta sáhne na undefined.rows.map
  if (u.includes('shrinkage')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ready":true}' });
  return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
});
const p = await ctx.newPage();
await p.goto('http://localhost:3000/employer/overview?view=finance', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
const txt = (await p.locator('body').innerText()).slice(0, 400);
console.log('--- co je na obrazovce ---\n' + txt);
await p.screenshot({ path: 'shots/boundary-test.png' });
await b.close();
