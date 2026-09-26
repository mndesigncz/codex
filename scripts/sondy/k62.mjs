// Kolo 62 — lidé napříč podniky: člen přepnutý do jiného podniku zůstává v Týmu, s chipem.
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
let fails = 0;
const tvrdi = (popis, ok, co = '') => { console.log(`${ok ? '✓' : '✗'} ${popis}${ok ? '' : '  ← ' + co}`); if (!ok) fails++; };
const norm = s => s.replace(/ /g, ' ').toLowerCase();
const ctx = await b.newContext({ viewport: { width: 1280, height: 950 }, locale: 'cs-CZ' });
await ctx.addCookies([{ name: 'next-auth.session-token', value: tok, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
await ctx.route('**/api/**', async route => {
  const u = route.request().url();
  if (u.includes('/api/auth/')) return route.continue();
  if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  // Kolo 69 (B2): Docházka a Tým jsou plochy s widgety — rozložení (widgety a nástroj) z fixtury balíku.
  if (new URL(u).pathname === '/api/rozlozeni' && ['vedeni.dochazka', 'vedeni.tym'].includes(new URL(u).searchParams.get('stranka'))) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + (new URL(u).searchParams.get('stranka') === 'vedeni.tym' ? 'k69-b2-rozlozeni-tym' : 'k69-b2-rozlozeni-dochazka') + '.json', 'utf8') });
  const k = keyFor(u);
  if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
  return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
});
const p = await ctx.newPage();
await p.goto('http://localhost:3000/employer/overview?view=team-settings', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
const m = norm(await p.locator('main').innerText());
tvrdi('tým: člen přepnutý jinam je v seznamu', m.includes('jakub přepnutý'), m.slice(0, 160));
const chip = p.locator('main span.chip', { hasText: 'právě v jiném podniku' });
// Kolo 69 (B2): vysvětlení nese obal chipu (Chip z components/ui title nebere).
tvrdi('tým: má chip „právě v jiném podniku" s vysvětlením', (await chip.count()) === 1 && /členem i jiného podniku/.test(await chip.first().evaluate(el => el.closest('[title]')?.getAttribute('title') ?? '')), `chipů ${await chip.count()}`);
tvrdi('tým: chip jen u něj, ne u ostatních', (await p.locator('main span.chip', { hasText: 'právě v jiném podniku' }).count()) === 1, '');
// Upravit u něj funguje (tlačítko existuje) — PATCH už umí zapsat do členství.
tvrdi('tým: přepnutého člena jde upravit', (await p.getByRole('button', { name: 'Upravit: Jakub Přepnutý' }).count()) === 1, 'bez tlačítka');
console.log(fails ? `\n${fails} SELHALO` : '\nčlen zůstává členem, i když stojí jinde');
await b.close(); process.exit(fails ? 1 : 0);
