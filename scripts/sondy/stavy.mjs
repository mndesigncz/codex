// Kolik různých červených doopravdy vyjde na obrazovku.
//
// Paleta má u každého stavu jen `-bg` (nízká alfa) a `-ink` (tmavý text).
// Plný odstín ani střední alfa v ní nejsou, takže si je každé místo
// vymyslelo z Tailwindu. Grep řekne, kolik je zápisů; tohle měří, kolik
// z nich je doopravdy vidět a jak daleko od sebe.
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
    return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const hsl = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) {
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    const l = (mx + mn) / 2;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    return [h, s, l];
  };
  const rodina = (h, s, l) => {
    if (s < 0.25 || l > 0.96 || l < 0.05) return null;   // šedé a skoro bílé nejsou stav
    if (h < 16 || h >= 345) return 'červená';
    if (h < 50) return 'jantarová';
    if (h < 70) return 'žlutá';
    if (h < 160) return 'zelená';
    if (h < 200) return 'tyrkysová';
    if (h < 260) return 'modrá';
    if (h < 290) return 'fialová';
    return 'růžová';
  };
  const out = {};
  const pridat = (barva, alfa, kde) => {
    const m = /rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([0-9.]+))?\\)/.exec(barva);
    if (!m) return;
    const a = m[4] === undefined ? 1 : parseFloat(m[4]);
    if (a < 0.05) return;
    const [h, s, l] = hsl(+m[1], +m[2], +m[3]);
    const rod = rodina(h, s, l);
    if (!rod) return;
    const klic = rod + '|' + \`rgb(\${m[1]}, \${m[2]}, \${m[3]})\` + '|a=' + (Math.round(a * 100) / 100);
    (out[klic] ??= { n: 0, kde: [] });
    out[klic].n++;
    if (out[klic].kde.length < 3 && !out[klic].kde.includes(kde)) out[klic].kde.push(kde);
  };
  for (const el of document.querySelectorAll('body *')) {
    if (!vidno(el)) continue;
    const cs = getComputedStyle(el);
    const kde = (el.className || '').toString().replace(/\\s+/g, ' ').slice(0, 50);
    pridat(cs.backgroundColor, 0, kde);
    const txt = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (txt) pridat(cs.color, 0, kde);
    if (cs.borderTopWidth !== '0px') pridat(cs.borderTopColor, 0, kde);
  }
  return out;
})()`;

const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
const soucet = new Map();
for (const [name, role, path] of SCREENS) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'cs-CZ' });
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
  const r = await p.evaluate(AUDIT).catch(() => ({}));
  for (const [k, v] of Object.entries(r)) {
    const cur = soucet.get(k) ?? { n: 0, kde: [], obrazovky: new Set() };
    cur.n += v.n;
    cur.obrazovky.add(name);
    for (const x of v.kde) if (cur.kde.length < 4 && !cur.kde.includes(x)) cur.kde.push(x);
    soucet.set(k, cur);
  }
  await ctx.close();
}
const rodiny = new Map();
for (const [k, v] of soucet) {
  const [rod] = k.split('|');
  (rodiny.get(rod) ?? rodiny.set(rod, []).get(rod)).push([k, v]);
}
console.log('\n=== Kolik odstínů na jeden význam ===');
for (const [rod, list] of [...rodiny.entries()].sort((a, b2) => b2[1].length - a[1].length)) {
  const barvy = new Set(list.map(([k]) => k.split('|')[1]));
  console.log(`\n${rod}: ${barvy.size} různých odstínů, ${list.length} kombinací s alfou`);
  for (const [k, v] of list.sort((a, b2) => b2[1].n - a[1].n).slice(0, 8)) {
    const [, barva, a] = k.split('|');
    console.log(`  ${String(v.n).padStart(5)}×  ${barva} ${a}  (${v.obrazovky.size} obr.)  ← ${v.kde[0] ?? ''}`);
  }
  if (list.length > 8) console.log(`  … a ${list.length - 8} dalších`);
}
await b.close();
