// Kolo 15: co aplikace řekne, když síť selže. Fixtures se schválně nepoužijí —
// vybrané GETy vracejí 500, aby se měřila pravdivost, ne šťastná cesta.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const DIR = new URL('./fixtury/', import.meta.url).pathname;
const OUT = new URL('./shots/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const tok = (r) => execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? "design-round-secret-0123456789ab"} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} ${r}`, { encoding: 'utf8' }).trim();
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
const problems = []; const ok = m => console.log('  ✓', m); const bad = m => { console.log('  ✗', m); problems.push(m); };

/** `down` = seznam kusů cesty, které mají spadnout na 500. */
async function open(url, role, down = [], w = 1280) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, locale: 'cs-CZ' });
  await ctx.addCookies([{ name: 'next-auth.session-token', value: tok(role), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const sent = [];
  await ctx.route('**/api/**', async route => {
    const u = route.request().url();
    if (u.includes('/api/auth/')) return route.continue();
    if (down.some(d => u.includes(d))) return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"vypadek"}' });
    if (route.request().method() !== 'GET') {
      sent.push({ m: route.request().method(), u: u.replace('http://localhost:3000','') });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    }
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  await p.goto('http://localhost:3000' + url, { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForTimeout(2000);
  return { ctx, p, errs, sent };
}
const text = (p) => p.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' '));

console.log('Kiosk — výpadek při prvním načtení rozpisu:');
{
  const { ctx, p, errs } = await open('/kiosk', 'kiosk', ['/api/attendance']);
  const t = await text(p);
  !/Zatím tu nikdo není/.test(t) ? ok('už netvrdí „Zatím tu nikdo není"') : bad('pořád svaluje vinu na vedení');
  /Rozpis se nenačetl/.test(t) ? ok('řekne, že se rozpis nenačetl') : bad('o chybě mlčí');
  /Zkusit znovu/.test(t) ? ok('nabízí „Zkusit znovu"') : bad('bez možnosti zkusit znovu');
  await p.screenshot({ path: `${OUT}k15-kiosk-offline-1280.png` });
  if (errs.length) bad('kiosk: ' + errs[0]);
  await ctx.close();
}

console.log('Kiosk — výpadek /api/teams nesmí udělat Pro zeď:');
{
  const { ctx, p, errs } = await open('/kiosk', 'kiosk', ['/api/teams']);
  const t = await text(p);
  !/patří do plánu Pro|plánu Pro/.test(t) ? ok('žádná Pro zeď z výpadku sítě') : bad('výpadek sítě zamkl zaplacený tablet');
  if (errs.length) bad('Pro: ' + errs[0]);
  await ctx.close();
}

console.log('Dostupnost — výpadek nesmí vést k přepsání prázdnou:');
{
  const { ctx, p, errs, sent } = await open('/employee/shifts?view=availability', 'employee', ['/api/availability']);
  const t = await text(p);
  /Dostupnost se nenačetla/.test(t) ? ok('řekne, že se nenačetla') : bad('o chybě mlčí: ' + t.slice(0, 120));
  const submit = p.locator('button', { hasText: /Odeslat dostupnost|Aktualizovat dostupnost/ });
  (await submit.count()) === 0 ? ok('tlačítko odeslat se vůbec nenabízí') : ((await submit.first().isDisabled()) ? ok('tlačítko odeslat je zamčené') : bad('jde odeslat prázdnou dostupnost'));
  sent.filter(x => x.m === 'POST').length === 0 ? ok('nic se neodeslalo') : bad('odeslalo se i tak');
  await p.screenshot({ path: `${OUT}k15-dostupnost-offline-1280.png` });
  if (errs.length) bad('dostupnost: ' + errs[0]);
  await ctx.close();
}
console.log(problems.length ? `\nPROBLÉMŮ: ${problems.length}` : '\nVšechno prošlo.');
await b.close();
