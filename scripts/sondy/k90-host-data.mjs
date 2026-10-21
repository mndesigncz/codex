// Spuštění, balík G — GDPR a DSA pro hosty: souhlasy po podnicích, stažení dat, oznámení obsahu.
//
// Sonda nezávisí na databázi: kontroly serveru jdou na cesty, které odmítnou dřív, než sáhnou do
// databáze (bez přihlášení, neplatné tělo); v prohlížeči API podvrhují fixtury.
//  G1 Server: export a souhlasy bez přihlášení 401, /api/nahlasit s neplatným tělem 400 s polem,
//     cron retence bez tajemství odmítnut.
//  G2 Profil hosta (390 i 1280): souhlasy po podnicích, přepnutí pošle { teamId, typ, stav },
//     „Také e-mailem“ se ukáže až po zapnutí; „Stáhnout moje data“ stáhne soubor. Nic nepřetéká.
//  G3 Stránka podniku (nečlen): „Chci novinky od …“ je výchozí nezaškrtnuté; vstup pošle novinky: false,
//     se zaškrtnutím novinky: true; řádek se zaškrtávátkem je dotykový cíl ≥ 44 px.
//  G4 /nahlasit (390 i 1280): prázdné odeslání nic nepošle a ukáže chybu u pole; vyplněné pošle
//     prohlášení a kategorii, potvrzení ukáže číslo oznámení. Nic nepřetéká, zaškrtávátko ≥ 44 px.
// Snímky do SONDY_SNIMKY, jinak do scripts/sondy/shots/.
import { mkdirSync } from 'node:fs';
import { browser, tvrdi, konec, BASE, OUT, tokenPro } from './k68-spolecne.mjs';
import { klientFixtury, namockujKlienta } from '../../apps/scripts/fixtury-klient.mjs';

const SNIMKY = process.env.SONDY_SNIMKY ?? OUT;
mkdirSync(SNIMKY, { recursive: true });
const fix = klientFixtury('2026-10-14');
const VELIKOSTI = [['telefon 390', { width: 390, height: 844 }, true], ['počítač 1280', { width: 1280, height: 900 }, false]];

const pretece = (p) => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
async function req(metoda, cesta, telo) {
  const r = await fetch(BASE + cesta, { method: metoda, headers: { origin: BASE, 'content-type': 'application/json' }, body: telo ? JSON.stringify(telo) : undefined, redirect: 'manual' });
  let d = {}; try { d = await r.json(); } catch { /* ne-JSON */ }
  return { status: r.status, d };
}

