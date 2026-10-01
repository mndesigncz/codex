// Cesta registrace → tarif → pokladna. Databáze ani klíče Stripu tu nejsou,
// takže se /api/register a /api/billing/checkout podstrčí. Přihlášení se
// zkouší v obou stavech: když neprojde, nesmí se otevřít pokladna, která
// by vrátila 401 (člověk jde na přihlášení).
import { chromium } from 'playwright-core';
import { kUctu, vyplnUcet } from './cesta-registrace.mjs';
const BASE = process.env.SONDY_ZAKLAD ?? process.env.SONDY_BASE ?? 'http://localhost:3000';
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
let spatne = 0;
const tvrdi = (ok, text, info = '') => { console.log(`${ok ? '✓' : '✗'} ${text}${ok || !info ? '' : `  ← ${info}`}`); if (!ok) spatne++; };

const pripady = [
  // jméno, adresa, přihlášení projde, tarif, který má být předvybraný, čekám pokladnu
  ['Max ročně z ceníku', '/register?plan=max&interval=year', true, 'Max', true],
  ['Pro měsíčně z ceníku', '/register?plan=pro', true, 'Pro', true],
  ['bez tarifu v adrese: doporučení podle odpovědí', '/register', true, 'Pro', true],
  ['přihlášení selže', '/register?plan=max', false, null, false],
  ['tarif Zdarma', '/register?plan=free', true, 'Zdarma', false],
];

for (const [jm, url, prihlaseniProjde, predvybrano, cekamPokladnu] of pripady) {
  const ctx = await b.newContext({ viewport: { width: 430, height: 1000 } });
  let registrace = null; let checkout = null;
  await ctx.route('**/api/register', r => { registrace = JSON.parse(r.request().postData() || '{}'); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, joinCode: 'ABCD12' }) }); });
  if (prihlaseniProjde) await ctx.route('**/api/auth/callback/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: BASE + '/' }) }));
  await ctx.route('**/api/billing/checkout', async r => {
    checkout = JSON.parse(r.request().postData() || '{}');
    return r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Platby zatím nejsou nastavené.' }) });
  });
  const p = await ctx.newPage();
  const chyby = []; p.on('pageerror', e => chyby.push(String(e).slice(0, 140)));
  await p.goto(BASE + url, { waitUntil: 'networkidle' });
  await kUctu(p);
  await vyplnUcet(p);
  await p.getByRole('button', { name: 'Založit podnik' }).click();
  await p.waitForTimeout(2000);

  tvrdi(!!registrace?.odpovedi && registrace.odpovedi.typ === 'kavarna' && registrace.odpovedi.tym?.velikost === 'stredni' && registrace.odpovedi.cile?.includes('rozvrh') && registrace.teamName === 'Kavárna U Lípy',
    `${jm}: registrace posílá odpovědi z cesty`, JSON.stringify(registrace?.odpovedi));
  if (!prihlaseniProjde) {
    await p.getByText('nepodařilo přihlásit').waitFor({ timeout: 15000 }).catch(() => {});
    tvrdi(await p.getByText('nepodařilo přihlásit').count() === 1 && await p.getByRole('link', { name: 'Přihlásit se' }).count() >= 1 && await p.getByRole('dialog').count() === 0,
      `${jm}: bez přihlášení žádná pokladna, ale věta a odkaz na přihlášení`);
  } else {
    await p.getByText('Jak chceš začít?').waitFor({ timeout: 8000 }).catch(() => {});
    const vybrany = await p.locator('.cs-tarif[aria-pressed="true"] .cs-volba-nazev').innerText().catch(() => '');
    tvrdi(vybrany === predvybrano, `${jm}: předvybraný tarif ${predvybrano}`, vybrany);
    const txt = await p.locator('.cs-shrnuti-platby').innerText().catch(() => '');
    if (predvybrano !== 'Zdarma') tvrdi(/Dnes zaplatíš 0\s?Kč/.test(txt) && /strhneme \d+\. \S+ \d{4}/.test(txt), `${jm}: věta o platbě říká 0 Kč dnes a den první platby`, txt.slice(0, 120));
    await p.locator('.cs-dal-limetka').click();
    await p.waitForTimeout(1500);
    const dialog = await p.getByRole('dialog').count() > 0;
    tvrdi(dialog === cekamPokladnu, `${jm}: pokladna ${cekamPokladnu ? 'se otevře' : 'se neotevře'}`);
    if (cekamPokladnu) tvrdi(!!checkout && checkout.plan === predvybrano.toLowerCase(), `${jm}: pokladna chce správný tarif`, JSON.stringify(checkout));
    else {
      await p.waitForURL(u => !u.pathname.startsWith('/register'), { timeout: 20000 }).catch(() => {});
      tvrdi(p.url().includes('/employer/start') || p.url().includes('/login'), `${jm}: Zdarma jde rovnou do průvodce`, p.url());
    }
  }
  tvrdi(chyby.length === 0, `${jm}: bez chyb na stránce`, chyby.join(' | '));
  await ctx.close();
}
await b.close();
if (spatne) { console.log(`\n${spatne} neprošlo`); process.exit(1); }
console.log('\nvše prošlo');
