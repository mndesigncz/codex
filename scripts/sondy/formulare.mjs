// Kolik práce stojí obrazovka. Ne správnost, ale únava: dlouhý formulář
// bez oddílů je zeď, do které se člověk opře a nevidí konec.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const DIR = new URL('./fixtury/', import.meta.url).pathname;
const SCREENS = [
  ...JSON.parse(readFileSync(new URL('./screens.json', import.meta.url).pathname, 'utf8')),
  ...JSON.parse(readFileSync(new URL('./screens-client.json', import.meta.url).pathname, 'utf8')),
];
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const tok = (r) => execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? "design-round-secret-0123456789ab"} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} ${r}`, { encoding: 'utf8' }).trim();

const MERENI = `(() => {
  const vid = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const out = [];
  for (const form of document.querySelectorAll('form')) {
    if (!vid(form)) continue;
    const pole = [...form.querySelectorAll('input, select, textarea')]
      .filter(e => vid(e) && (e.getAttribute('type') || '').toLowerCase() !== 'hidden');
    if (pole.length < 2) continue;
    // Oddíly: nadpis, fieldset nebo legenda uvnitř formuláře.
    const oddily = form.querySelectorAll('fieldset, legend, h2, h3, [role="group"]').length;
    const r = form.getBoundingClientRect();
    out.push({ poli: pole.length, oddily, vyska: Math.round(r.height) });
  }
  // A samostatné shluky polí mimo <form> — v téhle aplikaci jich je dost.
  const volna = [...document.querySelectorAll('input, select, textarea')]
    .filter(e => vid(e) && !e.closest('form') && (e.getAttribute('type') || '').toLowerCase() !== 'hidden').length;
  return { formulare: out, volna, vyskaStranky: document.documentElement.scrollHeight };
})()`;

const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
const nalezy = [];
for (const [name, role, path] of SCREENS) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'cs-CZ' });
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
  await p.waitForTimeout(1400);
  const r = await p.evaluate(MERENI);
  // Zeď: aspoň sedm polí v jednom formuláři bez jediného oddílu.
  for (const f of r.formulare) {
    if (f.poli >= 7 && f.oddily === 0) nalezy.push(`${name}: formulář se ${f.poli} poli bez oddílu (${f.vyska} px)`);
  }
  if (r.volna >= 12) nalezy.push(`${name}: ${r.volna} polí mimo <form> — formulář, který se za formulář nevydává`);
  if (r.vyskaStranky > 6000) nalezy.push(`${name}: stránka vysoká ${r.vyskaStranky} px na telefonu`);
  await ctx.close();
}
console.log(nalezy.length ? nalezy.map(x => '  ✗ ' + x).join('\n') : '  ✓ žádná zeď z polí');
console.log(`\nCelkem ${nalezy.length} nálezů.`);
await b.close();
