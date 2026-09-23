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
const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, locale: 'cs-CZ' });
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
const where = () => p.evaluate(() => {
  const a = document.activeElement;
  if (!a) return 'nic';
  return `${a.tagName.toLowerCase()}${a.getAttribute('aria-label') ? `[${a.getAttribute('aria-label')}]` : ''}${a.getAttribute('placeholder') ? `{${a.getAttribute('placeholder')}}` : ''}`;
});

// Podněty → „Nový nápad" (modal s autoFocus na prvním poli)
await p.goto('http://localhost:3000/employer/overview?view=suggestions', { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
const add = p.locator('button', { hasText: /Nový nápad|Přidat nápad|Nový podnět/ }).first();
if (await add.count()) {
  await add.click();
  await p.waitForTimeout(700);
  console.log('Podněty, okno „Nový nápad" — fokus na:', await where());
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  console.log('  po Escape fokus na:', await where());
} else {
  console.log('tlačítko nenalezeno; na stránce:', (await p.locator('button').allTextContents()).slice(0,12).join(' | '));
}
await b.close();
