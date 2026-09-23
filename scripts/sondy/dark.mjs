// Tmavý režim: aplikace ho nabízí a ukládá do localStorage, ale nikdy se
// neměřil. Tady se u každého viditelného textu spočítá skutečný kontrast
// proti pozadí, které je pod ním — ne proti tomu, co je napsané ve třídě.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const DIR = new URL('./fixtury/', import.meta.url).pathname;
const OUT = new URL('./shots/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const SCREENS = JSON.parse(readFileSync(new URL('./screens.json', import.meta.url).pathname, 'utf8'));
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const tok = (r) => execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? "design-round-secret-0123456789ab"} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} ${r}`, { encoding: 'utf8' }).trim();

// WCAG 2.1: relativní jas a kontrastní poměr. Práh 4.5:1 pro běžný text,
// 3:1 pro velký (18.66px tučně / 24px).
const MERENI = `(() => {
  const parse = (c) => {
    const m = /rgba?\\(([^)]+)\\)/.exec(c);
    if (!m) return null;
    const p = m[1].split(',').map(x => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1,
  });
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); };
  // Pozadí pod prvkem: leze se nahoru, dokud není něco neprůhledného.
  const bgOf = (el) => {
    let acc = null;
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (!c || c.a === 0) continue;
      acc = acc ? over(acc, c) : c;
      if (acc.a >= 0.999) return acc;
    }
    return acc ?? { r: 255, g: 255, b: 255, a: 1 };
  };
  const out = [];
  for (const el of document.querySelectorAll('*')) {
    if (el.children.length) continue;
    const t = (el.textContent || '').trim();
    if (t.length < 2) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width < 1 || r.height < 1 || cs.visibility === 'hidden' || cs.opacity === '0') continue;
    if (r.top > innerHeight * 3 || r.bottom < 0) continue;
    const fg = parse(cs.color);
    if (!fg) continue;
    const bg = bgOf(el);
    const eff = fg.a < 1 ? over(fg, bg) : fg;
    const px = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    const velky = px >= 24 || (bold && px >= 18.66);
    const prah = velky ? 3 : 4.5;
    const cr = ratio(eff, bg);
    if (cr < prah) out.push({ t: t.slice(0, 34), cr: Math.round(cr * 100) / 100, prah, px: Math.round(px) });
  }
  return out;
})()`;

const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
let celkem = 0;
const horsi = [];
for (const [name, role, path] of SCREENS) {
  // Hostovská část tmavý režim záměrně nemá (viz skript v layoutu).
  if (path.startsWith('/client')) continue;
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'cs-CZ', colorScheme: 'dark' });
  if (role) await ctx.addCookies([{ name: 'next-auth.session-token', value: tok(role), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.addInitScript(() => { try { localStorage.setItem('managero-theme', 'dark'); } catch {} });
  await ctx.route('**/api/**', async route => {
    const u = route.request().url();
    if (u.includes('/api/auth/')) return route.continue();
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p = await ctx.newPage();
  await p.goto('http://localhost:3000' + path, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(1800);
  const dark = await p.evaluate(() => document.documentElement.getAttribute('data-theme'));
  const nalezy = await p.evaluate(MERENI);
  celkem += nalezy.length;
  if (nalezy.length) {
    const nej = nalezy.slice().sort((a, b2) => a.cr - b2.cr).slice(0, 3);
    console.log(`  ✗ ${name}${dark === 'dark' ? '' : ' [NENÍ TMAVÝ!]'}: ${nalezy.length} × málo kontrastu — ` +
      nej.map(x => `„${x.t}" ${x.cr}:1 (má být ${x.prah})`).join(' | '));
    horsi.push(...nalezy.map(x => ({ ...x, name })));
    await p.screenshot({ path: `${OUT}dark-${name}.png`, fullPage: true });
  } else {
    console.log(`  ✓ ${name}${dark === 'dark' ? '' : ' [NENÍ TMAVÝ!]'}`);
  }
  await ctx.close();
}
console.log(`\nCelkem ${celkem} textů pod prahem kontrastu v tmavém režimu.`);
const podle = new Map();
for (const h of horsi) podle.set(h.t, (podle.get(h.t) ?? 0) + 1);
console.log('Nejčastější:', [...podle.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 8).map(([t, n]) => `${n}× „${t}"`).join(', '));
await b.close();
