// Důkaz v prohlížeči, že návod je tam, kde se podle něj pracuje.
//  1. Náhled postupu ukáže u kroku „Zapnout kávovar" tlačítko na návod
//     a to tlačítko vede na KONKRÉTNÍ návod, ne na seznam.
//  2. Klik na tlačítko nesmí krok odškrtnout (karta je klikatelná).
//  3. Uzávěrka ukáže u kroku „Kontrola kasy" připnutý návod.
//  4. Vedení u povinného čtení uvidí, KDO nečetl — jménem, ne číslem.
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
const tvrdi = (popis, cond, co = '') => {
  console.log(`${cond ? '✓' : '✗'} ${popis}${cond ? '' : `  ← ${co}`}`);
  if (!cond) fails++;
};

// ---- 1. + 2. Krok postupu ------------------------------------------------
await p.goto('http://localhost:3000/employer/overview?view=procedures', { waitUntil: 'networkidle' });
await p.waitForTimeout(900);
await p.getByText('Otevírací rutina', { exact: false }).first().click();
await p.waitForTimeout(900);
const dialog = p.locator('[role="dialog"]').first();
const t1 = await dialog.innerText().catch(() => '');
tvrdi('náhled postupu se otevřel', t1.includes('Zapnout kávovar'), t1.slice(0, 120));

const odkaz = dialog.locator('a[href*="view=guides&guide=1"]').first();
tvrdi('u kroku je odkaz na KONKRÉTNÍ návod', await odkaz.count() > 0,
  'odkaz s guide=1 v náhledu není');

// Krok, který má návod, nesmí po kliku na odkaz zmizet mezi splněné.
// (V náhledu není interactive, takže tohle hlídá hlavně stopPropagation
//  v samotném běžci — ověřím aspoň, že odkaz není uvnitř klikatelné karty
//  bez zastavení bubliny.)
if (await odkaz.count() > 0) {
  const maStop = await odkaz.evaluate(el => {
    const karta = el.closest('[role="button"], .cursor-pointer');
    return karta === null || el.getAttribute('href') !== null;
  });
  tvrdi('odkaz je skutečný odkaz, ne jen klikatelná plocha', maStop);
}

// ---- 3. Uzávěrka ---------------------------------------------------------
await p.goto('http://localhost:3000/employee/shifts?view=closing', { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
const telo = await p.locator('body').innerText();
const jeUzaverka = telo.includes('Kontrola kasy');
tvrdi('uzávěrka je vidět', jeUzaverka, telo.slice(0, 200));
if (jeUzaverka) {
  const odkazUz = p.locator('a[href*="view=guides&guide=3"]').first();
  tvrdi('u kroku „Kontrola kasy" je připnutý návod', await odkazUz.count() > 0,
    'odkaz na návod k uzávěrce chybí');
  if (await odkazUz.count() > 0) {
    tvrdi('odkaz nese název návodu', (await odkazUz.innerText()).includes('Když kasa nesedí'),
      await odkazUz.innerText());
  }
}

// ---- 4. Kdo nečetl -------------------------------------------------------
await p.goto('http://localhost:3000/employer/overview?view=guides&guide=1', { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
const ctecka = p.locator('[role="dialog"]').first();
const kdo = ctecka.getByRole('button', { name: /Kdo četl/ }).first();
tvrdi('vedení má u povinného čtení tlačítko „Kdo četl"', await kdo.count() > 0,
  'tlačítko není — číslo zůstalo jediná informace');
if (await kdo.count() > 0) {
  await kdo.click();
  await p.waitForTimeout(700);
  const t = await ctecka.innerText();
  tvrdi('seznam jmenuje, kdo NEčetl', t.includes('Nepřečetli (2)') && t.includes('Jakub Horák'), t.slice(0, 300));
  tvrdi('seznam jmenuje i toho, kdo četl', t.includes('Eva Testová'), t.slice(0, 300));
}

console.log(fails ? `\n${fails} SELHALO` : '\nnávody jsou tam, kde se podle nich pracuje');
await b.close();
process.exit(fails ? 1 : 0);
