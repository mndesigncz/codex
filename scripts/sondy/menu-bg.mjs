import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const DIR = new URL('./fixtury/', import.meta.url).pathname;
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
let fails = 0;
const tvrdi = (popis, ok, co = '') => { console.log(`${ok ? '✓' : '✗'} ${popis}${ok ? '' : '  ← ' + co}`); if (!ok) fails++; };
const alfa = (bg) => { const m = bg.match(/rgba?\(([^)]+)\)/); if (!m) return 0; const p = m[1].split(',').map(Number); return p.length === 4 ? p[3] : 1; };
for (const [role, path, theme] of [['employer', '/employer/overview', 'light'], ['employer', '/employer/overview', 'dark'], ['employee', '/employee/shifts', 'light']]) {
  const tok = execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? "design-round-secret-0123456789ab"} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} ${role}`, { encoding: 'utf8' }).trim();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'cs-CZ', colorScheme: theme });
  await ctx.addCookies([{ name: 'next-auth.session-token', value: tok, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.addInitScript(t => { try { localStorage.setItem('theme', t); } catch {} }, theme);
  await ctx.route('**/api/**', async route => {
    const u = route.request().url();
    if (u.includes('/api/auth/')) return route.continue();
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p = await ctx.newPage();
  await p.goto('http://localhost:3000' + path, { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  const tag = `${role}/${theme}`;
  if (role === 'employer') {
    await p.locator('button[title^="Podnik:"]').first().click(); await p.waitForTimeout(350);
    const menu = p.getByRole('menu').first();
    const bg = await menu.evaluate(el => getComputedStyle(el).backgroundColor);
    tvrdi(`${tag}: přepínač podniku má pevné pozadí (${bg})`, alfa(bg) >= 0.85, bg);
    await p.screenshot({ path: `${process.env.S}/menu-${role}-${theme}-podnik.png`, clip: { x: 0, y: 0, width: 320, height: 420 } });
    await p.keyboard.press('Escape'); await p.mouse.click(900, 500); await p.waitForTimeout(250);
  }
  // účtové menu: tlačítko se jménem dole v liště
  // Účtové tlačítko je poslední v bočním pásu (jméno + pozice) — text se liší podle účtu.
  const ucet = p.locator('aside button[aria-expanded], aside button:has-text("Zaměstna"), aside button:has-text("Vedení"), aside button:has-text("Eva Testová"), aside button:has-text("Martin")').last();
  await ucet.click(); await p.waitForTimeout(350);
  const panel = p.locator('aside').getByText('Odhlásit se').locator('xpath=ancestor::div[contains(@class,"glass-strong")][1]');
  const n = await panel.count();
  const bg2 = n ? await panel.evaluate(el => getComputedStyle(el).backgroundColor) : 'nenalezeno';
  tvrdi(`${tag}: účtové menu má pevné pozadí (${bg2})`, n > 0 && alfa(bg2) >= 0.85, bg2);
  await p.screenshot({ path: `${process.env.S}/menu-${role}-${theme}-ucet.png`, clip: { x: 0, y: 480, width: 320, height: 420 } });
  await ctx.close();
}
await b.close();
console.log(fails ? `\n${fails} SELHALO` : '\nmenu mají pozadí');
process.exit(fails ? 1 : 0);
