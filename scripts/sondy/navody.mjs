// Důkaz v prohlížeči, že návod je opravdu propojený s tím, co se vyrábí.
//
// Čtyři tvrzení, každé o jiné obrazovce:
//  1. Editor výroby u položky „Domácí limonáda" ukáže připnutý návod
//     a řekne, že textové pole „Postup" přebíjí.
//  2. Proklik `?view=guides&guide=2` otevře ČTEČKU toho návodu — do téhle
//     chvíle takový odkaz skončil na seznamu.
//  3. Čtečka řekne, co se podle návodu vyrábí.
//  4. Úkol „Vyrobit Domácí limonáda" nabídne odkaz na návod.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const DIR = new URL('./fixtury/', import.meta.url).pathname;
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => {
  const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null;
};
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
let fails = 0;
const tvrdi = (popis, podminka, co = '') => {
  console.log(`${podminka ? '✓' : '✗'} ${popis}${podminka ? '' : `  ← ${co}`}`);
  if (!podminka) fails++;
};

// ---- 1. Editor výroby u skladové položky --------------------------------
await p.goto('http://localhost:3000/employer/overview?view=inventory', { waitUntil: 'networkidle' });
await p.waitForTimeout(700);
// Otevřít detail položky „Domácí limonáda".
await p.getByText('Domácí limonáda', { exact: false }).first().click();
await p.waitForTimeout(900);
const editor = await p.locator('body').innerText();
tvrdi('editor výroby ukáže připnutý návod',
  editor.includes('Návod k výrobě') && editor.includes('Domácí limonáda — postup'),
  'v detailu položky není sekce s návodem');
tvrdi('editor řekne, kolik kroků z návodu půjde do úkolu',
  /3 kroků z tohohle návodu/.test(editor),
  'chybí věta o počtu kroků');
tvrdi('textové pole „Postup" přizná, že ho návod přebíjí',
  editor.includes('Postup (návod ho přebíjí)'),
  'popisek pole se nezměnil');

// ---- 2. + 3. Proklik na konkrétní návod otevře čtečku -------------------
await p.goto('http://localhost:3000/employer/overview?view=guides&guide=2', { waitUntil: 'networkidle' });
await p.waitForTimeout(1100);
const ctecka = p.locator('[role="dialog"]').first();
const cteckaOtevrena = await ctecka.isVisible().catch(() => false);
tvrdi('odkaz ?guide=2 otevře čtečku, ne jen seznam', cteckaOtevrena,
  'žádný dialog — odkaz zase skončil na seznamu');
if (cteckaOtevrena) {
  const t = await ctecka.innerText();
  tvrdi('čtečka ukazuje ten správný návod', t.includes('Domácí limonáda — postup'), t.slice(0, 120));
  tvrdi('čtečka řekne, co se podle návodu vyrábí',
    t.includes('Vyrábíme podle něj: Domácí limonáda'),
    'chybí štítek s vyráběnou položkou');
}

// ---- 4. Úkol „Vyrobit X" odkáže na návod --------------------------------
await p.goto('http://localhost:3000/employer/overview?view=tasks', { waitUntil: 'networkidle' });
await p.waitForTimeout(900);
const ukoly = await p.locator('main').innerText();
tvrdi('výrobní úkol je vidět', ukoly.includes('Vyrobit Domácí limonáda'), ukoly.slice(0, 160));
const odkaz = p.locator('a[href*="view=guides&guide=2"]').first();
tvrdi('úkol nabídne odkaz na návod', await odkaz.count() > 0,
  'u úkolu není odkaz na návod');

console.log(fails ? `\n${fails} SELHALO` : '\nnávody jsou propojené s výrobou');
await b.close();
process.exit(fails ? 1 : 0);
