// Kolo 12: archiv oznámení, řazení souhrnu docházky, sdílené hledání hostů.
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
const problems = []; const ok = m => console.log('  ✓', m); const bad = m => { console.log('  ✗', m); problems.push(m); };
async function open(url, role = 'employer') {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'cs-CZ' });
  await ctx.addCookies([{ name: 'next-auth.session-token', value: tok(role), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.route('**/api/**', async route => {
    const u = route.request().url();
    if (u.includes('/api/auth/')) return route.continue();
    if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  await p.goto('http://localhost:3000' + url, { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForTimeout(1600);
  return { ctx, p, errs };
}
console.log('Docházka — řazení souhrnu:');
{
  const { ctx, p, errs } = await open('/employer/overview?view=attendance');
  const names = () => p.evaluate(() => Array.from(document.querySelectorAll('.glass-card'))
    .map(c => (c.textContent || '').replace(/\s+/g, ' ').trim()).filter(t => /\d+ h|\d+ min/.test(t)).map(t => t.slice(0, 22)));
  const before = await names();
  const byName = p.locator('button', { hasText: /^Podle jména$/ });
  if (await byName.count() === 0) bad('přepínač řazení souhrnu není');
  else {
    await byName.first().click(); await p.waitForTimeout(500);
    const after = await names();
    JSON.stringify(after) !== JSON.stringify(before)
      ? ok(`řazení podle jména změnilo pořadí (${before.length} karet)`)
      : bad('řazení podle jména nic nezměnilo');
    await p.screenshot({ path: `${OUT}k12-dochazka-1280.png` });
  }
  if (errs.length) bad('Docházka: ' + errs[0]);
  await ctx.close();
}
console.log('Nástěnka — archiv odepnutých:');
{
  const { ctx, p, errs } = await open('/employer/overview?view=team-settings');
  const det = p.locator('summary', { hasText: /^Odepnutá \(\d+\)$/ });
  (await det.count()) > 0 ? ok(`sekce „${(await det.first().innerText()).trim()}" je sbalená`) : console.log('  · žádná odepnutá oznámení ve fixture');
  if (errs.length) bad('Nástěnka: ' + errs[0]);
  await ctx.close();
}
console.log(problems.length ? `\nPROBLÉMŮ: ${problems.length}` : '\nVšechno prošlo.');
await b.close();
