// Kolo 10: řazení podle hlasů v Nápadech, filtr podle člověka v Úkolech.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const BASE = process.env.SONDY_ZAKLAD ?? process.env.SONDY_BASE ?? 'http://localhost:3000';
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
  await p.goto(BASE + url, { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForTimeout(1600);
  return { ctx, p, errs };
}

console.log('Nápady — řazení podle hlasů:');
{
  const { ctx, p, errs } = await open('/employer/overview?view=suggestions');
  const titles = () => p.locator('.card > div h3, .card > div .t-card').allInnerTexts();
  // Jen hlasy v řádcích nápadů — odznak nepřečtených (taky tabular-nums) mimo seznam by pořadí rozbil.
  const votes = () => p.evaluate(() => Array.from(document.querySelectorAll('li .tabular-nums'))
    .map(e => e.textContent.trim()).filter(t => /^\d+$/.test(t)).map(Number));
  const before = await votes();
  ok(`pořadí hlasů před přepnutím: ${before.join(', ')}`);
  // Od redesignu v3 je řazení v nabídce „Řazení: …" (ikona vedle hledání), ne přepínací tlačítko.
  const btn = p.locator('button[aria-label^="Řazení"]');
  if (await btn.count() === 0) bad('přepínač řazení není');
  else {
    await btn.first().click();
    await p.waitForTimeout(300);
    await p.getByRole('menuitem', { name: /Nejvíc hlasů/ }).first().click();
    await p.waitForTimeout(500);
    const after = await votes();
    const sorted = [...after].sort((a, b) => b - a);
    JSON.stringify(after) === JSON.stringify(sorted) && after.length > 1
      ? ok(`po přepnutí sestupně: ${after.join(', ')}`)
      : bad(`řazení nezabralo: ${after.join(', ')}`);
    await p.screenshot({ path: `${OUT}k10-napady-1280.png` });
  }
  if (errs.length) bad('Nápady: chyba v konzoli — ' + errs[0]);
  await ctx.close();
}

console.log('Úkoly — filtr podle člověka:');
{
  const { ctx, p, errs } = await open('/employer/overview?view=tasks');
  // Od redesignu v3 jsou lidé v panelu „Filtry" (Komu úkol patří), ne v řadě nad seznamem.
  await p.locator('button[aria-expanded]', { hasText: /^Filtry/ }).first().click().catch(() => {});
  await p.waitForTimeout(300);
  // Fixtura úkolů (tasks.json) má dnes Evin úkol „Vyčistit lednici a mrazák u baru" a dva úkoly pro
  // kohokoli („Vyrobit Domácí limonáda", hotové „Umýt podlahu v kuchyni"); Jakub v ní už není (kolo 93).
  const chip = p.locator('button', { hasText: /^Eva · \d+$/ });
  if (await chip.count() === 0) {
    bad('chip s člověkem není; jsou tam: '
      + (await p.locator('button').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 12).join(' | '));
  } else {
    const allBefore = await p.locator('.list-row, .list > *').count();
    await chip.first().click();
    await p.waitForTimeout(500);
    const eva = await p.locator('text=Vyčistit lednici a mrazák u baru').count();
    const kdokoli = await p.locator('text=Vyrobit Domácí limonáda').count();
    eva > 0 && kdokoli === 0
      ? ok(`filtr zúžil na jednoho člověka (z ${allBefore} řádků)`)
      : bad(`filtr nezabral (Evin úkol ${eva}, pro kohokoli ${kdokoli})`);
    await p.screenshot({ path: `${OUT}k10-ukoly-1280.png` });
    // Druhý klik na týž chip filtr zruší.
    await chip.first().click();
    await p.waitForTimeout(400);
    (await p.locator('text=Vyrobit Domácí limonáda').count()) > 0
      ? ok('druhý klik filtr zrušil')
      : bad('druhý klik filtr nezrušil');
  }
  if (errs.length) bad('Úkoly: chyba v konzoli — ' + errs[0]);
  await ctx.close();
}

console.log(problems.length ? `\nPROBLÉMŮ: ${problems.length}` : '\nVšechno prošlo.');
await b.close();
process.exit(problems.length ? 1 : 0);
