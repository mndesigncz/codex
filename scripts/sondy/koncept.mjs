// Rozepsaný formulář mimo okno: odejdu na jinou záložku a vrátím se.
//
// Kolo 34 ohlídalo okna, kolo 37 formuláře na stránce. Sonda měří celý
// průchod, ne jen uložení: koncept musí přežít, formulář se musí otevřít
// sám (koncept, který není vidět, je totéž co ztracený) a musí se přiznat.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const DIR = new URL('./fixtury/', import.meta.url).pathname;
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const tok = (r) => execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? "design-round-secret-0123456789ab"} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} ${r}`, { encoding: 'utf8' }).trim();

// [jméno, role, cesta, čím se formulář otevře (null = je rovnou na stránce), kam odejít]
const CILE = [
  ['Úkoly — nový úkol', 'employer', '/employer/overview?view=tasks', /^Nový úkol$/, '/employer/overview?view=shifts'],
  ['Oznámení', 'employer', '/employer/overview?view=announcements', null, '/employer/overview?view=tasks'],
  ['Volno — žádost', 'employer', '/employer/overview?view=timeoff', null, '/employer/overview?view=tasks'],
];
const ZNAK = 'rozepsany koncept sondy';
const POLE = 'form input:not([type]):visible, form input[type="text"]:visible, form textarea:visible, textarea:visible';
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
let ok = 0, ztraty = 0, nedosazeno = 0;
const kontrola = (j, p) => { if (p) console.log('  ✓ ' + j); else { console.log('  ✗ ' + j); } return p; };

for (const [jmeno, role, path, otevrit, jinam] of CILE) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'cs-CZ' });
  await ctx.addCookies([{ name: 'next-auth.session-token', value: tok(role), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.route('**/api/**', async route => {
    const r = route.request(); const u = r.url();
    if (u.includes('/api/auth/')) return route.continue();
    if (r.method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p = await ctx.newPage();
  await p.goto('http://localhost:3000' + path, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(1300);
  if (otevrit) {
    const btn = p.locator('button:visible', { hasText: otevrit }).first();
    if (!(await btn.count().catch(() => 0))) { console.log(`  ? ${jmeno}: tlačítko nenalezeno`); nedosazeno++; await ctx.close(); continue; }
    await btn.click({ timeout: 4000 }).catch(() => {});
    await p.waitForTimeout(600);
  }
  const pole = p.locator(POLE).first();
  if (!(await pole.count().catch(() => 0))) { console.log(`  ? ${jmeno}: formulář nenalezen`); nedosazeno++; await ctx.close(); continue; }
  await pole.click().catch(() => {});
  await p.waitForTimeout(200);
  await p.keyboard.type(ZNAK, { delay: 10 }).catch(() => {});
  await p.waitForTimeout(400);
  if (!(await pole.inputValue().catch(() => '')).includes('koncept')) { console.log(`  ? ${jmeno}: text se nezapsal`); nedosazeno++; await ctx.close(); continue; }

  await p.goto('http://localhost:3000' + jinam, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(800);
  await p.goto('http://localhost:3000' + path, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(1500);

  const viditelny = await p.locator(POLE).first().inputValue().catch(() => '');
  const prezil = viditelny.includes('koncept');
  const priznano = (await p.locator('text=/Vrátili jsme ti/').count().catch(() => 0)) > 0;
  // Koncept, který není vidět, je totéž co ztracený — proto se měří obojí.
  const dobre = kontrola(`${jmeno}: koncept je po návratu vidět`, prezil)
    && kontrola(`${jmeno}: a přizná se, že se vrátil`, priznano);
  if (dobre) ok++; else ztraty++;
  await ctx.close();
}
console.log(`\nFormulářů: ${ok + ztraty}. V pořádku: ${ok}. Ztraceno nebo zamlčeno: ${ztraty}. Nedosaženo: ${nedosazeno}.`);
await b.close();
process.exit(ztraty ? 1 : 0);
