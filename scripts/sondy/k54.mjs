// Důkaz v prohlížeči pro kolo 54 — uzávěrka, která ví, ke které směně patří.
//  1. Formulář řekne, že mezi poslední uzávěrkou a dneškem chybí sobota —
//     dřív se sobotní hotovost potichu propsala do dalšího dne.
//  2. Karta „Tvoje směna": odpracováno, sazba, výdělek, body — zaměstnanec
//     tohle dosud neviděl nikde.
//  3. Odškrtnutí úkolu ukáže „+5 bodů" hned, ne až v žebříčku.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const DIR = new URL('./fixtury/', import.meta.url).pathname;
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const mk = async (b, role) => {
  const tok = execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? "design-round-secret-0123456789ab"} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} ${role}`, { encoding: 'utf8' }).trim();
  const c = await b.newContext({ viewport: { width: 1280, height: 950 }, locale: 'cs-CZ' });
  await c.addCookies([{ name: 'next-auth.session-token', value: tok, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await c.route('**/api/**', async route => {
    const u = route.request().url();
    if (u.includes('/api/auth/')) return route.continue();
    if (route.request().method() !== 'GET') {
      // Odškrtnutí úkolu vrací body — přesně to, co má obrazovka ukázat.
      if (u.includes('/api/tasks')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 91, status: 'done', pointsEarned: 5 }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    }
    // Kolo 69: plocha připojí nástroj i widgety až po načtení oprávnění; teams_mine.json
    // je ze starší verze API bez nich (stránka by zůstala na kostrách). Zaměstnanec dostane
    // systémovou roli baristy (typ zamestnanec) — s oprávněními vlastníka by uzávěrka šla
    // větví „za kohokoli“ a sonda by přestala ověřovat skutečný tok zaměstnance.
    if (new URL(u).pathname === '/api/teams/mine') {
      const role = JSON.parse(readFileSync(DIR + 'roles.json', 'utf8'));
      const r = role === 'employee' ? role.system.find(x => x.klic === 'barista') : role.ja;
      const mine = { ...JSON.parse(readFileSync(DIR + 'teams_mine.json', 'utf8')), opravneni: r.opravneni, role: role === 'employee'
        ? { klic: 'barista', roleId: null, nazev: r.nazev, typ: 'zamestnanec', jeVlastnik: false }
        : { klic: r.klic, roleId: r.roleId, nazev: r.nazev, typ: 'vedeni', jeVlastnik: r.jeVlastnik } };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mine) });
    }
    // Kolo 69: záložka Uzávěrka je plocha s widgety a formulář je její nástroj — bez
    // rozložení (holé [] z podvrhu) by plocha byla prázdná a formulář by chyběl.
    if (new URL(u).pathname === '/api/rozlozeni' && new URL(u).searchParams.get('stranka') === 'zamestnanec.uzaverka')
      return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + 'k69-b5a-rozlozeni-uzaverka.json', 'utf8') });
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  return c.newPage();
};
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
let fails = 0;
const tvrdi = (popis, cond, co = '') => { console.log(`${cond ? '✓' : '✗'} ${popis}${cond ? '' : `  ← ${co}`}`); if (!cond) fails++; };

// ---- 1 + 2: uzávěrka zaměstnance ------------------------------------------
const p = await mk(b, 'employee');
await p.goto('http://localhost:3000/employee/shifts?view=closing', { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
const t = (await p.locator('main').innerText()).replace(/[\u00a0\u202f]/g, ' ').toLowerCase();
tvrdi('uzávěrka je vidět', t.includes('kontrola kasy'), t.slice(0, 160));
tvrdi('formulář hlásí chybějící sobotu mezi poslední uzávěrkou a dneškem',
  t.includes('chybí uzávěrka za') && t.includes('sobota 12. 9.'),
  'varování o mezeře chybí');
tvrdi('varování říká, kam sobotní hotovost NEpatří',
  t.includes('do dnešní tržby nepatří'),
  'chybí věta, proč to vadí');
tvrdi('karta „Tvoje směna" ukazuje odpracovaný čas',
  t.includes('tvoje směna') && t.includes('odpracováno') && t.includes('7 h 40 min'),
  'karta nebo čas chybí');
tvrdi('karta ukazuje výpočet sazba × čas',
  t.includes('150') && t.includes('1 150'),
  'chybí sazba nebo výdělek');
tvrdi('karta přizná, že příchod je ještě otevřený', t.includes('příchod je otevřený'), 'chybí poznámka o otevřeném příchodu');
tvrdi('karta ukazuje body za dnešek s rozpisem',
  t.includes('+35') && t.includes('15 za uzávěrku') && t.includes('10 za úkoly') && t.includes('10 za postup'),
  'rozpis bodů chybí');

// ---- 3: odškrtnutí úkolu → body hned ----------------------------------------
const p2 = await mk(b, 'employee');
await p2.goto('http://localhost:3000/employee/shifts?view=tasks', { waitUntil: 'networkidle' });
await p2.waitForTimeout(1200);
const tick = p2.getByRole('button', { name: /Označit jako hotové — Vyrobit Domácí limonáda/ }).first();
tvrdi('výrobní úkol je v seznamu', await tick.count() > 0, 'tlačítko odškrtnutí nenalezeno');
if (await tick.count() > 0) {
  p2.once('dialog', d => d.accept());
  await tick.click();
  const toast = p2.getByRole('status').filter({ hasText: /\+5 bodů/ }).first();
  await toast.waitFor({ timeout: 4000 }).catch(() => {});
  tvrdi('po odškrtnutí naskočí „+5 bodů za splněný úkol"', await toast.count() > 0, 'toast se neukázal');
}

console.log(fails ? `\n${fails} SELHALO` : '\nuzávěrka ví, ke které směně patří — a co za ni bylo');
await b.close();
process.exit(fails ? 1 : 0);
