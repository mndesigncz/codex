// Okno na telefonu musí dosednout na spodní hranu, být přes celou šířku
// a mít dole ostré rohy. Měří se skutečná geometrie, ne přítomnost třídy.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const BASE = process.env.SONDY_ZAKLAD ?? process.env.SONDY_BASE ?? 'http://localhost:3000';
const DIR = new URL('./fixtury/', import.meta.url).pathname;
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const tok = (r) => execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? "design-round-secret-0123456789ab"} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} ${r}`, { encoding: 'utf8' }).trim();
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });

const ukoly = [
  // Kolo 93: „Nový úkol" se od kola 7 otevírá jako karta formuláře přímo na stránce Úkoly, ne jako okno —
  // místo něj se měří okno nové položky skladu.
  ['Přidat položku', 'employer', '/employer/overview?view=inventory',             'Přidat položku'],
  ['Přidat záznam',  'employer', '/employer/overview?view=attendance',            'Přidat záznam'],
  ['Přidat stůl',    'employer', '/employer/overview?mode=client&tab=tables',     'Přidat stůl'],
  ['Nový postup',    'employer', '/employer/overview?view=procedures',            'Nový postup'],
  // Kolo 93: „Nová uzávěrka" vedení otevírá celou stránku vyplňování (CashClosing), ne okno — a pohled
  // „closing" už neexistuje (od kola 68 „reports"), sonda proto dřív měřila Přehled. Z výčtu ven.
  ['Nová rezervace', 'employer', '/employer/overview?mode=client&tab=reservations', 'Nová rezervace'],
];

let ok = 0, spatne = 0;
for (const [jm, role, cesta, tlacitko] of ukoly) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'cs-CZ', isMobile: true, hasTouch: true });
  await ctx.addCookies([{ name: 'next-auth.session-token', value: tok(role), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.route('**/api/**', async route => {
    const u = route.request().url();
    if (u.includes('/api/auth/')) return route.continue();
    if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    // Hlavní akce stránek se ukazují jen s oprávněním (useSmi) — starý teams_mine je nemá, doplní se vlastníkova
    // z roles.json (jako k12). Bez toho „Nová uzávěrka" chyběla a sonda to s exit 0 jen vypsala (kolo 93).
    if (new URL(u).pathname === '/api/teams/mine') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...JSON.parse(readFileSync(DIR + 'teams_mine.json', 'utf8')), opravneni: JSON.parse(readFileSync(DIR + 'roles.json', 'utf8')).ja.opravneni, role: { klic: 'vedeni', roleId: null, nazev: 'Vlastník', typ: 'vedeni', jeVlastnik: true } }) });
    // Kolo 69 (B2): Docházka a Tým jsou plochy s widgety — rozložení (widgety a nástroj) z fixtury balíku.
    if (new URL(u).pathname === '/api/rozlozeni' && ['vedeni.dochazka', 'vedeni.tym'].includes(new URL(u).searchParams.get('stranka'))) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + (new URL(u).searchParams.get('stranka') === 'vedeni.tym' ? 'k69-b2-rozlozeni-tym' : 'k69-b2-rozlozeni-dochazka') + '.json', 'utf8') });
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p = await ctx.newPage();
  try {
    await p.goto(BASE + cesta, { waitUntil: 'networkidle' });
    await p.waitForTimeout(900);
    // Od redesignu v3 je na telefonu hlavní akce stránky v nabídce „···" hlavičky (menuTelefon),
    // když se do řady nevejde (Úkoly, Uzávěrky) — sonda ji tam hledá, okno se měří stejně (kolo 93).
    const primo = p.getByRole('button', { name: tlacitko, exact: false }).first();
    if (await primo.isVisible().catch(() => false)) await primo.click({ timeout: 6000 });
    else {
      await p.locator('main button[aria-label="Další akce"]:visible, main button[aria-label="Další možnosti"]:visible').first().click({ timeout: 6000 });
      await p.waitForTimeout(300);
      await p.getByRole('menuitem', { name: tlacitko }).first().click({ timeout: 6000 });
    }
    await p.waitForTimeout(700);
    const m = await p.evaluate(() => {
      const el = document.querySelector('.modal-overlay > .modal-sheet');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        dole: Math.round(window.innerHeight - r.bottom),
        sirka: Math.round(r.width), okno: window.innerWidth,
        rohDole: cs.borderBottomLeftRadius,
      };
    });
    if (!m) { console.log(`✗ ${jm}: okno se neotevřelo`); spatne++; }
    else {
      const sedi = m.dole <= 1 && m.sirka >= m.okno - 1 && parseFloat(m.rohDole) === 0;
      console.log(`${sedi ? '✓' : '✗'} ${jm}: mezera dole ${m.dole}px · šířka ${m.sirka}/${m.okno}px · roh dole ${m.rohDole}`);
      sedi ? ok++ : spatne++;
      if (jm === 'Přidat položku') await p.screenshot({ path: 'shots/list-mobil.png' });
    }
  } catch (e) { console.log(`✗ ${jm}: ${String(e).slice(0, 90)}`); spatne++; }
  await ctx.close();
}
console.log(`\nCELKEM v pořádku ${ok}, špatně ${spatne}`);
await b.close();
process.exit(spatne ? 1 : 0);
