// Spuštění, balík S — bezpečnost a účty. Sonda nezávisí na databázi: serverové kontroly jdou
// na cesty, které rozhodnou dřív, než sáhnou do databáze; v prohlížeči API podvrhují fixtury.
//  B1 Server: stránka aplikace bez přihlášení → /login?callbackUrl=…; nová API bez přihlášení 401.
//  B2 Přihlášení vrátí na callbackUrl (místní cesta); cizí doména skončí na úvodu.
//  B3 /overit-email: potvrzení odkazem (hotovo / chyba / neplatný odkaz), 390 i 1280.
//  B4 Banner „Potvrď e-mail" s „Poslat znovu" v aplikaci vedení, 390 i 1280, bez přetečení.
//  B5 Nastavení → Zabezpečení: karta Ověření e-mailu a Zámek aplikace (jen v obalu), 390 i 1280.
//  B6 Tým → Tablet: doporučení 6místného PINu, krátký PIN se neuloží.
//  B7 Tablet: tečky podle délky PINu (6), po pěti špatných PINech 30 s pauza.
//   SONDY_ZAKLAD=http://localhost:3446 node scripts/sondy/k90-bezpecnost.mjs   (snímky: K90_SNIMKY=…, jen tablet: K90_JEN=B7)
import { mkdirSync } from 'node:fs';
import { kontext, konec, tvrdi, dokud, roleMine, jdi, OUT, BASE, browser } from './k68-spolecne.mjs';

