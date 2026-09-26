// Offline stránka tvrdí „Nic, co jsi odeslal, se neztratilo."
// Co se tedy stane, když odešlu formulář a zrovna spadne wifi?
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
const ctx = await b.newContext({ viewport: { width: 810, height: 1080 }, locale: 'cs-CZ' });
await ctx.addCookies([{ name: 'next-auth.session-token', value: tok, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
await ctx.route('**/api/**', async route => {
  const u = route.request().url();
  if (u.includes('/api/auth/')) return route.continue();
  // Kolo 68: formulář oznámení žije ve widgetu Nástěnka na Přehledu (AnnouncementsManager
  // a pohled „announcements" zmizely) — plocha dostane rozložení s Nástěnkou
  // a vlastník oprávnění (psát na nástěnku smí jen s oznameni.spravovat).
  if (new URL(u).pathname === '/api/teams/mine') { const r = JSON.parse(readFileSync(DIR + 'roles.json', 'utf8')); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...JSON.parse(readFileSync(DIR + 'teams_mine.json', 'utf8')), role: { klic: 'vedeni', roleId: null, nazev: 'Vlastník', typ: 'vedeni', jeVlastnik: true }, opravneni: r.ja.opravneni }) }); }
  if (new URL(u).pathname === '/api/rozlozeni') return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + 'k68-rozlozeni-vedeni.json', 'utf8') });
  if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  const k = keyFor(u);
  if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
  return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
});
const p = await ctx.newPage();
await p.goto('http://localhost:3000/employer/overview', { waitUntil: 'networkidle' });
await p.waitForTimeout(1000);
const pole = p.locator('textarea').first();
await pole.click();
await pole.type('Zítra otevíráme až v deset.', { delay: 12 });
await p.waitForTimeout(700);

await ctx.setOffline(true);
await p.getByRole('button', { name: 'Připnout oznámení' }).click();
await p.waitForTimeout(2500);

const stav = await p.evaluate(() => ({
  chyba: (document.body.innerText.match(/[^\n]*(nepodařilo|offline|chyba|selhal|spojení)[^\n]*/i) || [''])[0].trim().slice(0, 90),
  textVPoli: (document.querySelector('textarea') || {}).value || '',
  tvrdiUspech: /připnuto|odesláno|uloženo|hotovo/i.test(document.body.innerText),
}));
console.log(`řekla aplikace, že to selhalo: ${stav.chyba ? 'ano ✓ — „' + stav.chyba + '"' : 'NE ✗'}`);
console.log(`text zůstal v poli:            ${stav.textVPoli.includes('deset') ? 'ano ✓' : 'NE ✗'}`);
console.log(`tvrdila někde úspěch:          ${stav.tvrdiUspech ? 'ANO ✗' : 'ne ✓'}`);
await b.close();
