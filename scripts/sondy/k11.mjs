// Kolo 11: klávesnice v našeptávačích (pole + tlačítka s výsledky).
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

async function open(url) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'cs-CZ' });
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
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  await p.goto('http://localhost:3000' + url, { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForTimeout(1600);
  return { ctx, p, errs };
}
const active = (p) => p.evaluate(() => {
  const a = document.activeElement;
  if (!a) return 'nic';
  return `${a.tagName.toLowerCase()}«${(a.getAttribute('placeholder') || a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30)}»`;
});

console.log('Receptury — hledání suroviny do výroby:');
{
  const { ctx, p, errs } = await open('/employer/overview?view=recipes');
  const field = p.locator('input[placeholder="Přidat surovinu ze skladu…"]');
  if (await field.count() === 0) {
    // Pole žije uvnitř editoru výrobní receptury — je potřeba ho otevřít.
    const first = p.locator('button', { hasText: /\+ receptura|Upravit/ }).first();
    if (await first.count()) { await first.click(); await p.waitForTimeout(1200); }
  }
  const f2 = p.locator('input[placeholder="Přidat surovinu ze skladu…"]');
  if (await f2.count() === 0) console.log('  · pole nenalezeno (jiná cesta v UI) — přeskakuji');
  else {
    await f2.first().click();
    await f2.first().fill('ml');
    await p.waitForTimeout(700);
    const results = await p.locator('.card button, [class*="card"] button').count();
    const before = await active(p);
    await p.keyboard.press('ArrowDown');
    await p.waitForTimeout(300);
    const after = await active(p);
    after !== before && after.startsWith('button')
      ? ok(`šipka dolů přenesla fokus z pole na výsledek: ${after}`)
      : bad(`šipka dolů nic neudělala (${before} → ${after}), výsledků ${results}`);
    await p.keyboard.press('ArrowUp');
    await p.waitForTimeout(300);
    (await active(p)).startsWith('input')
      ? ok('šipka nahoru z prvního výsledku vrátila fokus do pole')
      : bad(`šipka nahoru fokus nevrátila: ${await active(p)}`);
  }
  if (errs.length) bad('Receptury: chyba v konzoli — ' + errs[0]);
  await ctx.close();
}

console.log(problems.length ? `\nPROBLÉMŮ: ${problems.length}` : '\nVšechno prošlo.');
await b.close();
