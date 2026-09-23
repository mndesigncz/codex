// Escape nad rozepsaným oknem: musí se zeptat, ne zavřít. A samo to
// potvrzení má na telefonu vyjet zdola jako všechno ostatní.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const DIR = new URL('./fixtury/', import.meta.url).pathname;
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const tok = execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? "design-round-secret-0123456789ab"} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} employer`, { encoding: 'utf8' }).trim();
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'cs-CZ', isMobile: true, hasTouch: true });
await ctx.addCookies([{ name: 'next-auth.session-token', value: tok, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
await ctx.route('**/api/**', async route => {
  const u = route.request().url();
  if (u.includes('/api/auth/')) return route.continue();
  if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  const k = keyFor(u);
  if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
  return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
});
const p = await ctx.newPage();
await p.goto('http://localhost:3000/employer/overview?mode=client&tab=tables', { waitUntil: 'networkidle' });
await p.waitForTimeout(900);
await p.getByRole('button', { name: 'Přidat stůl', exact: false }).first().click();
await p.waitForTimeout(600);
const pole = p.locator('.modal-sheet input').first();
await pole.click();
await pole.type('Terasa 7', { delay: 40 });
await p.waitForTimeout(400);
await p.keyboard.press('Escape');
await p.waitForTimeout(600);
const m = await p.evaluate(() => {
  const g = document.querySelector('.discard-guard [role="alertdialog"]');
  const okno = document.querySelector('.modal-overlay > .modal-sheet');
  if (!g) return { ptaSe: false, oknoZustalo: !!okno };
  const r = g.getBoundingClientRect();
  return { ptaSe: true, oknoZustalo: !!okno, dole: Math.round(window.innerHeight - r.bottom), sirka: Math.round(r.width), okno: window.innerWidth };
});
console.log(`zeptalo se místo zavření: ${m.ptaSe ? 'ano ✓' : 'NE ✗'}`);
console.log(`rozepsané okno zůstalo:   ${m.oknoZustalo ? 'ano ✓' : 'NE ✗'}`);
if (m.ptaSe) console.log(`potvrzení vyjelo zdola:   mezera ${m.dole}px, šířka ${m.sirka}/${m.okno}px ${m.dole <= 1 ? '✓' : '✗'}`);
await p.screenshot({ path: 'shots/guard-mobil.png' });
await b.close();
