// Důkaz v prohlížeči: napsat do hledání ve Skladu dotaz BEZ diakritiky
// a ověřit, že se položka S diakritikou najde. Fixture má „Mléko
// zázvorová", „Zrnková káva Brasil", „Sirup Monin Levandule". Počet
// výsledků je POSLEDNÍ „N položek" na stránce — nad ním jsou souhrn skladu
// a dlaždice kategorií, které se hledáním nemění.
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
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'cs-CZ' });
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
await p.goto('http://localhost:3000/employer/overview?view=inventory', { waitUntil: 'networkidle' });
await p.waitForTimeout(900);
let fails = 0;
const pocet = async () => (await p.locator('text=/^\\d+ (položka|položky|položek)/').last().innerText()).trim();
for (const [dotaz, ceka] of [['', null], ['zazvorova', 'Domácí limonáda zázvorová'], ['zrnkova', 'Zrnková káva Brasil'], ['levandule', 'Sirup Monin Levandule'], ['citrony', 'Citrony'], ['bramboro', null]]) {
  const pole = p.locator('input[placeholder*="Hledat"]').first();
  await pole.fill(dotaz); await p.waitForTimeout(450);
  const txt = (await p.locator('main').innerText());
  const n = await pocet();
  if (dotaz === '') { console.log(`✓ bez dotazu → ${n}`); continue; }
  if (ceka === null) {
    const ok = /^0 /.test(n);
    console.log(`${ok ? '✓' : '✗'} „${dotaz}" → ${n} (čekám 0)`);
    if (!ok) fails++;
  } else {
    const ok = txt.includes(ceka) && !/^0 /.test(n);
    console.log(`${ok ? '✓' : '✗'} „${dotaz}" → ${n}, našlo „${ceka}": ${txt.includes(ceka)}`);
    if (!ok) fails++;
  }
}
console.log(fails ? `\n${fails} SELHALO` : '\nhledání bez diakritiky funguje');
await b.close(); process.exit(fails ? 1 : 0);
