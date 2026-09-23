// Drift designových hodnot. DESIGN.md popisuje typovou škálu a tvary,
// ale nikdo nikdy nezměřil, kolik různých hodnot aplikace opravdu vykresluje.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const DIR = new URL('./fixtury/', import.meta.url).pathname;
const VSE = [
  ...JSON.parse(readFileSync(new URL('./screens.json', import.meta.url).pathname, 'utf8')),
  ...JSON.parse(readFileSync(new URL('./screens-client.json', import.meta.url).pathname, 'utf8')),
];
const SCREENS = [...new Map(VSE.map(r => [r[2], r])).values()];
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const tok = (r) => execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? "design-round-secret-0123456789ab"} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} ${r}`, { encoding: 'utf8' }).trim();

const AUDIT = `(() => {
  const vidno = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0.05;
  };
  const kde = (el) => (el.className || '').toString().replace(/\\s+/g, ' ').slice(0, 60);
  const out = { radius: {}, size: {}, weight: {}, shadow: {}, gap: {}, kdeRadius: {}, kdeSize: {}, kdeShadow: {}, kdeGap: {} };
  const pribuz = (m, k, v) => { (m[k] ??= []); if (m[k].length < 4 && !m[k].includes(v)) m[k].push(v); };
  for (const el of document.querySelectorAll('body *')) {
    if (!vidno(el)) continue;
    const cs = getComputedStyle(el);
    const tl = cs.borderTopLeftRadius, tr = cs.borderTopRightRadius, bl = cs.borderBottomLeftRadius, br = cs.borderBottomRightRadius;
    if (tl === tr && tl === bl && tl === br && tl !== '0px') {
      const r = tl.includes('%') ? tl : Math.round(parseFloat(tl)) + 'px';
      const rr = parseFloat(r) > 500 ? 'plný' : r;
      out.radius[rr] = (out.radius[rr] ?? 0) + 1; pribuz(out.kdeRadius, rr, kde(el));
    }
    const txt = (el.textContent || '').trim();
    const primy = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (primy && txt) {
      const fs = Math.round(parseFloat(cs.fontSize) * 10) / 10 + 'px';
      out.size[fs] = (out.size[fs] ?? 0) + 1; pribuz(out.kdeSize, fs, kde(el));
      out.weight[cs.fontWeight] = (out.weight[cs.fontWeight] ?? 0) + 1;
    }
    if (cs.boxShadow && cs.boxShadow !== 'none') {
      const s = cs.boxShadow.replace(/\\s+/g, ' ').slice(0, 70);
      out.shadow[s] = (out.shadow[s] ?? 0) + 1; pribuz(out.kdeShadow, s, kde(el));
    }
    if (cs.display === 'flex' || cs.display === 'grid' || cs.display === 'inline-flex') {
      for (const g of [cs.rowGap, cs.columnGap]) {
        if (g && g !== 'normal' && parseFloat(g) > 0) {
          const gg = Math.round(parseFloat(g)) + 'px';
          out.gap[gg] = (out.gap[gg] ?? 0) + 1; pribuz(out.kdeGap, gg, kde(el));
        }
      }
    }
  }
  return out;
})()`;

const W = (process.env.WIDTHS || '390,1280').split(',').map(Number);
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
const soucet = { radius: new Map(), size: new Map(), weight: new Map(), shadow: new Map(), gap: new Map() };
const kde = { radius: new Map(), size: new Map(), shadow: new Map(), gap: new Map() };
for (const [name, role, path] of SCREENS) {
  for (const w of W) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 }, locale: 'cs-CZ' });
    if (role) await ctx.addCookies([{ name: 'next-auth.session-token', value: tok(role), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
    await ctx.route('**/api/**', async route => {
      const u = route.request().url();
      if (u.includes('/api/auth/')) return route.continue();
      const k = keyFor(u);
      if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    const p = await ctx.newPage();
    await p.goto('http://localhost:3000' + path, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(900);
    const r = await p.evaluate(AUDIT).catch(() => null);
    if (r) {
      for (const k of ['radius', 'size', 'weight', 'shadow', 'gap'])
        for (const [v, n] of Object.entries(r[k])) soucet[k].set(v, (soucet[k].get(v) ?? 0) + n);
      for (const [k, src] of [['radius','kdeRadius'],['size','kdeSize'],['shadow','kdeShadow'],['gap','kdeGap']])
        for (const [v, arr] of Object.entries(r[src] || {})) {
          const s = kde[k].get(v) ?? new Set(); for (const a of arr) if (s.size < 5) s.add(a); kde[k].set(v, s);
        }
    }
    await ctx.close();
  }
}
const vypis = (k, popis, limit = 40) => {
  const e = [...soucet[k].entries()].sort((a, b2) => b2[1] - a[1]);
  console.log(`\n=== ${popis}: ${e.length} různých hodnot ===`);
  for (const [v, n] of e.slice(0, limit)) {
    const u = kde[k]?.get(v);
    console.log(`  ${String(n).padStart(6)}×  ${v}${n < 40 && u ? '   ← ' + [...u].slice(0, 2).join(' | ') : ''}`);
  }
  if (e.length > limit) console.log(`  … a ${e.length - limit} dalších`);
};
vypis('radius', 'Zaoblení rohů');
vypis('size', 'Velikost písma');
vypis('weight', 'Tloušťka písma');
vypis('gap', 'Mezery ve flex/grid');
vypis('shadow', 'Stíny', 25);
await b.close();