async function kontextHosta(viewport, mobil, prihlasen = true) {
  const b = await browser();
  const ctx = await b.newContext({ viewport, locale: 'cs-CZ', isMobile: mobil, hasTouch: mobil });
  if (prihlasen) await ctx.addCookies([{ name: 'next-auth.session-token', value: tokenPro('customer'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await namockujKlienta(ctx, fix);
  return { ctx, p: await ctx.newPage() };
}

// ---------------------------------------------------------------------------
console.log('G1 Server');
{
  let r = await req('GET', '/api/client/account/export');
  tvrdi('export bez přihlášení 401', r.status === 401, `${r.status}`);
  r = await req('GET', '/api/client/account/souhlasy');
  tvrdi('souhlasy bez přihlášení 401', r.status === 401, `${r.status}`);
  r = await req('POST', '/api/client/account/souhlasy', { teamId: 1, typ: 'novinky_push', stav: true });
  tvrdi('změna souhlasu bez přihlášení 401', r.status === 401, `${r.status}`);
  r = await req('POST', '/api/nahlasit', { popis: 'x' });
  tvrdi('oznámení: krátký popis 400 s polem', r.status === 400 && r.d.pole === 'popis', JSON.stringify(r));
  r = await req('POST', '/api/nahlasit', { popis: 'Fotka v nabídce', kategorie: 'podvod', zduvodneni: 'Nabízí zboží, které neexistuje, a bere zálohy.', jmeno: 'Jan', email: 'jan@priklad.cz' });
  tvrdi('oznámení: bez prohlášení 400', r.status === 400 && r.d.pole === 'prohlaseni', JSON.stringify(r));
  r = await req('GET', '/api/retence');
  tvrdi('cron retence bez tajemství odmítnut', r.status === 401 || r.status === 403 || r.status === 503, `${r.status}`);
}

// ---------------------------------------------------------------------------
console.log('G2 Profil hosta');
for (const [nazev, viewport, mobil] of VELIKOSTI) {
  const { ctx, p } = await kontextHosta(viewport, mobil);
  const posty = []; let exportu = 0;
  const stav = [{ teamId: 1, podnik: 'Kavárna U Lípy', slug: 'kavarna-u-lipy', push: true, email: true }, { teamId: 2, podnik: 'Ukázková čajovna', slug: 'ukazkova-cajovna', push: false, email: false }];
  await ctx.route('**/api/client/account/souhlasy', r => {
    if (r.request().method() === 'POST') {
      const b = JSON.parse(r.request().postData() || '{}'); posty.push(b);
      const x = stav.find(s => s.teamId === b.teamId);
      if (b.typ === 'novinky_push') { x.push = b.stav; if (!b.stav) x.email = false; } else { x.email = b.stav; if (b.stav) x.push = true; }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, teamId: x.teamId, push: x.push, email: x.email }) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ dostupne: true, podniky: stav }) });
  });
  await ctx.route('**/api/client/account/export', r => { exportu++; return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-disposition': 'attachment; filename="x.json"' }, body: JSON.stringify({ aplikace: 'Managero client' }) }); });
  // Přestavba hosta: souhlasy, export a smazání jsou na stránce Moje (profil z avataru), /client/me/profil.
  await p.goto(BASE + '/client/me/profil', { waitUntil: 'networkidle' }).catch(() => {});
  const sekce = p.locator('[data-souhlasy-podniku]');
  await sekce.waitFor({ timeout: 15000 }).catch(() => {});
  tvrdi(`${nazev}: souhlasy po podnicích jsou`, await sekce.count() === 1);
  const prepinace = sekce.getByRole('switch');
  tvrdi(`${nazev}: dva podniky + e-mail u zapnutého`, await prepinace.count() === 3, `${await prepinace.count()}`);
  await sekce.scrollIntoViewIfNeeded().catch(() => {});
  await p.screenshot({ path: `${SNIMKY}/k90-souhlasy-${viewport.width}.png`, fullPage: false });
  await sekce.getByRole('switch', { name: 'Ukázková čajovna' }).click();
  await p.waitForTimeout(500);
  tvrdi(`${nazev}: zapnutí pošle teamId, typ a stav`, posty.length === 1 && posty[0].teamId === 2 && posty[0].typ === 'novinky_push' && posty[0].stav === true, JSON.stringify(posty));
  tvrdi(`${nazev}: po zapnutí se nabídne i e-mail`, await sekce.getByRole('switch').count() === 4);
  await sekce.getByRole('switch', { name: 'Kavárna U Lípy' }).click();
  await p.waitForTimeout(500);
  tvrdi(`${nazev}: vypnutí podniku schová jeho e-mail`, posty.length === 2 && posty[1].stav === false && await sekce.getByRole('switch').count() === 3, JSON.stringify(posty));
  const vysky = await sekce.locator('[role="switch"]').evaluateAll(els => els.map(e => Math.round(e.closest('div,li').getBoundingClientRect().height)));
  tvrdi(`${nazev}: řádky přepínačů ≥ 44 px`, vysky.every(v => v >= 44), JSON.stringify(vysky));
  const dl = p.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await p.locator('[data-export-hosta]').getByRole('button', { name: 'Stáhnout moje data' }).click();
  await dl;
  await p.waitForTimeout(400);
  tvrdi(`${nazev}: stažení zavolá export a řekne výsledek`, exportu === 1 && await p.getByText('Soubor je stažený.').count() === 1, `${exportu}`);
  tvrdi(`${nazev}: nic nepřetéká`, !(await pretece(p)));
  await p.locator('[data-export-hosta]').scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${SNIMKY}/k90-export-${viewport.width}.png`, fullPage: false });
  await ctx.close();
}

// ---------------------------------------------------------------------------
console.log('G3 Vstup do členství');
for (const [nazev, viewport, mobil] of VELIKOSTI) {
  const { ctx, p } = await kontextHosta(viewport, mobil);
  const nečlen = JSON.parse(JSON.stringify(fix.b['ukazkove-bistro'])); nečlen.me = { member: false };
  const posty = [];
  await ctx.route('**/api/client/b/ukazkove-bistro', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(nečlen) }));
  await ctx.route('**/api/client/b/ukazkove-bistro/join', r => { posty.push(JSON.parse(r.request().postData() || '{}')); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, points: 10, novinky: false }) }); });
  await p.goto(BASE + '/client/ukazkove-bistro', { waitUntil: 'networkidle' }).catch(() => {});
  const box = p.locator('[data-vstup-clenstvi] input[type="checkbox"]');
  await box.waitFor({ timeout: 15000 }).catch(() => {});
  tvrdi(`${nazev}: „Chci novinky od …“ je a výchozí nezaškrtnuté`, await box.count() === 1 && !(await box.isChecked()) && await p.getByText('Chci novinky od Ukázkové bistro').count() === 1);
  const vyska = await p.locator('[data-vstup-clenstvi] label').evaluate(e => Math.round(e.getBoundingClientRect().height)).catch(() => 0);
  tvrdi(`${nazev}: řádek se zaškrtávátkem ≥ 44 px`, vyska >= 44, `${vyska}`);
  tvrdi(`${nazev}: nic nepřetéká`, !(await pretece(p)));
  await p.screenshot({ path: `${SNIMKY}/k90-vstup-${viewport.width}.png`, fullPage: false });
  await p.locator('[data-vstup-clenstvi]').getByRole('button', { name: 'Stát se členem' }).click();
  await p.waitForTimeout(500);
  tvrdi(`${nazev}: bez zaškrtnutí odejde novinky: false`, posty.length === 1 && posty[0].novinky === false, JSON.stringify(posty));
  await box.check();
  await p.locator('[data-vstup-clenstvi]').getByRole('button', { name: 'Stát se členem' }).click();
  await p.waitForTimeout(500);
  tvrdi(`${nazev}: se zaškrtnutím odejde novinky: true`, posty.length === 2 && posty[1].novinky === true, JSON.stringify(posty));
  await ctx.close();
}

// ---------------------------------------------------------------------------
console.log('G4 Oznámení nezákonného obsahu');
for (const [nazev, viewport, mobil] of VELIKOSTI) {
  const { ctx, p } = await kontextHosta(viewport, mobil, false);
  const posty = [];
  await ctx.route('**/api/nahlasit', r => { posty.push(JSON.parse(r.request().postData() || '{}')); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 42, potvrzeni: true }) }); });
  await p.goto(BASE + '/nahlasit', { waitUntil: 'networkidle' }).catch(() => {});
  await p.getByRole('heading', { name: 'Nahlásit nezákonný obsah' }).waitFor({ timeout: 15000 }).catch(() => {});
  tvrdi(`${nazev}: stránka je i bez přihlášení`, await p.getByRole('heading', { name: 'Nahlásit nezákonný obsah' }).count() === 1);
  tvrdi(`${nazev}: kontaktní místo DSA`, await p.getByRole('heading', { name: 'Kontaktní místo' }).count() === 1);
  await p.screenshot({ path: `${SNIMKY}/k90-nahlasit-${viewport.width}.png`, fullPage: true });
  await p.getByRole('button', { name: 'Odeslat oznámení' }).click();
  await p.waitForTimeout(300);
  tvrdi(`${nazev}: prázdné odeslání nic nepošle a chyba je u pole`, posty.length === 0 && await p.locator('#dsa-popis-chyba').count() === 1);
  await p.fill('#dsa-url', 'https://www.managero.app/client/ukazkove-bistro');
  await p.fill('#dsa-popis', 'Fotka v nabídce bistra');
  await p.selectOption('#dsa-kategorie', 'podvod');
  await p.fill('#dsa-zduvodneni', 'Nabízí zboží, které neexistuje, a bere zálohy předem.');
  await p.fill('#dsa-jmeno', 'Jan Novák');
  await p.fill('#dsa-email', 'jan@priklad.cz');
  await p.getByRole('button', { name: 'Odeslat oznámení' }).click();
  await p.waitForTimeout(300);
  tvrdi(`${nazev}: bez prohlášení nic neodejde`, posty.length === 0 && await p.locator('#dsa-prohlaseni-chyba').count() === 1);
  const vyska = await p.locator('[data-dsa-prohlaseni]').evaluate(e => Math.round(e.getBoundingClientRect().height));
  tvrdi(`${nazev}: prohlášení je dotykový cíl ≥ 44 px`, vyska >= 44, `${vyska}`);
  tvrdi(`${nazev}: nic nepřetéká`, !(await pretece(p)));
  await p.check('#dsa-prohlaseni');
  await p.getByRole('button', { name: 'Odeslat oznámení' }).click();
  await p.locator('[data-dsa-hotovo]').waitFor({ timeout: 5000 }).catch(() => {});
  tvrdi(`${nazev}: odejde kategorie, prohlášení a kontakt`, posty.length === 1 && posty[0].kategorie === 'podvod' && posty[0].prohlaseni === true && posty[0].email === 'jan@priklad.cz', JSON.stringify(posty));
  tvrdi(`${nazev}: potvrzení s číslem oznámení`, await p.getByText('Číslo oznámení: #42.', { exact: false }).count() === 1);
  await p.screenshot({ path: `${SNIMKY}/k90-nahlasit-hotovo-${viewport.width}.png`, fullPage: false });
  await ctx.close();
}

await konec();
