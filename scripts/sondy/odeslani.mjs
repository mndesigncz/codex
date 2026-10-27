// Co se stane, když zákazníkovi vypadne spojení uprostřed odesílání.
// `await fetch` bez `try` vyhodí výjimku, obsluha umře — a `setBusy(false)`
// se nikdy nespustí. Tlačítko zůstane v „Odesílám…" navždycky.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const BASE = process.env.SONDY_ZAKLAD ?? process.env.SONDY_BASE ?? 'http://localhost:3000';
const DIR = new URL('./fixtury/', import.meta.url).pathname;
const OUT = new URL('./shots/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const tok = (r) => execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? "design-round-secret-0123456789ab"} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} ${r}`, { encoding: 'utf8' }).trim();
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
const problems = []; const ok = m => console.log('  ✓', m); const bad = m => { console.log('  ✗', m); problems.push(m); };

const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'cs-CZ' });
// Pevné „teď" (jako kiosk): dnes 10:30 v Praze. Časy rezervace na dnešek se počítají od teď a večer
// (po zavírací hodině fixtury) by žádný nebyl — sonda by pak netestovala nic.
const TED = (() => {
  const den = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date());
  const poledne = new Date(`${den}T12:00:00Z`);
  const posun = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Prague', hour: 'numeric', hourCycle: 'h23' }).format(poledne)) - 12;
  const [r, mes, d] = den.split('-').map(Number);
  return Date.UTC(r, mes - 1, d, 10 - posun, 30);
})();
await ctx.clock.install({ time: TED });
await ctx.addCookies([{ name: 'next-auth.session-token', value: tok('customer'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
// GET projde, POST rezervace spadne na výpadku spojení — přesně to, co se
// stane, když host stojí ve sklepě kavárny s jednou čárkou signálu.
await ctx.route('**/api/**', async route => {
  const u = route.request().url();
  if (u.includes('/api/auth/')) return route.continue();
  if (route.request().method() === 'POST' && u.includes('/reservations')) return route.abort('internetdisconnected');
  const k = keyFor(u);
  if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
});
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 100)));
await p.goto(BASE + '/client/cafe-am-ring?tab=reserve', { waitUntil: 'networkidle', timeout: 30000 });
await p.waitForTimeout(2000);

console.log('Rezervace, když uprostřed odesílání vypadne spojení:');
const okno = p.getByRole('dialog');
const cas = okno.locator('button', { hasText: /^\d{1,2}:\d{2}$/ }).first();
if (await cas.count() === 0) { bad('nejsou nabídnuté časy — fixture?'); }
else {
  await cas.click();
  await p.waitForTimeout(400);
  const odeslat = okno.getByRole('button', { name: /^(Rezervovat \d|Odeslat|Odesílám)/ }).first();
  if (await odeslat.count() === 0) { bad('tlačítko odeslat není'); }
  else {
    await odeslat.click();
    await p.waitForTimeout(2500);
    const t = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
    const zamrzlo = await odeslat.isDisabled().catch(() => false);
    !zamrzlo ? ok('tlačítko není zamrzlé') : bad('tlačítko zůstalo zablokované — vypadá to, že se pořád odesílá');
    /(nepovedl|nepodařil|spojení|znovu)/i.test(t) ? ok('řekne, že se to nepovedlo') : bad('o neúspěchu mlčí: ' + t.slice(0, 180));
    !/Rezervace odeslána/.test(t) ? ok('netvrdí, že rezervace odešla') : bad('hlásí odeslanou rezervaci, která neodešla');
    await p.screenshot({ path: `${OUT}odeslani-vypadek.png` });
  }
}
if (errs.length) console.log('    [chyba stránky]', errs[0]);
await ctx.close();
console.log(problems.length ? `\nPROBLÉMŮ: ${problems.length}` : '\nVšechno prošlo.');
await b.close();
if (problems.length) process.exitCode = 1;
