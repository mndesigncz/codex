// Rychlá verze: pár konkrétních oken, kde se opravdu píše text.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const DIR = new URL('./fixtury/', import.meta.url).pathname;
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const tok = (r) => execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? "design-round-secret-0123456789ab"} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} ${r}`, { encoding: 'utf8' }).trim();

const CILE = [
  ['Sklad — nová položka', 'employer', '/employer/overview?view=inventory', /Nová položka|Přidat položku|Nová/],
  ['Akce — nová akce', 'employer', '/employer/overview?view=events', /Nová akce/],
  ['Postupy — nový postup', 'employer', '/employer/overview?view=procedures', /Nový postup|Nový/],
  ['Návody — nový návod', 'employer', '/employer/overview?view=guides', /Nový návod|Nový/],
  ['Podněty — nový podnět', 'employer', '/employer/overview?view=suggestions', /Nový podnět|Napsat|Nový/],
  ['Rozvrh — kopírovat týden', 'employer', '/employer/overview?view=shifts', /Kopírovat/],
];
const ZNAK = 'SONDA-NEDOPSANY-TEXT';
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
let ztraty = 0, hlidano = 0, oken = 0, nenalezeno = 0;
for (const [jmeno, role, path, re] of CILE) {
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
  const p = await ctx.newPage();
  await p.goto('http://localhost:3000' + path, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const btn = p.locator('button:visible', { hasText: re }).first();
  if (!(await btn.count().catch(() => 0))) { console.log(`  ? ${jmeno}: tlačítko nenalezeno`); nenalezeno++; await ctx.close(); continue; }
  await btn.click({ timeout: 4000 }).catch(() => {});
  await p.waitForTimeout(700);
  const okno = p.locator('.modal-sheet:visible, [role="dialog"]:visible').first();
  if (!(await okno.count().catch(() => 0))) { console.log(`  ? ${jmeno}: okno se neotevřelo`); nenalezeno++; await ctx.close(); continue; }
  const pole = okno.locator('textarea:visible, input[type="text"]:visible, input:not([type]):visible').first();
  if (!(await pole.count().catch(() => 0))) { console.log(`  ? ${jmeno}: v okně není textové pole`); nenalezeno++; await ctx.close(); continue; }
  oken++;
  await pole.click().catch(() => {});
  await p.keyboard.type(ZNAK, { delay: 12 });
  await p.waitForTimeout(250);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(700);
  const porad = await p.locator('.modal-sheet:visible, [role="dialog"]:visible').count().catch(() => 0);
  const ptaSe = await p.locator('.discard-guard:visible').count().catch(() => 0);
  if (porad && ptaSe) { hlidano++; console.log(`  ✓ ${jmeno}: Escape se zeptal, text zůstal`); }
  else if (porad) { hlidano++; console.log(`  ✓ ${jmeno}: Escape nezavřel (bez otázky)`); }
  else { ztraty++; console.log(`  ✗ ${jmeno}: okno zmizelo i s textem`); }
  await ctx.close();
}
console.log(`\nOken: ${oken}. Text zachráněn: ${hlidano}. Ztraceno: ${ztraty}. Nedosaženo: ${nenalezeno}.`);
await b.close();
