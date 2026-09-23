// Chat: seznam → vlákno → výběr kolegy, na telefonu i na monitoru.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const DIR = new URL('./fixtury/', import.meta.url).pathname;
const OUT = new URL('./shots/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const tok = (r) => execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? "design-round-secret-0123456789ab"} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} ${r}`, { encoding: 'utf8' }).trim();

const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });

async function ctxFor(w) {
  const ctx = await b.newContext({ viewport: { width: w, height: w <= 500 ? 844 : 860 }, locale: 'cs-CZ', isMobile: w <= 500, hasTouch: w <= 500, deviceScaleFactor: 1 });
  await ctx.addCookies([{ name: 'next-auth.session-token', value: tok('employer'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.route('**/api/**', async route => {
    const u = route.request().url();
    if (u.includes('/api/auth/')) return route.continue();
    if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"id":4}' });
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  return ctx;
}

const errs = [];
for (const w of [390, 1280]) {
  const ctx = await ctxFor(w);
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(`${w}: ${String(e).slice(0, 120)}`));
  await p.goto('http://localhost:3000/employer/overview?view=chat', { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForTimeout(1400);
  await p.screenshot({ path: `${OUT}chat-list-${w}.png` });
  console.log(w, 'seznam — konverzací:', await p.locator('text=Týmový chat').count(), '| filtr nepřečtené:', await p.locator('text=/Nepřečtené · /').count());

  // vlákno
  await p.locator('text=Týmový chat').first().click();
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${OUT}chat-thread-${w}.png` });
  const seps = await p.locator('.t-label', { hasText: /Dnes|Včera|pondělí|úterý|středa|čtvrtek|pátek|sobota|neděle/ }).count();
  const unreadLine = await p.locator('.t-label', { hasText: 'Nepřečtené' }).count();
  const bubbles = await p.locator('.whitespace-pre-wrap').count();
  console.log(w, 'vlákno — bublin:', bubbles, '| oddělovačů dne:', seps, '| čára nepřečtené:', unreadLine);

  // víceřádkový composer
  const box = p.locator('textarea[aria-label="Text zprávy"]');
  const h0 = await box.boundingBox();
  await box.fill('první řádek\ndruhý řádek\ntřetí řádek');
  await p.waitForTimeout(300);
  const h1 = await box.boundingBox();
  console.log(w, 'composer roste:', Math.round(h0.height), '→', Math.round(h1.height));
  await box.fill('');

  // nová zpráva
  if (w === 390) await p.locator('button[aria-label="Zpět"]').first().click();
  await p.waitForTimeout(500);
  await p.locator('button', { hasText: /^Nová$/ }).first().click();
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${OUT}chat-new-${w}.png` });
  console.log(w, 'výběr kolegy — lidí:', await p.locator('.list-row').count(),
    '| kiosk skrytý:', (await p.locator('text=Kiosk').count()) === 0,
    '| „už si píšete":', await p.locator('text=Už si píšete').count());

  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (over > 2) console.log(w, '⚠ overflow', over);
  await ctx.close();
}

// TO GO na telefonu — dlaždice a karta poslední nepřečtené
{
  const ctx = await ctxFor(390);
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(`togo: ${String(e).slice(0, 120)}`));
  await p.goto('http://localhost:3000/employer/overview', { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForTimeout(1800);
  await p.screenshot({ path: `${OUT}chat-togo-390.png`, fullPage: true });
  console.log('TO GO — dlaždice Zprávy:', await p.locator('text=Zprávy').count(),
    '| karta nepřečtené:', await p.locator('text=Nepřečtená zpráva').count());
  await ctx.close();
}

console.log(errs.length ? 'CHYBY: ' + errs.join(' | ') : 'bez chyb v konzoli');
await b.close();
