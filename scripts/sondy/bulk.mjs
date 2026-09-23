// Hromadné akce ve frontách ke schválení: výběr, „Vybrat vše", jeden zásah.
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

const problems = [];
const ok = (m) => console.log('  ✓', m);
const bad = (m) => { console.log('  ✗', m); problems.push(m); };

async function open(url, w = 1280) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, locale: 'cs-CZ', isMobile: w <= 500, hasTouch: w <= 500 });
  await ctx.addCookies([{ name: 'next-auth.session-token', value: tok('employer'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const sent = [];
  await ctx.route('**/api/**', async route => {
    const u = route.request().url();
    if (u.includes('/api/auth/')) return route.continue();
    if (route.request().method() !== 'GET') {
      sent.push(`${route.request().method()} ${u.replace('http://localhost:3000', '')}`);
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    }
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  await p.goto('http://localhost:3000' + url, { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForTimeout(1600);
  return { ctx, p, errs, sent };
}

async function queue(name, url, expectPending, shot, w = 1280) {
  console.log(`${name}:`);
  const { ctx, p, errs, sent } = await open(url, w);
  const more = p.locator('button', { hasText: /^Vybrat víc$/ });
  if (await more.count() === 0) { bad(`${name}: tlačítko „Vybrat víc" není (fronta prázdná?)`); await ctx.close(); return; }
  await more.first().click();
  await p.waitForTimeout(400);
  const boxes = await p.locator('[role="checkbox"]').count();
  boxes === expectPending ? ok(`zaškrtávátek: ${boxes}`) : bad(`${name}: čekáno ${expectPending} zaškrtávátek, je ${boxes}`);

  await p.locator('[role="checkbox"]').first().click();
  await p.waitForTimeout(300);
  (await p.locator('text=/^1 vybráno$/').count()) ? ok('lišta hlásí „1 vybráno"') : bad(`${name}: lišta nehlásí výběr`);

  const all = p.locator('button', { hasText: /^Vybrat vše \(/ });
  await all.first().click();
  await p.waitForTimeout(300);
  (await p.locator(`text=/^${expectPending} vybráno$/`).count()) ? ok(`„Vybrat vše" označilo ${expectPending}`) : bad(`${name}: „Vybrat vše" neoznačilo vše`);

  if (shot) await p.screenshot({ path: `${OUT}${shot}-${w}.png` });

  const before = sent.length;
  await p.locator('.btn-accent, [class*="btn-accent"]').last().click();
  await p.waitForTimeout(1200);
  const fired = sent.length - before;
  fired === expectPending ? ok(`jeden zásah poslal ${fired} požadavků naráz`) : bad(`${name}: čekáno ${expectPending} požadavků, odešlo ${fired}`);

  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (over > 2) bad(`${name}: přetečení ${over}px`);
  if (errs.length) bad(`${name}: chyba v konzoli — ${errs[0]}`);
  await ctx.close();
}

await queue('Žádosti o volno', '/employer/overview?view=shifts', 5, 'bulk-timeoff');
await queue('Výměny směn', '/employer/overview?view=shifts', 3, null);
await queue('Návrhy skladu', '/employer/overview?view=inventory', 3, 'bulk-inventory');
await queue('Žádosti o odměny', '/employer/overview?view=rewards', 4, 'bulk-rewards');
await queue('Volno na telefonu', '/employer/overview?view=shifts', 5, 'bulk-timeoff', 390);

console.log(problems.length ? `\nPROBLÉMŮ: ${problems.length}` : '\nVšechno prošlo.');
await b.close();
