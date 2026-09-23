// Sonda hlásila 3 malé dotykové cíle. Jenže .tap-target roztahuje plochu
// pseudoprvkem, který getBoundingClientRect na prvku neukáže. Tohle zkouší
// skutečný zásah: bod kousek MIMO viditelnou krabici musí pořád trefit
// tlačítko. Když netrefí, je to vada; když trefí, byla vada v měřidle.
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
const ctx = await b.newContext({ viewport: { width: 810, height: 1080 }, locale: 'cs-CZ', hasTouch: true });
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
await p.goto('http://localhost:3000/kiosk', { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
const vysledek = await p.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('button, a[href], [role="button"]')) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || r.width < 2) continue;
    if (r.height >= 44 && r.width >= 44) continue;
    const jmeno = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 26) || '(bez textu)';
    // Body, které leží uvnitř 44px plochy, ale mimo viditelnou krabici.
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const zkousky = [
      ['nad', cx, Math.max(1, cy - 21)],
      ['pod', cx, Math.min(innerHeight - 1, cy + 21)],
      ['vlevo', Math.max(1, cx - 21), cy],
      ['vpravo', Math.min(innerWidth - 1, cx + 21), cy],
    ];
    const trefy = zkousky.map(([sm, x, y]) => {
      const cil = document.elementFromPoint(x, y);
      return [sm, !!(cil && (cil === el || el.contains(cil) || cil.closest('button,a[href],[role="button"]') === el))];
    });
    out.push({ jmeno, w: Math.round(r.width), h: Math.round(r.height), trefy });
  }
  return out;
});
for (const v of vysledek) {
  const ok = v.trefy.filter(t => t[1]).length;
  console.log(`${v.w}×${v.h}px „${v.jmeno}" — zásah mimo krabici: ${v.trefy.map(t => t[0] + (t[1] ? ' ✓' : ' ✗')).join(', ')}  (${ok}/4)`);
}
await b.close();
