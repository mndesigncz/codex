// Co uvidí obsluha, když tabletu za barem spadne wifi? A co host u menu?
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const BASE = process.env.SONDY_ZAKLAD ?? process.env.SONDY_BASE ?? 'http://localhost:3000';
const DIR = new URL('./fixtury/', import.meta.url).pathname;
const have = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const keyFor = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };
const tok = execSync(`NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET ?? "design-round-secret-0123456789ab"} node ${new URL('./cookie-role.mjs', import.meta.url).pathname} kiosk`, { encoding: 'utf8' }).trim();
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });

for (const [jm, cesta, prihlas] of [['kiosk za barem', '/kiosk', true], ['menu na iPadu', '/menu-akce.html', false]]) {
  const ctx = await b.newContext({ viewport: { width: 810, height: 1080 }, locale: 'cs-CZ' });
  if (prihlas) await ctx.addCookies([{ name: 'next-auth.session-token', value: tok, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.route('**/api/**', async route => {
    const u = route.request().url();
    if (u.includes('/api/auth/')) return route.continue();
    if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    const k = keyFor(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p = await ctx.newPage();
  // 1) Normální návštěva — ať se stihne zaregistrovat service worker a naplnit cache.
  await p.goto(BASE + cesta, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  const sw = await p.evaluate(() => navigator.serviceWorker?.controller ? 'řídí' : (navigator.serviceWorker?.getRegistration ? 'registrovaný, neřídí' : 'žádný'));

  // 2) Spadne wifi a tablet se obnoví (nebo ho někdo zamkne a odemkne).
  await ctx.setOffline(true);
  let nacetlo = true;
  try { await p.reload({ waitUntil: 'domcontentloaded', timeout: 15000 }); }
  catch { nacetlo = false; }
  await p.waitForTimeout(1200);
  const text = (await p.evaluate(() => (document.body?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 110))) || '(prázdno)';
  // Naše obrazovka = cokoli kromě chybové stránky prohlížeče (lístek z cache nemá značku Managero).
  const nase = nacetlo && await p.evaluate(() => !/ERR_INTERNET_DISCONNECTED|No internet|Žádné připojení k internetu/.test(document.body?.innerText || '') && (document.body?.innerText || '').trim().length > 20);
  console.log(`${jm}:`);
  console.log(`   service worker: ${sw}`);
  console.log(`   po výpadku se stránka načetla: ${nacetlo ? 'ano' : 'NE'}`);
  console.log(`   je to naše obrazovka: ${nase ? 'ano ✓' : 'NE ✗ (chybová stránka prohlížeče)'}`);
  if (!nase) process.exitCode = 1;
  console.log(`   co je vidět: „${text}"`);
  await p.screenshot({ path: `shots/offline-${cesta.replace(/[^a-z]/gi, '') || 'root'}.png` });
  await ctx.close();
}
await b.close();
