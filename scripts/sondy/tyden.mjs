// Podnik má v nastavení začátek týdne. Ctí ho všechny mřížky stejně?
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const DIR = new URL('./fixtury/', import.meta.url).pathname;
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const tok = (r) => execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? "design-round-secret-0123456789ab"} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} ${r}`, { encoding: 'utf8' }).trim();
const zaklad = JSON.parse(readFileSync(DIR + 'teams.json', 'utf8'));
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });

for (const zacatek of [1, 0]) {
  console.log(`\n— začátek týdne: ${zacatek === 1 ? 'pondělí' : 'NEDĚLE'} —`);
  for (const [jm, role, cesta] of [
    ['rozvrh (ScheduleBuilder)', 'employer', '/employer/overview?view=shifts'],
    ['moje směny (kalendář)',    'employee', '/employee/shifts'],
    ['úkoly (týdenní tabule)',   'employer', '/employer/overview?view=tasks'],
  ]) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'cs-CZ' });
    await ctx.addCookies([{ name: 'next-auth.session-token', value: tok(role), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
    await ctx.route('**/api/**', async route => {
      const u = route.request().url();
      if (u.includes('/api/auth/')) return route.continue();
      if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      if (u.includes('/api/teams')) return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ...zaklad, team: { ...zaklad.team, week_start: zacatek } }) });
      const k = keyFor(u);
      if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    const p = await ctx.newPage();
    await p.goto('http://localhost:3000' + cesta, { waitUntil: 'networkidle' });
    await p.waitForTimeout(1600);
    // První buňka hlavičky dnů: hledá se řada sedmi zkratek.
    const prvni = await p.evaluate(() => {
      const zkratky = ['Po','Út','St','Čt','Pá','So','Ne'];
      for (const el of document.querySelectorAll('div,tr,thead')) {
        const deti = [...el.children].map(c => (c.textContent || '').trim());
        if (deti.length >= 7 && deti.slice(0, 7).every(t => zkratky.includes(t))) return deti.slice(0, 7).join(' ');
      }
      return null;
    });
    console.log(`   ${jm.padEnd(26)} ${prvni ?? '(mřížka dnů nenalezena)'}`);
    await ctx.close();
  }
}
await b.close();
