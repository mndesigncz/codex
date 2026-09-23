// Kolo 56 — konsolidovaný přehled. Čtyři tvrzení v prohlížeči:
//  1. Přepínač podniku nabízí „Všechny podniky" (jen když jich je víc).
//  2. Kliknutí otevře přehled: název organizace, sečtené tržby a mzdy, podíl mezd.
//  3. Karta každého podniku má jméno, čísla a chip „chybí uzávěrka" tam, kde chybí.
//  4. Hluboký odkaz ?view=org přehled otevře rovnou; „Otevřít" u podniku přepne přes server.
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
  const k = keyFor(u);
  if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
  return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
});
const p = await ctx.newPage();
let fails = 0;
const tvrdi = (popis, cond, co = '') => { console.log(`${cond ? '✓' : '✗'} ${popis}${cond ? '' : `  ← ${co}`}`); if (!cond) fails++; };
// innerText vrací text po text-transform; číslice a NBSP normalizujeme.
const norm = s => s.replace(/ /g, ' ').toLowerCase();

await p.goto('http://localhost:3000/employer/overview', { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
const prepinac = p.locator('button[title="Podnik: Kavárna Vinohrady"]').first();
tvrdi('přepínač podniku je v hlavičce', await prepinac.count() > 0, 'chybí');
if (await prepinac.count() > 0) {
  await prepinac.click();
  await p.waitForTimeout(400);
  const menu = p.getByRole('menu').first();
  const t = norm(await menu.innerText().catch(() => ''));
  tvrdi('v nabídce je „Všechny podniky"', t.includes('všechny podniky'), t.slice(0, 160));
  await menu.getByRole('menuitem', { name: /Všechny podniky/ }).click();
  await p.waitForTimeout(1500);
  const m = norm(await p.locator('main').innerText());
  tvrdi('otevřel se přehled s názvem organizace', m.includes('všechny podniky · moje kavárny'), m.slice(0, 200));
  tvrdi('tržby celkem jsou součet (200 000)', m.includes('tržby celkem') && /200 000/.test(m), m.match(/tržby celkem[\s\S]{0,40}/)?.[0]);
  tvrdi('mzdy celkem 56 000 a podíl 28 %', /56 000/.test(m) && /28 %/.test(m), m.match(/mzdy celkem[\s\S]{0,60}/)?.[0]);
  tvrdi('chybí uzávěrka: 2, 1 ke schválení', /chybí uzávěrka\s*\n?\s*2/.test(m) && m.includes('1 ke schválení'), m.match(/chybí uzávěrka[\s\S]{0,60}/)?.[0]);
  tvrdi('karty obou podniků', m.includes('kavárna vinohrady') && m.includes('kavárna karlín'), 'název chybí');
  tvrdi('u Karlína chip „chybí 2 uzávěrky"', m.includes('chybí 2 uzávěrky'), m.match(/chybí \d[^\n]*/g)?.join('|'));
  tvrdi('u Karlína 3 položky docházejí', m.includes('3 položek dochází') || /sklad dochází\s*\n?\s*3/.test(m), m.match(/sklad dochází[\s\S]{0,20}/g)?.join('|'));
  // měsíc dopředu/dozadu
  await p.getByRole('button', { name: 'Předchozí měsíc' }).click();
  await p.waitForTimeout(600);
  const m2 = norm(await p.locator('main').innerText());
  tvrdi('krok o měsíc zpět změní nadpis měsíce', m2 !== m || /srpen|august/.test(m2), 'měsíc se nezměnil');
  // Otevřít → přepnutí přes server
  const nav = p.waitForNavigation({ waitUntil: 'commit', timeout: 6000 }).catch(() => null);
  const karta = p.locator('h3', { hasText: 'Kavárna Karlín' }).locator('xpath=ancestor::div[contains(@class,"glass-card")][1]');
  await karta.getByRole('button', { name: 'Otevřít' }).click();
  await nav;
  const sw = posty.find(x => x.url.includes('/api/teams/switch'));
  tvrdi('„Otevřít" přepne přes server na teamId=2', !!sw && /"teamId":\s*2/.test(sw.body ?? ''), JSON.stringify(sw));
}

await p.goto('http://localhost:3000/employer/overview?view=org', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
const m3 = norm(await p.locator('main').innerText());
tvrdi('hluboký odkaz ?view=org otevře přehled', m3.includes('tržby celkem') && m3.includes('moje kavárny'), m3.slice(0, 160));

// Vypnuto v nastavení → přehled to přizná, nevymýšlí čísla
await ctx.route('**/api/organization/overview**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: false, reason: 'vypnuto', message: 'Přehled za všechny podniky je v nastavení organizace vypnutý.' }) }));
await p.goto('http://localhost:3000/employer/overview?view=org', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
const m4 = norm(await p.locator('main').innerText());
tvrdi('vypnutý přehled řekne proč a kde se zapíná', m4.includes('vypnutý') && m4.includes('nastavení týmu'), m4.slice(0, 200));

console.log(fails ? `\n${fails} SELHALO` : '\nvšechny podniky na jedné obrazovce — a sečtené jen tam, kde to dává smysl');
await b.close();
process.exit(fails ? 1 : 0);