const TEL = { width: 390, height: 844 };
const PC = { width: 1280, height: 900 };
const TABLET = { width: 768, height: 1024 };
const SNIMKY = process.env.K90_SNIMKY ? process.env.K90_SNIMKY.replace(/\/?$/, '/') : OUT;
mkdirSync(SNIMKY, { recursive: true });
const TOKEN = 'a'.repeat(43);
const skutecneChyby = (chyby) => chyby.filter(c => !/Minified React error #418|Hydration|hydrat/i.test(c));
const pretece = (p) => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

// ---------------------------------------------------------------------------
console.log('B1 Server');
{
  const r = await fetch(BASE + '/employer/overview?view=tasks', { redirect: 'manual' });
  const kam = r.headers.get('location') ?? '';
  tvrdi('B1: /employer bez přihlášení → /login?callbackUrl=/employer/overview?view=tasks', [302, 303, 307, 308].includes(r.status) && /\/login\?callbackUrl=%2Femployer%2Foverview%3Fview%3Dtasks$/.test(kam), `${r.status} ${kam}`);
  const a = await fetch(BASE + '/admin', { redirect: 'manual' });
  tvrdi('B1: /admin se v callbackUrl neprozrazuje', !/callbackUrl=%2Fadmin/.test(a.headers.get('location') ?? ''), a.headers.get('location') ?? '');
  for (const cesta of ['/api/account/overeni-emailu', '/api/upload/primo']) {
    const x = await fetch(BASE + cesta);
    tvrdi(`B1: GET ${cesta} bez přihlášení 401`, x.status === 401, String(x.status));
  }
}

// ---------------------------------------------------------------------------
if (process.env.K90_JEN !== 'B7') {
console.log('B2 Návrat po přihlášení');
for (const [cil, ocekavano] of [['/employer/overview?view=tasks', /\/employer\/overview\?view=tasks$/], ['https://zly.cz/employer', /^http:\/\/localhost:\d+\/(employer[^]*)?$/]]) {
  const b = await browser();
  const ctx = await b.newContext({ viewport: TEL, locale: 'cs-CZ', isMobile: true, hasTouch: true });
  // signIn('credentials', { redirect: false }) → POST callback; podvrh odpoví jako úspěch. Relace je
  // v cookie od začátku (přihlášení samo nepřesměrovává), ať cílová stránka po návratu projde.
  const { tokenPro } = await import('./k68-spolecne.mjs');
  await ctx.addCookies([{ name: 'next-auth.session-token', value: tokenPro('employer'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.route('**/api/auth/callback/credentials**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: BASE + '/' }) }));
  const navstivene = [];
  const p = await ctx.newPage();
  p.on('framenavigated', f => { if (f === p.mainFrame()) navstivene.push(f.url()); });
  await jdi(p, `${BASE}/login?callbackUrl=${encodeURIComponent(cil)}`, { waitUntil: 'load' });
  await p.locator('#login-email').fill('martin@podnik.cz');
  await p.locator('#login-heslo').fill('tajneheslo1');
  await p.getByRole('button', { name: 'Přihlásit se' }).last().click();
  const ok = await dokud(() => navstivene.some(u => ocekavano.test(u)) || ocekavano.test(p.url()), 15000);
  tvrdi(`B2: callbackUrl ${cil} → ${ocekavano}`, ok && !navstivene.some(u => new URL(u).hostname === 'zly.cz'), navstivene.join(' → ') || p.url());
  await ctx.close();
}

// ---------------------------------------------------------------------------
console.log('B3 /overit-email');
for (const [vp, mobil] of [[TEL, true], [PC, false]]) {
  for (const druh of ['hotovo', 'chyba']) {
    const b = await browser();
    const ctx = await b.newContext({ viewport: vp, locale: 'cs-CZ', isMobile: mobil, hasTouch: mobil });
    let tela = [];
    await ctx.route('**/api/account/overeni-emailu/potvrdit', r => { tela.push(r.request().postDataJSON()); return r.fulfill({ status: druh === 'hotovo' ? 200 : 400, contentType: 'application/json', body: JSON.stringify(druh === 'hotovo' ? { ok: true } : { error: 'Odkaz už neplatí. V aplikaci si pošlete nový.' }) }); });
    const p = await ctx.newPage();
    await jdi(p, `${BASE}/overit-email?token=${TOKEN}`);
    const text = druh === 'hotovo' ? 'Hotovo, e-mail je potvrzený. Díky!' : 'Odkaz už neplatí. V aplikaci si pošlete nový.';
    tvrdi(`B3 (${vp.width}): ${druh} — věta a tlačítko Do aplikace`, await dokud(() => p.getByText(text).isVisible(), 8000) && await p.getByRole('link', { name: 'Do aplikace' }).isVisible());
    tvrdi(`B3 (${vp.width}): token odešel jednou`, tela.length === 1 && tela[0]?.token === TOKEN, JSON.stringify(tela));
    tvrdi(`B3 (${vp.width}): nic nepřetéká, tlačítko ≥ 44 px`, !(await pretece(p)) && ((await p.getByRole('link', { name: 'Do aplikace' }).boundingBox())?.height ?? 0) >= 44);
    await p.screenshot({ path: `${SNIMKY}k90-overit-email-${druh}-${vp.width}.png`, fullPage: true });
    await ctx.close();
  }
}
{
  const b = await browser();
  const ctx = await b.newContext({ viewport: TEL, locale: 'cs-CZ', isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await jdi(p, `${BASE}/overit-email?token=kratky`);
  tvrdi('B3: neúplný odkaz → „Odkaz nefunguje"', await p.getByRole('heading', { name: 'Odkaz nefunguje' }).isVisible());
  await ctx.close();
}

// ---------------------------------------------------------------------------
console.log('B4 Banner Potvrď e-mail');
for (const [vp, mobil] of [[TEL, true], [PC, false]]) {
  const posty = [];
  const { ctx, p, chyby } = await kontext({ viewport: vp, mobil, dalsi: (req, json) => {
    const path = new URL(req.url()).pathname;
    if (path === '/api/account/overeni-emailu') {
      if (req.method() === 'POST') { posty.push(1); return json({ ok: true }); }
      return json({ stav: 'ceka', email: 'martin.nemeskal@kavarna-u-lipy.cz' });
    }
    return undefined;
  } });
  await jdi(p, BASE + '/employer/overview');
  const banner = p.locator('.note-info', { hasText: 'Potvrď e-mail.' });
  tvrdi(`B4 (${vp.width}): banner s adresou`, await dokud(() => banner.isVisible(), 12000) && /martin\.nemeskal@kavarna-u-lipy\.cz/.test(await banner.innerText()));
  const znovu = banner.getByRole('button', { name: 'Poslat znovu' });
  tvrdi(`B4 (${vp.width}): tlačítka ≥ 36 px`, ((await znovu.boundingBox())?.height ?? 0) >= 36);
  tvrdi(`B4 (${vp.width}): nic nepřetéká`, !(await pretece(p)));
  await p.screenshot({ path: `${SNIMKY}k90-banner-email-${vp.width}.png` });
  await znovu.click();
  tvrdi(`B4 (${vp.width}): Poslat znovu → POST a věta „Poslali jsme nový odkaz"`, await dokud(() => posty.length === 1 && banner.getByText('Poslali jsme nový odkaz. Platí 48 hodin.').isVisible(), 4000));
  await banner.getByRole('button', { name: 'Později' }).click();
  tvrdi(`B4 (${vp.width}): Později banner schová`, await dokud(async () => (await banner.count()) === 0, 3000));
  tvrdi(`B4 (${vp.width}): bez chyb v konzoli`, skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}
{
  const { ctx, p } = await kontext({ viewport: TEL, mobil: true, dalsi: (req, json) => (new URL(req.url()).pathname === '/api/account/overeni-emailu' ? json({ stav: 'nezahajeno', email: 'x@y.cz' }) : undefined) });
  await jdi(p, BASE + '/employer/overview');
  await p.waitForTimeout(2500);
  tvrdi('B4: účet bez odeslaného odkazu (starší) banner nedostane', (await p.locator('.note-info', { hasText: 'Potvrď e-mail.' }).count()) === 0);
  await ctx.close();
}

// ---------------------------------------------------------------------------
console.log('B5 Nastavení → Zabezpečení');
for (const [vp, mobil] of [[TEL, true], [PC, false]]) {
  const zamek = [];
  const { ctx, p, chyby } = await kontext({ viewport: vp, mobil, dalsi: (req, json) => (new URL(req.url()).pathname === '/api/account/overeni-emailu' ? json({ stav: 'nezahajeno', email: 'martin@podnik.cz' }) : undefined) });
  // Nativní obal: Capacitor a most se zámkem (dostupná biometrika, zatím vypnuto).
  await ctx.addInitScript(() => {
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} };
    let zap = false;
    window.manageroNative = { obal: 'provoz', pushVypnuto: () => false, zamek: { dostupny: async () => true, zapnuto: async () => zap, nastav: async (v) => { window.__zamek = (window.__zamek ?? []).concat(v); zap = v; return true; } } };
  });
  await jdi(p, BASE + '/employer/overview?view=settings&tab=security');
  const karta = p.locator('section', { hasText: 'Ověření e-mailu' }).last();
  tvrdi(`B5 (${vp.width}): karta Ověření e-mailu s „Poslat odkaz"`, await dokud(() => karta.getByRole('button', { name: 'Poslat odkaz' }).isVisible(), 12000));
  const prepinac = p.getByRole('switch', { name: 'Zamykat aplikaci Face ID / otiskem' });
  tvrdi(`B5 (${vp.width}): v obalu přepínač Zámek aplikace`, await dokud(() => prepinac.isVisible(), 6000));
  await prepinac.click();
  tvrdi(`B5 (${vp.width}): přepnutí zavolá most (nastav true)`, await dokud(async () => JSON.stringify(await p.evaluate(() => window.__zamek ?? [])) === '[true]', 3000) && (await prepinac.getAttribute('aria-checked')) === 'true');
  zamek.push(1);
  tvrdi(`B5 (${vp.width}): nic nepřetéká`, !(await pretece(p)));
  await karta.scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${SNIMKY}k90-zabezpeceni-${vp.width}.png`, fullPage: true });
  tvrdi(`B5 (${vp.width}): bez chyb v konzoli`, skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}
{
  const { ctx, p } = await kontext({ viewport: TEL, mobil: true, dalsi: (req, json) => (new URL(req.url()).pathname === '/api/account/overeni-emailu' ? json({ stav: 'nenabizi', email: null }) : undefined) });
  await jdi(p, BASE + '/employer/overview?view=settings&tab=security');
  await dokud(() => p.getByRole('heading', { name: 'Změna hesla' }).isVisible(), 12000);
  await p.waitForTimeout(800);
  tvrdi('B5: na webu bez obalu žádný zámek, bez Resendu žádné ověření', (await p.getByRole('switch', { name: 'Zamykat aplikaci Face ID / otiskem' }).count()) === 0 && (await p.getByText('Ověření e-mailu').count()) === 0);
  await ctx.close();
}

// ---------------------------------------------------------------------------
console.log('B6 Tým → Tablet');
for (const [vp, mobil] of [[TEL, true], [PC, false]]) {
  const patche = [];
  const { ctx, p, chyby } = await kontext({ viewport: vp, mobil, dalsi: (req, json) => {
    const path = new URL(req.url()).pathname;
    if (path === '/api/kiosk' && req.method() === 'GET') return json({ kiosk: { id: 17, email: 'tablet@kavarna.cz' } });
    if (path === '/api/kiosk' && req.method() === 'PATCH') { patche.push(req.postDataJSON()); return json({ ok: true }); }
    if (path === '/api/attendance' && req.method() === 'GET') return json({ roster: [
      { id: 16, name: 'Eva Testová', avatar: '👩', hasPin: true, pinDelka: 4, pinKratky: true, openSince: null },
      { id: 18, name: 'Petr Novák', avatar: '🧑‍🍳', hasPin: true, pinDelka: 6, pinKratky: false, openSince: null },
      { id: 19, name: 'Lucie Černá', avatar: '👩‍🦰', hasPin: false, openSince: null },
    ], entries: [] });
    return undefined;
  } });
  await jdi(p, BASE + '/employer/overview?view=team-settings');
  const tablist = p.getByRole('tablist', { name: 'Sekce nastavení týmu' });
  await dokud(() => tablist.isVisible().catch(() => false), 12000);
  await tablist.getByRole('tab', { name: 'Tablet' }).click();
  await p.getByRole('button', { name: /Tabletový účet/ }).click();
  const eva = p.locator('li', { hasText: 'Eva Testová' }).last();
  tvrdi(`B6 (${vp.width}): u 4místného PINu „Doporučujeme změnit PIN na 6 číslic"`, await dokud(() => eva.getByText('Doporučujeme změnit PIN na 6 číslic.').isVisible(), 6000));
  tvrdi(`B6 (${vp.width}): 6místný PIN doporučení nemá`, (await p.locator('li', { hasText: 'Petr Novák' }).last().getByText('Doporučujeme').count()) === 0);
  const pole = eva.getByRole('textbox', { name: 'PIN pro Eva Testová' });
  tvrdi(`B6 (${vp.width}): pole PINu má číselnou klávesnici a max 6 znaků`, (await pole.getAttribute('inputmode')) === 'numeric' && (await pole.getAttribute('maxlength')) === '6');
  await pole.fill('1234');
  await eva.getByRole('button', { name: 'Uložit' }).click();
  tvrdi(`B6 (${vp.width}): 4 číslice se neuloží a řekne se proč`, await dokud(() => p.getByText('PIN musí mít 6 číslic.').isVisible(), 3000) && patche.length === 0);
  tvrdi(`B6 (${vp.width}): nic nepřetéká`, !(await pretece(p)));
  await eva.scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${SNIMKY}k90-tym-tablet-pin-${vp.width}.png`, fullPage: true });
  await pole.fill('123456');
  await eva.getByRole('button', { name: 'Uložit' }).click();
  tvrdi(`B6 (${vp.width}): 6 číslic odejde`, await dokud(() => patche.length === 1 && patche[0].pin === '123456' && patche[0].userId === 16, 3000), JSON.stringify(patche));
  // Obecná fixtura teams.json má id 17 dvakrát (známé, viz k69-b9) — to není předmětem bloku.
  const chybyB6 = skutecneChyby(chyby).filter(c => !/two children with the same key/.test(c));
  tvrdi(`B6 (${vp.width}): bez chyb v konzoli`, chybyB6.length === 0, chybyB6.slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
}
console.log('B7 Tablet: PIN');
{
  const posty = [];
  const KIOSK = roleMine('kiosk');
  const fixSmena = (await import('./k68-spolecne.mjs')).fixtura('k69-b9-rozlozeni-smena');
  const { ctx, p, chyby } = await kontext({ role: 'kiosk', viewport: TABLET, mobil: true, fix: fixSmena, mineData: KIOSK, dalsi: (req, json) => {
    const path = new URL(req.url()).pathname;
    if (path === '/api/attendance' && req.method() === 'GET') return json({ roster: [
      { id: 8, name: 'Lucie Černá', avatar: '👩‍🦰', hasPin: true, pinDelka: 6, openSince: null, openEntryId: null, breakSince: null, shiftStart: null, shiftEnd: null },
    ], entries: [] });
    if (path === '/api/attendance' && req.method() === 'POST') { posty.push(req.postDataJSON()); return json({ error: 'Nesprávný PIN' }, 403); }
    if (path === '/api/procedures/runs' && req.method() === 'GET') return json({ runs: [] });
    return undefined;
  } });
  await ctx.addInitScript(() => { try { localStorage.removeItem('managero-kiosk-fronta'); localStorage.removeItem('managero-kiosk-active'); } catch { /* */ } });
  await jdi(p, BASE + '/kiosk');
  await p.locator('[data-plocha="kiosk.smena"] li[data-instance]:not([hidden])').first().waitFor({ timeout: 15000 });
  await p.waitForTimeout(900);
  // Nikdo na směně → „Jsem na směně" otevře výběr lidí.
  await p.getByRole('button', { name: 'Jsem na směně' }).click();
  await p.getByRole('button', { name: /Lucie Černá/ }).first().click();
  const okno = p.getByRole('dialog', { name: 'Lucie Černá' });
  await dokud(() => okno.isVisible(), 4000);
  tvrdi('B7: šest teček pro 6místný PIN', (await okno.locator('[role="img"][aria-label^="Zadáno číslic"] > span').count()) === 6);
  const potvrdit = okno.getByRole('button', { name: 'Odpíchnout příchod' });
  for (const k of ['1', '2', '3', '4']) await okno.getByRole('button', { name: k, exact: true }).click();
  tvrdi('B7: se 4 číslicemi (PIN má 6) příchod zamčený', await potvrdit.isDisabled());
  for (let pokus = 0; pokus < 5; pokus++) {
    while ((await okno.locator('[role="img"][aria-label^="Zadáno číslic"]').getAttribute('aria-label')) !== 'Zadáno číslic: 6') {
      await okno.getByRole('button', { name: '9', exact: true }).click();
    }
    await potvrdit.click();
    await dokud(() => posty.length === pokus + 1, 3000);
    await p.waitForTimeout(150);
  }
  const pauza = okno.getByText(/Moc špatných PINů\. Zkus to za \d+ s\./);
  tvrdi('B7: po pátém špatném PINu „Moc špatných PINů. Zkus to za N s." a příchod zamčený', await dokud(() => pauza.isVisible(), 3000) && await potvrdit.isDisabled(), await okno.innerText());
  await p.screenshot({ path: `${SNIMKY}k90-tablet-pin-pauza.png` });
  tvrdi('B7: rozložení tabletu bez přetečení', !(await pretece(p)));
  tvrdi('B7: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

await konec();
