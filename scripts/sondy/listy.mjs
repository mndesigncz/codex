// Okno na telefonu musí dosednout na spodní hranu, být přes celou šířku
// a mít dole ostré rohy. Měří se skutečná geometrie, ne přítomnost třídy.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const DIR = new URL('./fixtury/', import.meta.url).pathname;
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const tok = (r) => execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? "design-round-secret-0123456789ab"} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} ${r}`, { encoding: 'utf8' }).trim();
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });

const ukoly = [
  ['Nový úkol',      'employer', '/employer/overview?view=tasks',                 'Nový úkol'],
  ['Přidat záznam',  'employer', '/employer/overview?view=attendance',            'Přidat záznam'],
  ['Přidat stůl',    'employer', '/employer/overview?mode=client&tab=tables',     'Přidat stůl'],
  ['Nový postup',    'employer', '/employer/overview?view=procedures',            'Nový postup'],
  ['Nová uzávěrka',  'employer', '/employer/overview?view=closing',               'Nová uzávěrka'],
];

let ok = 0, spatne = 0;
for (const [jm, role, cesta, tlacitko] of ukoly) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'cs-CZ', isMobile: true, hasTouch: true });
  await ctx.addCookies([{ name: 'next-auth.session-token', value: tok(role), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.route('**/api/**', async route => {
    const u = route.request().url();
    if (u.includes('/api/auth/')) return route.continue();
    if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    // Kolo 69 (B2): Docházka a Tým jsou plochy s widgety — rozložení (widgety a nástroj) z fixtury balíku.
    if (new URL(u).pathname === '/api/rozlozeni' && ['vedeni.dochazka', 'vedeni.tym'].includes(new URL(u).searchParams.get('stranka'))) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + (new URL(u).searchParams.get('stranka') === 'vedeni.tym' ? 'k69-b2-rozlozeni-tym' : 'k69-b2-rozlozeni-dochazka') + '.json', 'utf8') });
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p = await ctx.newPage();
  try {
    await p.goto('http://localhost:3000' + cesta, { waitUntil: 'networkidle' });
    await p.waitForTimeout(900);
    await p.getByRole('button', { name: tlacitko, exact: false }).first().click({ timeout: 6000 });
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
      if (jm === 'Nový úkol') await p.screenshot({ path: 'shots/list-mobil.png' });
    }
  } catch (e) { console.log(`✗ ${jm}: ${String(e).slice(0, 90)}`); spatne++; }
  await ctx.close();
}
console.log(`\nCELKEM v pořádku ${ok}, špatně ${spatne}`);
await b.close();
