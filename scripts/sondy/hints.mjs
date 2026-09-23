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
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'cs-CZ' });
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
p.on('pageerror', e => console.log('PAGEERROR:', e.message.slice(0,120)));

await p.goto('http://localhost:3000/employer/overview?view=attendance', { waitUntil: 'networkidle' });
await p.waitForTimeout(900);
const before = await p.locator('h1').first().locator('..').innerText();
console.log('1) popis před zavřením:', JSON.stringify(before.split('\n')[1] ?? ''));

await p.locator('button[aria-label="Skrýt tenhle popis"]').first().click({ force: true });
await p.waitForTimeout(400);
const after = await p.locator('h1').first().locator('..').innerText();
console.log('2) po zavření:', JSON.stringify(after.trim()));
console.log('   localStorage:', await p.evaluate(() => localStorage.getItem('managero-hint-attendance')));

await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(900);
const afterReload = await p.locator('h1').first().locator('..').innerText();
console.log('3) po obnovení stránky zůstal zavřený:', afterReload.trim() === after.trim());

// Nastavení → Vzhled: vrátit
await p.goto('http://localhost:3000/employer/overview?view=settings', { waitUntil: 'networkidle' });
await p.waitForTimeout(900);
await p.getByRole('button', { name: /Vzhled/ }).first().click();
await p.waitForTimeout(600);
await p.screenshot({ path: 'shots/hints-settings.png' });
const hasReset = await p.getByRole('button', { name: /Zobrazit znovu/ }).count();
console.log('4) v Nastavení je tlačítko na vrácení:', hasReset > 0);
if (hasReset) {
  await p.getByRole('button', { name: /Zobrazit znovu/ }).first().click();
  await p.waitForTimeout(400);
  console.log('   po vrácení localStorage:', await p.evaluate(() => localStorage.getItem('managero-hint-attendance')));
}
await b.close();
