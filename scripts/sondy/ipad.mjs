// Dvě obrazovky, které na tabletu reálně stojí celý den: kiosk za barem
// a menu na iPadu před podnikem. Skutečné rozměry iPadu, obě orientace.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const DIR = new URL('./fixtury/', import.meta.url).pathname;
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const tok = execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? "design-round-secret-0123456789ab"} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} kiosk`, { encoding: 'utf8' }).trim();
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
const rozmery = [['iPad na výšku', 810, 1080], ['iPad na šířku', 1080, 810], ['iPad mini', 744, 1133]];
for (const [jm, w, h] of rozmery) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'cs-CZ', hasTouch: true });
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
  const chyby = []; p.on('pageerror', e => chyby.push(String(e).slice(0, 120)));
  await p.goto('http://localhost:3000/kiosk', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  const m = await p.evaluate(() => {
    const sw = document.documentElement.clientWidth;
    const prestek = document.documentElement.scrollWidth > sw + 2;
    // Dotykový cíl na tabletu u baru: nic pod 44 px.
    let male = 0;
    for (const el of document.querySelectorAll('button, a[href], [role="button"]')) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || r.width < 2) continue;
      if (r.height < 44 || r.width < 44) male++;
    }
    // Zkolabovaný text.
    let nula = 0;
    for (const el of document.querySelectorAll('p,span,div')) {
      if (el.children.length) continue;
      const t = (el.textContent || '').trim(); if (t.length < 3) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 6 && r.height > 0) nula++;
    }
    return { prestek, male, nula };
  });
  console.log(`${jm} ${w}×${h}: přetéká=${m.prestek ? 'ANO ✗' : 'ne ✓'} · malé dotykové cíle=${m.male}${m.male ? ' ✗' : ' ✓'} · zkolabovaný text=${m.nula}${m.nula ? ' ✗' : ' ✓'}${chyby.length ? ' CHYBY: ' + chyby.join('|') : ''}`);
  await p.screenshot({ path: `shots/kiosk-${w}x${h}.png` });
  await ctx.close();
}
await b.close();
