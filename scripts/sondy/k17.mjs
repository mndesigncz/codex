// Kolo 17: hostovská stránka eurové kavárny nesmí ukazovat koruny.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const DIR = new URL('./fixtury/', import.meta.url).pathname;
const OUT = new URL('./shots/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
const problems = []; const ok = m => console.log('  ✓', m); const bad = m => { console.log('  ✗', m); problems.push(m); };
async function open(url) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 }, locale: 'cs-CZ' });
  await ctx.route('**/api/**', async route => {
    const u = route.request().url();
    if (u.includes('/api/auth/')) return route.continue();
    if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  await p.goto('http://localhost:3000' + url, { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForTimeout(1800);
  return { ctx, p, errs };
}
const text = p => p.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' '));

console.log('Eurová kavárna — stránka pro hosty:');
{
  const { ctx, p, errs } = await open('/client/b/cafe-am-ring');
  const t = await text(p);
  !/EUR/.test(t) ? ok('nikde není holý kód „EUR"') : bad('pořád tiskne kód místo symbolu');
  /€/.test(t) ? ok('ceny mají symbol €') : bad('symbol € nikde: ' + t.slice(0, 140));
  !/\bKč\b/.test(t) ? ok('žádné koruny na eurové stránce') : bad('koruny na eurové stránce');
  await p.screenshot({ path: `${OUT}k17-euro-1280.png` });
  if (errs.length) bad('euro: ' + errs[0]);
  await ctx.close();
}
console.log('Korunová kavárna — nic se nerozbilo:');
{
  const { ctx, p, errs } = await open('/client/b/kavarna-u-lipy');
  const t = await text(p);
  /Kč/.test(t) ? ok('koruny zůstávají korunami') : bad('koruny zmizely: ' + t.slice(0, 140));
  !/CZK/.test(t) ? ok('žádný holý kód „CZK"') : bad('tiskne kód CZK');
  await p.screenshot({ path: `${OUT}k17-czk-1280.png` });
  if (errs.length) bad('czk: ' + errs[0]);
  await ctx.close();
}
console.log(problems.length ? `\nPROBLÉMŮ: ${problems.length}` : '\nVšechno prošlo.');
await b.close();
