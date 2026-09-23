// Tlačítko „Stát se členem" na stránce podniku v barvě, kterou si podnik
// zvolil. Měří se skutečný kontrast vykresleného textu, ne to, co říká kód.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
const DIR = new URL('./fixtury/', import.meta.url).pathname;
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });

const BARVY = [['oranžová', '#F97316'], ['tyrkysová', '#14B8A6'], ['modrá', '#0A84FF'],
               ['zelená', '#16A34A'], ['limetka (naše)', '#C8F542']];
for (const [jm, barva] of BARVY) {
  const ctx = await b.newContext({ viewport: { width: 430, height: 950 }, locale: 'cs-CZ' });
  await ctx.route('**/api/**', async route => {
    const u = route.request().url();
    if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) {
      const d = JSON.parse(readFileSync(DIR + k + '.json', 'utf8'));
      // Podnik si zvolil svou barvu — přesně to, co fixture nikdy nemá.
      if (d && typeof d === 'object' && 'accent' in d) d.accent = barva;
      if (d?.business) d.business.accent = barva;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p = await ctx.newPage();
  await p.goto('http://localhost:3000/client/kavarna-u-lipy', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  const m = await p.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find(x => /Stát se členem/.test(x.textContent || ''));
    if (!el) return null;
    const cs = getComputedStyle(el);
    const p2 = (c) => { const q = /rgba?\(([^)]+)\)/.exec(c); return q ? q[1].split(',').map(Number) : null; };
    const lum = c => { const f = v => { v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); };
      return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2]); };
    const fg = p2(cs.color), bg = p2(cs.backgroundColor);
    if (!fg || !bg) return null;
    const l1 = lum(fg), l2 = lum(bg);
    return { pomer: +(((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05)).toFixed(2)), fg: cs.color, bg: cs.backgroundColor };
  });
  console.log(m ? `${jm.padEnd(15)} ${barva}: text ${m.fg} na ${m.bg} = ${m.pomer}:1 ${m.pomer >= 4.5 ? '✓' : (m.pomer >= 3 ? 'jen velký text' : '✗')}`
                : `${jm}: tlačítko nenalezeno`);
  await ctx.close();
}
await b.close();
