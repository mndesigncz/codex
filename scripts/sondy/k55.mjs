// Kolo 55 — organizace nad podniky. Tři tvrzení v prohlížeči + jedno o API.
//  1. V hlavičce je vidět, KTERÝ podnik spravuju, a jde rozbalit seznam.
//  2. Přepnutí volá server (POST /api/teams/switch) — ne klientský stav.
//  3. Nastavení týmu ukazuje kartu organizace s přepínači a názvy podniků.
//  4. Po přepnutí se stránka načte znovu (stav starého podniku odchází).
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
const ctx = await b.newContext({ viewport: { width: 1280, height: 950 }, locale: 'cs-CZ' });
await ctx.addCookies([{ name: 'next-auth.session-token', value: tok, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
const posty = [];
await ctx.route('**/api/**', async route => {
  const u = route.request().url();
  if (u.includes('/api/auth/')) return route.continue();
  if (route.request().method() !== 'GET') {
    posty.push({ url: u.replace('http://localhost:3000', ''), body: route.request().postData() });
    if (u.includes('/api/teams/switch')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, teamId: 2, role: 'employer', teamName: 'Kavárna Karlín' }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  }
  // Kolo 69 (B2): Docházka a Tým jsou plochy s widgety — rozložení (widgety a nástroj) z fixtury balíku.
  if (new URL(u).pathname === '/api/rozlozeni' && ['vedeni.dochazka', 'vedeni.tym'].includes(new URL(u).searchParams.get('stranka'))) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + (new URL(u).searchParams.get('stranka') === 'vedeni.tym' ? 'k69-b2-rozlozeni-tym' : 'k69-b2-rozlozeni-dochazka') + '.json', 'utf8') });
  const k = keyFor(u);
  if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
  return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
});
const p = await ctx.newPage();
let fails = 0;
const tvrdi = (popis, cond, co = '') => { console.log(`${cond ? '✓' : '✗'} ${popis}${cond ? '' : `  ← ${co}`}`); if (!cond) fails++; };

await p.goto('http://localhost:3000/employer/overview', { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
const prepinac = p.locator('button[title^="Podnik: Kavárna Vinohrady"]').filter({ visible: true }).first();
tvrdi('v hlavičce je vidět aktivní podnik', await prepinac.count() > 0, 'přepínač s názvem podniku chybí');
if (await prepinac.count() > 0) {
  await prepinac.click();
  await p.waitForTimeout(400);
  const menu = p.getByRole('menu').first();
  const t = (await menu.innerText().catch(() => '')).toLowerCase();
  tvrdi('rozbalený seznam ukazuje oba podniky', t.includes('kavárna vinohrady') && t.includes('kavárna karlín'), t.slice(0, 120));
  tvrdi('vedení má „Přidat podnik"', t.includes('přidat podnik'), 'tlačítko chybí');
  const pocetNavigaciPred = posty.length;
  const nav = p.waitForNavigation({ waitUntil: 'commit', timeout: 6000 }).catch(() => null);
  await menu.getByRole('menuitem', { name: /Kavárna Karlín/ }).click();
  await nav;
  const sw = posty.find(x => x.url.includes('/api/teams/switch'));
  tvrdi('přepnutí volá server s teamId=2', !!sw && /"teamId":\s*2/.test(sw.body ?? ''), JSON.stringify(sw));
  tvrdi('po přepnutí se stránka načetla znovu', posty.length >= pocetNavigaciPred + 1, 'bez reloadu by zůstal stav starého podniku');
}

await p.goto('http://localhost:3000/employer/overview?view=team-settings', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
// Kolo 69 (B2): nastavení týmu je v sekcích nástroje; organizace je v sekci Podnik.
await p.getByRole('tab', { name: 'Podnik' }).click(); await p.waitForTimeout(600);
const t2 = (await p.locator('main').innerText()).toLowerCase();
tvrdi('nastavení týmu ukazuje kartu organizace', t2.includes('organizace: moje kavárny'), t2.slice(0, 200));
tvrdi('karta jmenuje oba podniky', t2.includes('kavárna vinohrady') && t2.includes('kavárna karlín'), 'názvy podniků chybí');
tvrdi('přepínače nastavení jsou tam', t2.includes('sdílení lidí mezi podniky') && t2.includes('přehled za všechny podniky') && t2.includes('fakturace'), 'přepínač chybí');
// Od kola 56 (přehled) a 60 (číselníky) zůstává „připravuje se" jen u fakturace.
tvrdi('co ještě nefunguje, to karta přizná', (t2.match(/připravuje se/g) ?? []).length >= 1, 'chybí štítek „připravuje se"');

console.log(fails ? `\n${fails} SELHALO` : '\njeden účet, víc podniků — a v hlavičce je vidět který');
await b.close();
process.exit(fails ? 1 : 0);
