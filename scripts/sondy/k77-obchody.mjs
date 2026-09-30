// Kolo 77 — aplikace pro obchody (App Store, Google Play): brána obalu, platby,
// smazání účtu, právní stránky, reset hesla, moderace a telefon 390.
//
// Sonda nezávisí na denní době ani na databázi: server běží bez dosažitelné DB,
// API podvrhuje prohlížeč (fixtury), relaci razí cookie podle NEXTAUTH_SECRET.
//  O1 Brána podle User-Agentu: ManageroClient smí /client, /employer ne; ManageroApp smí
//     /employer, /client ne; hostovské API z provozu a provozní API z hosta jsou 404.
//  O2 Značka jen zužuje: běžný prohlížeč (bez značky) prochází všude; falešná značka
//     nic neodemkne (jen něco zavře).
//  O3 Platby: /api/billing/{checkout,portal,upgrade} z obou obalů 403, na webu ne;
//     v obalu není cena, Stripe, „Předplatné“, „Odemknout“ ani prodejní stránka;
//     na webu prodejní stránka a volba tarifu zůstávají.
//  O4 Právní stránky bez přihlášení (cs i en), z obou aplikací; smazání účtu z webu
//     (formulář požádá o e-mail, nic nesmaže sám).
//  O5 Smazání účtu hosta od začátku do konce (tlačítko, heslo, DELETE, odhlášení)
//     a vlastníka podniku (409 → potvrzení SMAZAT → druhý DELETE s volbou podniku).
//  O6 Reset hesla: žádost (stejná odpověď), nové heslo s tokenem, krátké heslo.
//  O7 Moderace: nahlášení a blokace zprávy v chatu, přehled vedení s akcemi.
//  O8 Souhlas s novinkami podniků: při registraci výchozí NE, v profilu jde zapnout a vypnout.
//  O9 .well-known: AASA a assetlinks jako application/json bez přesměrování.
//  O10 Telefon 390: bez vodorovného přetečení na nových stránkách, max. jedna plná limetka.
//  O11 Tmavý režim: právní stránky jsou čitelné.
import { readFileSync, existsSync } from 'node:fs';
import { browser, tvrdi, konec, BASE, DIR, tokenPro, fixtura, VLASTNIK } from './k68-spolecne.mjs';

const UA_ZAKLAD = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const UA_PROVOZ = `${UA_ZAKLAD} ManageroApp/1.0.0 (build 1)`;
const UA_KLIENT = `${UA_ZAKLAD} ManageroClient/1.0.0 (build 1)`;
const UA_WEB = `${UA_ZAKLAD} Safari/604.1`;
const HOST = new URL(BASE).host;

const have = new Set((await import('node:fs')).readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
const klic = (u2) => { const u = new URL(u2); const p = u.pathname.replace(/^\/api\//, '');
  const wq = (p + (u.search || '')).replace(/[?/=&]/g, '_'); if (have.has(wq)) return wq;
  const bare = p.replace(/[/]/g, '_'); return have.has(bare) ? bare : null; };

/** HTTP dotaz bez prohlížeče: bez sledování přesměrování, s vlastním UA a případně relací. */
async function http(cesta, { ua = UA_WEB, metoda = 'GET', role = null, telo = null } = {}) {
  const hlavicky = { 'user-agent': ua };
  if (role) hlavicky.cookie = `next-auth.session-token=${tokenPro(role)}`;
  if (metoda !== 'GET') { hlavicky.origin = BASE; hlavicky['content-type'] = 'application/json'; }
  const r = await fetch(BASE + cesta, { method: metoda, headers: hlavicky, redirect: 'manual', body: telo });
  return { status: r.status, kam: r.headers.get('location'), typ: r.headers.get('content-type') ?? '', text: metoda === 'GET' || r.status >= 400 ? await r.text() : '' };
}
const kamPath = (loc) => (loc ? new URL(loc, BASE).pathname : null);

// ---------------------------------------------------------------------------
// O1 + O2: brána podle User-Agentu
// ---------------------------------------------------------------------------
console.log('O1 Brána podle User-Agentu');
{
  const c = (cesta, o = {}) => http(cesta, { ua: UA_KLIENT, ...o });
  const m = (cesta, o = {}) => http(cesta, { ua: UA_PROVOZ, ...o });
  let r = await c('/client');
  tvrdi('host: /client projde', r.status === 200, `${r.status}`);
  r = await c('/client/login');
  tvrdi('host: /client/login projde', r.status === 200, `${r.status}`);
  r = await c('/employer/overview', { role: 'employer' });
  tvrdi('host: /employer se nepustí ani s relací vedení (přesměrování na /client)', [307, 308].includes(r.status) && kamPath(r.kam) === '/client', `${r.status} ${r.kam}`);
  r = await c('/employee/shifts', { role: 'employee' });
  tvrdi('host: /employee se nepustí', [307, 308].includes(r.status) && kamPath(r.kam) === '/client', `${r.status} ${r.kam}`);
  r = await c('/kiosk', { role: 'kiosk' });
  tvrdi('host: /kiosk se nepustí', [307, 308].includes(r.status) && kamPath(r.kam) === '/client', `${r.status} ${r.kam}`);
  r = await c('/');
  tvrdi('host: úvodní stránka (ceny) se nepustí, vede na /client', [307, 308].includes(r.status) && kamPath(r.kam) === '/client', `${r.status} ${r.kam}`);
  r = await c('/login');
  tvrdi('host: přihlášení provozu vede na přihlášení hosta', [307, 308].includes(r.status) && kamPath(r.kam) === '/client/login', `${r.status} ${r.kam}`);
  r = await c('/api/client/admin/summary', { role: 'employer' });
  tvrdi('host: správa klienta (API) je 404', r.status === 404, `${r.status}`);
  r = await c('/api/client/staff/inbox', { role: 'employer' });
  tvrdi('host: obsluha (API) je 404', r.status === 404, `${r.status}`);
  r = await c('/api/inventory', { role: 'employer' });
  tvrdi('host: sklad (API) je 404, neprozradí, že existuje', r.status === 404, `${r.status}`);
  r = await c('/api/client/businesses');
  tvrdi('host: adresář podniků (API) projde bránou', r.status !== 404 && r.status !== 403, `${r.status}`);

  r = await m('/employer/overview', { role: 'employer' });
  tvrdi('provoz: /employer projde (200)', r.status === 200, `${r.status} ${r.kam ?? ''}`);
  r = await m('/client');
  tvrdi('provoz: /client se nepustí (přesměrování na úvod)', [307, 308].includes(r.status) && kamPath(r.kam) === '/', `${r.status} ${r.kam}`);
  r = await m('/client/cafe-demo');
  tvrdi('provoz: stránka podniku pro hosty se nepustí', [307, 308].includes(r.status), `${r.status}`);
  r = await m('/api/client/me', { role: 'customer' });
  tvrdi('provoz: hostovské API je 404', r.status === 404, `${r.status}`);
  r = await m('/api/client/b/cafe-demo');
  tvrdi('provoz: profil podniku pro hosty (API) je 404', r.status === 404, `${r.status}`);
  r = await m('/api/client/admin/summary', { role: 'employer' });
  tvrdi('provoz: správa klienta (API) projde bránou', r.status !== 404 || !/Nenalezeno/.test(r.text), `${r.status}`);
  r = await m('/login');
  tvrdi('provoz: přihlášení projde', r.status === 200, `${r.status}`);

  console.log('O2 Značka jen zužuje');
  for (const cesta of ['/client', '/login', '/register', '/employer/overview', '/soukromi']) {
    const w = await http(cesta, { ua: UA_WEB, role: cesta === '/employer/overview' ? 'employer' : null });
    tvrdi(`web: ${cesta} brána nezasahuje (${w.status})`, w.status === 200, `${w.status} ${w.kam ?? ''}`);
  }
  r = await http('/api/client/admin/summary', { ua: UA_WEB, role: 'employer' });
  tvrdi('web: správa klienta (API) bránou neodmítnutá', r.status !== 404 || !/Nenalezeno/.test(r.text), `${r.status}`);
  // Falešná značka nikomu nic nepřidá: host s podvrženou značkou provozu nedostane /employer.
  r = await m('/employer/overview', { role: 'customer' });
  tvrdi('falešná značka provozu neodemkne /employer hostovi (relace rozhoduje, stránka vedení se nevykreslí)', r.status !== 200, `${r.status}`);
}

// ---------------------------------------------------------------------------
// O3: platby
// ---------------------------------------------------------------------------
console.log('O3 Platby');
{
  for (const cesta of ['/api/billing/checkout', '/api/billing/portal', '/api/billing/upgrade']) {
    for (const [popis, ua] of [['provoz', UA_PROVOZ], ['host', UA_KLIENT]]) {
      const r = await http(cesta, { ua, metoda: 'POST', role: 'employer', telo: '{}' });
      let json = {}; try { json = JSON.parse(r.text); } catch { /* ne JSON */ }
      tvrdi(`${cesta} z aplikace (${popis}) je 403 s českou hláškou`, r.status === 403 && /nespravuje/.test(String(json.error)), `${r.status} ${r.text.slice(0, 80)}`);
    }
    const w = await http(cesta, { ua: UA_WEB, metoda: 'POST', role: 'employer', telo: '{}' });
    tvrdi(`${cesta} z webu bránou obalu neprojde odmítnutím (${w.status})`, !(w.status === 403 && /nespravuje/.test(w.text)), `${w.status}`);
  }

  const b = await browser();
  const kontext = async (ua, role = null, viewport = { width: 390, height: 844 }) => {
    const ctx = await b.newContext({ userAgent: ua, viewport, locale: 'cs-CZ', isMobile: true, hasTouch: true });
    if (role) await ctx.addCookies([{ name: 'next-auth.session-token', value: tokenPro(role), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
    await ctx.route('**/api/**', async route => {
      const u = route.request().url(); const m = route.request().method();
      if (u.includes('/api/auth/')) return route.continue();
      const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      const path = new URL(u).pathname;
      if (path === '/api/teams/mine') return json(VLASTNIK);
      if (path === '/api/billing/status') return json({ configured: true, plan: { plan: 'pro' }, prices: { pro: { month: 149 } }, referral: { link: 'x' } });
      if (m !== 'GET') return json({ ok: true });
      const k = klic(u);
      if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
      return json({});
    });
    const p = await ctx.newPage();
    const chyby = [];
    p.on('pageerror', e => chyby.push(String(e).slice(0, 200)));
    return { ctx, p, chyby };
  };
  const text = async (p) => (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  const ZAKAZANO = /Kč|Stripe|Ceník|Předplatné|Odemknout|Vyzkoušet zdarma|Tarif na začátek|\/ měsíc|za měsíc/;

  // Úvodní stránka: v obalu provozu se neukáže prodejní stránka, ale přihlášení.
  {
    const { ctx, p } = await kontext(UA_PROVOZ);
    await p.goto(BASE + '/', { waitUntil: 'networkidle' });
    tvrdi('provoz: úvodní stránka končí na přihlášení, ne na prodejní stránce', p.url().endsWith('/login'), p.url());
    tvrdi('provoz: přihlášení bez ceny a bez Stripe', !ZAKAZANO.test(await text(p)), (await text(p)).slice(0, 120));
    tvrdi('provoz: přihlášení má Zapomenuté heslo a právní odkazy', await p.getByRole('link', { name: 'Zapomenuté heslo' }).count() === 1 && await p.getByRole('link', { name: 'Zásady ochrany osobních údajů' }).count() === 1 && await p.getByRole('link', { name: 'Podmínky užívání' }).count() === 1);
    await p.goto(BASE + '/register', { waitUntil: 'networkidle' });
    const t = await text(p);
    tvrdi('provoz: registrace bez volby tarifu a bez cen', !ZAKAZANO.test(t) && await p.getByText('Tarif na začátek').count() === 0, t.slice(0, 160));
    tvrdi('provoz: registrace odkazuje na podmínky a zásady', /Podmínkami užívání/.test(t) && /Zásady ochrany osobních údajů/.test(t));
    await ctx.close();
  }
  // Web: prodejní stránka a tarif v registraci zůstávají.
  {
    const { ctx, p } = await kontext(UA_WEB);
    await p.goto(BASE + '/', { waitUntil: 'networkidle' });
    tvrdi('web: úvodní stránka s ceníkem zůstává', /Ceník/.test(await text(p)));
    tvrdi('web: patička prodejní stránky má právní odkazy', await p.getByRole('link', { name: 'Zásady ochrany osobních údajů' }).count() >= 1);
    await p.goto(BASE + '/register', { waitUntil: 'networkidle' });
    tvrdi('web: registrace nabízí volbu tarifu', await p.getByText('Tarif na začátek').count() === 1);
    await ctx.close();
  }
  // Nastavení vedení v obalu: bez předplatného; na webu s ním.
  for (const [popis, ua, ma] of [['provoz', UA_PROVOZ, false], ['web', UA_WEB, true]]) {
    const { ctx, p } = await kontext(ua, 'employer', { width: 1280, height: 950 });
    await p.goto(BASE + '/employer/overview?view=settings', { waitUntil: 'networkidle' });
    await p.getByText('Zabezpečení').first().waitFor({ timeout: 15000 });
    const t = await text(p);
    tvrdi(`nastavení (${popis}): položka Předplatné ${ma ? 'je' : 'není'}`, /Předplatné/.test(t) === ma, t.slice(0, 200));
    if (!ma) tvrdi('nastavení (provoz): žádná cena a Stripe', !ZAKAZANO.test(t), t.slice(0, 200));
    await ctx.close();
  }
  // Hostovská aplikace: žádná prodejní stránka ani Stripe, „Jsem podnik“ bez odkazu.
  {
    const { ctx, p } = await kontext(UA_KLIENT);
    await p.goto(BASE + '/client', { waitUntil: 'networkidle' });
    const t = await text(p);
    tvrdi('host: /client bez ceny, Stripe a odkazu na prodejní stránku', !ZAKAZANO.test(t) && await p.locator('a[href="/"]').count() === 0, t.slice(0, 160));
    tvrdi('host: patička nemá „Jsem podnik“ jako odkaz, má právní odkazy', await p.getByRole('link', { name: 'Jsem podnik' }).count() === 0 && await p.getByRole('link', { name: 'Podpora' }).count() >= 1);
    await ctx.close();
    const w = await kontext(UA_WEB);
    await w.p.goto(BASE + '/client', { waitUntil: 'networkidle' });
    tvrdi('web: /client má odkaz „Jsem podnik“ dál', await w.p.getByRole('link', { name: 'Jsem podnik' }).count() === 1);
    await w.ctx.close();
  }
}

// ---------------------------------------------------------------------------
// O4: právní stránky a smazání účtu z webu
// ---------------------------------------------------------------------------
console.log('O4 Právní stránky');
{
  for (const [cesta, vyraz] of [['/soukromi', /Zásady ochrany osobních údajů/], ['/podminky', /Podmínky užívání/], ['/podpora', /Podpora/], ['/smazat-ucet', /Smazání účtu a dat/],
    ['/en/soukromi', /Privacy policy/], ['/en/podminky', /Terms of use/], ['/en/podpora', /Support/], ['/en/smazat-ucet', /Delete your account/]]) {
    for (const [popis, ua] of [['web', UA_WEB], ['provoz', UA_PROVOZ], ['host', UA_KLIENT]]) {
      const r = await http(cesta, { ua });
      tvrdi(`${cesta} (${popis}) bez přihlášení: 200 a obsah`, r.status === 200 && vyraz.test(r.text), `${r.status} ${r.kam ?? ''}`);
    }
  }
  const r = await http('/soukromi', { ua: UA_WEB });
  tvrdi('soukromí: zná zpracovatele a neslibuje vymyšlenou firmu (zástupná pole nebo hodnoty z prostředí)', /Neon/.test(r.text) && /Resend/.test(r.text) && (/\{\{NAZEV_FIRMY\}\}/.test(r.text) || !/\{\{/.test(r.text)));
  tvrdi('soukromí: bez vyplněné firmy stránka viditelně varuje', /\{\{NAZEV_FIRMY\}\}/.test(r.text) ? /právník/.test(r.text) : true);

  const b = await browser();
  const ctx = await b.newContext({ userAgent: UA_KLIENT, viewport: { width: 390, height: 844 }, locale: 'cs-CZ', isMobile: true, hasTouch: true });
  const zadosti = [];
  await ctx.route('**/api/account/delete-request', async route => { zadosti.push(JSON.parse(route.request().postData() || '{}')); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, message: 'Pokud je e-mail v aplikaci, poslali jsme na něj odkaz pro potvrzení smazání.' }) }); });
  const p = await ctx.newPage();
  await p.goto(BASE + '/smazat-ucet', { waitUntil: 'networkidle' });
  await p.getByLabel('E-mail účtu').fill('host@priklad.cz');
  await p.getByRole('button', { name: 'Poslat odkaz pro potvrzení' }).click();
  await p.locator('p[role=status].note').waitFor({ timeout: 5000 });
  tvrdi('smazání z webu: žádost o e-mail s potvrzením (nic se nesmaže sama)', zadosti.length === 1 && zadosti[0].email === 'host@priklad.cz' && /poslali jsme na něj odkaz/.test(await p.locator('p[role=status].note').innerText()));
  await p.goto(BASE + '/smazat-ucet/potvrdit?token=' + 'a'.repeat(43), { waitUntil: 'networkidle' });
  tvrdi('potvrzení smazání: stránka jen nabídne tlačítko (otevření odkazu nemaže)', await p.getByRole('button', { name: 'Ano, smazat účet' }).count() === 1);
  await p.goto(BASE + '/smazat-ucet/potvrdit?token=kratke', { waitUntil: 'networkidle' });
  tvrdi('potvrzení smazání: neplatný odkaz se vysvětlí', /Odkaz nefunguje/.test(await p.evaluate(() => document.body.innerText)));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// O5: smazání účtu od začátku do konce
// ---------------------------------------------------------------------------
console.log('O5 Smazání účtu');
{
  const b = await browser();
  async function ucet(role, ua, cesta, odpovedi) {
    const ctx = await b.newContext({ userAgent: ua, viewport: { width: 390, height: 844 }, locale: 'cs-CZ', isMobile: true, hasTouch: true });
    await ctx.addCookies([{ name: 'next-auth.session-token', value: tokenPro(role), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
    const smazani = [];
    await ctx.route('**/api/**', async route => {
      const u = route.request().url(); const m = route.request().method(); const path = new URL(u).pathname;
      if (u.includes('/api/auth/')) return route.continue();
      const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (path === '/api/account' && m === 'DELETE') { smazani.push(JSON.parse(route.request().postData() || '{}')); const o = odpovedi.shift(); return json(o.body, o.status); }
      if (path === '/api/teams/mine') return json(VLASTNIK);
      if (path === '/api/account' && m === 'GET') return json({ user: { id: 15, name: 'Martin', email: 'm@x.cz', role: 'employer', notifPrefs: {} } });
      if (m !== 'GET') return json({ ok: true });
      const k = klic(u);
      if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
      return json({});
    });
    const p = await ctx.newPage();
    await p.goto(BASE + cesta, { waitUntil: 'networkidle' });
    return { ctx, p, smazani };
  }

  // Host: Profil → Smazat účet → heslo → DELETE → odhlášení na /client.
  {
    const { ctx, p, smazani } = await ucet('customer', UA_KLIENT, '/client/me', [{ status: 200, body: { ok: true, smazanePodniky: 0 } }]);
    await p.locator('#ucet').scrollIntoViewIfNeeded();
    await p.getByRole('button', { name: 'Smazat účet' }).first().click();
    const okno = p.getByRole('dialog');
    tvrdi('host: smazání účtu se potvrzuje oknem s heslem', await okno.count() === 1 && await okno.getByLabel('Heslo').count() === 1);
    tvrdi('host: tlačítko potvrzení je bez hesla zamčené', await okno.getByRole('button', { name: 'Smazat účet' }).isDisabled());
    await okno.getByLabel('Heslo').fill('Moje-Heslo-123');
    await okno.getByRole('button', { name: 'Smazat účet' }).click();
    await p.waitForURL(/\/client\/?$/, { timeout: 15000 });
    tvrdi('host: DELETE /api/account odešel s heslem (a bez volby podniku)', smazani.length === 1 && smazani[0].password === 'Moje-Heslo-123' && !('smazatPodnik' in smazani[0]), JSON.stringify(smazani));
    const sezeni = (await ctx.cookies()).filter(c => /session-token/.test(c.name) && c.value);
    tvrdi('host: po smazání je odhlášený (cookie relace pryč) a je na /client', sezeni.length === 0 && /\/client\/?$/.test(p.url()), `${sezeni.length} ${p.url()}`);
    await ctx.close();
  }
  // Špatné heslo: okno zůstane a řekne proč.
  {
    const { ctx, p, smazani } = await ucet('customer', UA_KLIENT, '/client/me', [{ status: 400, body: { error: 'Heslo není správné.' } }]);
    await p.getByRole('button', { name: 'Smazat účet' }).first().click();
    const okno = p.getByRole('dialog');
    await okno.getByLabel('Heslo').fill('spatne-heslo-1');
    await okno.getByRole('button', { name: 'Smazat účet' }).click();
    await okno.getByRole('alert').waitFor({ timeout: 5000 });
    tvrdi('špatné heslo: okno zůstane, ukáže chybu a účet se nesmaže', /Heslo není správné/.test(await okno.innerText()) && smazani.length === 1 && /\/client\/me/.test(p.url()));
    await ctx.close();
  }
  // Vlastník podniku s dalšími členy: 409 → vysvětlení → SMAZAT → druhý DELETE s volbou podniku.
  {
    const { ctx, p, smazani } = await ucet('employer', UA_PROVOZ, '/employer/overview?view=settings&tab=security', [
      { status: 409, body: { kod: 'VLASTNIK_S_CLENY', error: 'V podniku „Kavárna“ jsou další lidé. Nejdřív předejte vedení, nebo smažte celý podnik i s účtem.' } },
      { status: 200, body: { ok: true, smazanePodniky: 1 } },
    ]);
    await p.getByRole('button', { name: 'Smazat účet' }).first().click();
    const okno = p.getByRole('dialog');
    await okno.getByLabel('Heslo').fill('Moje-Heslo-123');
    await okno.getByRole('button', { name: 'Smazat účet' }).click();
    await okno.getByText('Napište SMAZAT').waitFor({ timeout: 5000 });
    tvrdi('vlastník: server vysvětlí, že podnik má další členy, a chce potvrzení', /další lidé/.test(await okno.innerText()) && smazani.length === 1 && !('smazatPodnik' in smazani[0]));
    tvrdi('vlastník: bez slova SMAZAT je potvrzení zamčené', await okno.getByRole('button', { name: 'Smazat podnik i účet' }).isDisabled());
    await okno.getByLabel('Napište SMAZAT').fill('SMAZAT');
    await okno.getByRole('button', { name: 'Smazat podnik i účet' }).click();
    await p.waitForURL(/\/login/, { timeout: 15000 });
    tvrdi('vlastník: druhý DELETE nese volbu podniku a potvrzení, pak odhlášení na přihlášení', smazani.length === 2 && smazani[1].smazatPodnik === true && smazani[1].potvrzeni === 'SMAZAT', JSON.stringify(smazani));
    await ctx.close();
  }
}

// ---------------------------------------------------------------------------
// O6 + O8: reset hesla a souhlas s novinkami
// ---------------------------------------------------------------------------
console.log('O6 Reset hesla a O8 souhlas s novinkami');
{
  const b = await browser();
  const ctx = await b.newContext({ userAgent: UA_KLIENT, viewport: { width: 390, height: 844 }, locale: 'cs-CZ', isMobile: true, hasTouch: true });
  const vola = [];
  await ctx.route('**/api/**', async route => {
    const u = route.request().url(); const m = route.request().method(); const path = new URL(u).pathname;
    if (u.includes('/api/auth/')) return route.continue();
    const telo = route.request().postData();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (m !== 'GET') vola.push({ path, telo: telo ? JSON.parse(telo) : null });
    if (path === '/api/account/heslo') return json({ ok: true, message: 'Pokud je e-mail v aplikaci, poslali jsme na něj odkaz pro nové heslo.' });
    if (path === '/api/account/heslo/obnovit') return json({ ok: true, role: 'customer' });
    if (path === '/api/client/register') return json({ ok: true, user: { id: 1 } });
    if (m !== 'GET') return json({ ok: true });
    return json({});
  });
  const p = await ctx.newPage();
  await p.goto(BASE + '/client/login', { waitUntil: 'networkidle' });
  tvrdi('přihlášení hosta nabízí Zapomenuté heslo', await p.getByRole('link', { name: 'Zapomenuté heslo' }).count() === 1);
  await p.getByRole('link', { name: 'Zapomenuté heslo' }).click();
  await p.waitForURL(/zapomenute-heslo/);
  await p.getByLabel('E-mail').fill('host@priklad.cz');
  await p.getByRole('button', { name: 'Poslat odkaz' }).click();
  await p.locator('p[role=status].note').waitFor({ timeout: 5000 });
  tvrdi('reset: žádost odešla a odpověď je obecná (neříká, jestli účet existuje)', vola.some(v => v.path === '/api/account/heslo' && v.telo.email === 'host@priklad.cz') && /Pokud je e-mail v aplikaci/.test(await p.locator('p[role=status].note').innerText()));
  const token = 'Abc123_-'.repeat(6).slice(0, 43);
  await p.goto(BASE + '/client/nove-heslo?token=' + token, { waitUntil: 'networkidle' });
  await p.getByLabel('Nové heslo').fill('krat');
  await p.getByRole('button', { name: 'Nastavit heslo' }).click();
  tvrdi('reset: krátké heslo se odmítne ještě před odesláním', /alespoň 8 znaků/.test(await p.locator('p[role=alert]').innerText()) && !vola.some(v => v.path === '/api/account/heslo/obnovit'));
  await p.getByLabel('Nové heslo').fill('Nove-Heslo-123');
  await p.getByRole('button', { name: 'Nastavit heslo' }).click();
  await p.getByText('Heslo je změněné').waitFor({ timeout: 5000 });
  const o = vola.find(v => v.path === '/api/account/heslo/obnovit');
  tvrdi('reset: nové heslo odešlo s tokenem a nabídne přihlášení', o?.telo.token === token && o.telo.password === 'Nove-Heslo-123' && await p.getByRole('link', { name: 'Přihlásit se' }).count() === 1);
  await p.goto(BASE + '/client/nove-heslo', { waitUntil: 'networkidle' });
  tvrdi('reset: bez tokenu stránka vysvětlí, že odkaz nefunguje', /Odkaz nefunguje/.test(await p.evaluate(() => document.body.innerText)));
  await p.goto(BASE + '/zapomenute-heslo', { waitUntil: 'networkidle' });
  tvrdi('reset: provozní varianta v aplikaci hostů vede na variantu hosta', /\/client\/zapomenute-heslo/.test(p.url()), p.url());

  // O8: souhlas s novinkami při registraci je výchozí NE.
  await p.goto(BASE + '/client/register', { waitUntil: 'networkidle' });
  const box = p.getByLabel(/Chci dostávat novinky a akce od podniků/);
  tvrdi('souhlas s novinkami: políčko při registraci existuje a výchozí je NEzaškrtnuto', await box.count() === 1 && !(await box.isChecked()));
  await p.getByLabel('Jméno').fill('Host Test');
  await p.getByLabel('E-mail').fill('host@priklad.cz');
  await p.getByLabel('Heslo', { exact: true }).fill('Dlouhe-Heslo-123');
  await p.getByRole('button', { name: 'Založit účet' }).click();
  await dokudVola(vola, v => v.path === '/api/client/register');
  const reg = vola.find(v => v.path === '/api/client/register');
  tvrdi('souhlas s novinkami: registrace pošle novinky:false a souhlas s podmínkami', reg?.telo.novinky === false && reg.telo.terms === true, JSON.stringify(reg?.telo));
  tvrdi('registrace hosta odkazuje na podmínky a zásady', /Podmínkami užívání/.test(await p.evaluate(() => document.body.innerText)));
  await ctx.close();

  // V profilu jde souhlas zapnout a vypnout (PATCH /api/client/me s novinky).
  const ctx2 = await b.newContext({ userAgent: UA_KLIENT, viewport: { width: 390, height: 844 }, locale: 'cs-CZ', isMobile: true, hasTouch: true });
  await ctx2.addCookies([{ name: 'next-auth.session-token', value: tokenPro('customer'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const patche = [];
  await ctx2.route('**/api/**', async route => {
    const u = route.request().url(); const m = route.request().method(); const path = new URL(u).pathname;
    if (u.includes('/api/auth/')) return route.continue();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/client/me' && m === 'PATCH') { patche.push(JSON.parse(route.request().postData() || '{}')); return json({ ok: true, me: { name: 'x' } }); }
    if (path === '/api/client/me') return json({ ...fixtura('client_me'), me: { id: 18, name: 'Klára', email: 'k@x.cz', novinky: false } });
    if (m !== 'GET') return json({ ok: true });
    const k = klic(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return json({});
  });
  const q = await ctx2.newPage();
  await q.goto(BASE + '/client/me', { waitUntil: 'networkidle' });
  const prepinac = q.getByRole('switch', { name: 'Novinky a akce od podniků' });
  tvrdi('souhlas s novinkami: v profilu je vypnutý, dokud ho host nezapne', await prepinac.count() === 1 && (await prepinac.getAttribute('aria-checked')) === 'false');
  await prepinac.click();
  await dokudVola(patche, () => true);
  await prepinac.click();
  await dokudVola(patche, (v, i) => i >= 1);
  tvrdi('souhlas s novinkami: zapnutí i odhlášení se uloží (novinky true, pak false)', patche[0]?.novinky === true && patche[1]?.novinky === false, JSON.stringify(patche));
  await ctx2.close();
}
/** Počká (nejdéle `ms`), až některý prvek pole splní podmínku; podmínka dostane prvek a jeho pořadí. */
async function dokudVola(pole, podminka, ms = 4000) {
  const konecCasu = Date.now() + ms;
  while (Date.now() < konecCasu) {
    if (pole.some((v, i) => podminka(v, i))) return true;
    await new Promise(r => setTimeout(r, 60));
  }
  return false;
}

// ---------------------------------------------------------------------------
// O7: moderace obsahu
// ---------------------------------------------------------------------------
console.log('O7 Moderace');
{
  const b = await browser();
  const ctx = await b.newContext({ userAgent: UA_PROVOZ, viewport: { width: 1280, height: 900 }, locale: 'cs-CZ' });
  await ctx.addCookies([{ name: 'next-auth.session-token', value: tokenPro('employer'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const vola = [];
  let nahlaseni = [{ id: 9, kind: 'zprava', refId: 2, reason: 'spam', detail: 'reklama', snapshot: 'Kupte si hodinky', status: 'open', createdAt: '2026-09-30T08:00:00Z', reporterName: 'Eva Testová', reportedName: 'Cizí Uživatel' }];
  await ctx.route('**/api/**', async route => {
    const u = route.request().url(); const m = route.request().method(); const path = new URL(u).pathname;
    if (u.includes('/api/auth/')) return route.continue();
    const telo = route.request().postData();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (m !== 'GET') vola.push({ m, path, telo: telo ? JSON.parse(telo) : null });
    if (path === '/api/teams/mine') return json(VLASTNIK);
    if (path === '/api/reports' && m === 'GET') return json({ reports: nahlaseni });
    if (path === '/api/reports/9' && m === 'PATCH') { nahlaseni = nahlaseni.map(n => ({ ...n, status: 'removed' })); return json({ ok: true, status: 'removed' }); }
    if (path === '/api/blocks' && m === 'GET') return json({ blocked: [] });
    if (m !== 'GET') return json({ ok: true });
    const k = klic(u);
    if (k && existsSync(DIR + k + '.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(DIR + k + '.json', 'utf8') });
    return json({});
  });
  const p = await ctx.newPage();
  // Chat: nahlásit, zablokovat a smazat zprávu.
  await p.goto(BASE + '/employer/overview?view=chat', { waitUntil: 'networkidle' });
  await p.getByText('Týmový chat').first().click();
  await p.getByText('Super. Mám ráno objednat').waitFor({ timeout: 10000 });
  const zprava = p.locator('div.group', { hasText: 'Super. Mám ráno objednat' }).first();
  await zprava.getByRole('button', { name: 'Akce se zprávou' }).click();
  await p.getByRole('menuitem', { name: 'Nahlásit zprávu' }).click();
  const okno = p.getByRole('dialog');
  tvrdi('chat: Nahlásit otevře okno s důvody, potvrzení je bez důvodu zamčené', await okno.getByRole('radio').count() === 5 && await okno.getByRole('button', { name: 'Nahlásit' }).isDisabled());
  await okno.getByLabel('Spam nebo reklama').check();
  await okno.getByRole('button', { name: 'Nahlásit' }).click();
  await p.getByText('nahlášení uvidí vedení').waitFor({ timeout: 5000 }).catch(() => {});
  const rep = vola.find(v => v.path === '/api/reports' && v.m === 'POST');
  tvrdi('chat: nahlášení odešlo (druh zpráva, id, důvod)', rep?.telo.kind === 'zprava' && rep.telo.refId === 2 && rep.telo.reason === 'spam', JSON.stringify(rep));
  await zprava.getByRole('button', { name: 'Akce se zprávou' }).click();
  await p.getByRole('menuitem', { name: 'Zablokovat autora' }).click();
  await dokudVola(vola, v => v.path === '/api/blocks');
  // Zpráva zmizí až po překreslení: počkat, ne zkontrolovat hned (na pomalém CI to byl závod).
  await p.getByText('Super. Mám ráno objednat').first().waitFor({ state: 'detached', timeout: 4000 }).catch(() => {});
  tvrdi('chat: blokace autora odešla a jeho zprávy zmizí z vlákna', vola.some(v => v.path === '/api/blocks' && v.m === 'POST' && v.telo.userId === 2) && await p.getByText('Super. Mám ráno objednat').count() === 0);
  const jina = p.locator('div.group', { hasText: 'Zatím ne, počkáme na první závoz.' }).first();
  await jina.getByRole('button', { name: 'Akce se zprávou' }).click();
  await p.getByRole('menuitem', { name: 'Smazat zprávu' }).click();
  await dokudVola(vola, v => v.m === 'DELETE' && /messages\/3$/.test(v.path));
  tvrdi('chat: vedení smaže cizí zprávu (DELETE na zprávu)', vola.some(v => v.m === 'DELETE' && /conversations\/1\/messages\/3$/.test(v.path)));

  // Přehled nahlášených v Nastavení.
  await p.goto(BASE + '/employer/overview?view=settings&tab=nahlaseni', { waitUntil: 'networkidle' });
  await p.getByRole('heading', { name: 'Nahlášený obsah' }).waitFor({ timeout: 10000 });
  tvrdi('nahlášené: vedení vidí opis zprávy, důvod a autora', /Kupte si hodinky/.test(await p.evaluate(() => document.body.innerText)) && /Spam nebo reklama/.test(await p.evaluate(() => document.body.innerText)) && /Cizí Uživatel/.test(await p.evaluate(() => document.body.innerText)));
  await p.getByRole('button', { name: 'Odstranit obsah' }).click();
  await p.getByText('Obsah odstraněn').waitFor({ timeout: 5000 });
  tvrdi('nahlášené: Odstranit obsah odešlo jako akce „odstranit“ a stav se změnil', vola.some(v => v.path === '/api/reports/9' && v.telo.akce === 'odstranit') && await p.getByRole('button', { name: 'Odstranit obsah' }).count() === 0);
  await ctx.close();

  // Zaměstnanec bez práva odebírat členy: přehled nahlášených nevidí.
  const { roleMine } = await import('./k68-spolecne.mjs');
  const ctx2 = await b.newContext({ userAgent: UA_PROVOZ, viewport: { width: 1280, height: 900 }, locale: 'cs-CZ' });
  await ctx2.addCookies([{ name: 'next-auth.session-token', value: tokenPro('employee'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx2.route('**/api/**', async route => {
    const u = route.request().url(); const path = new URL(u).pathname;
    if (u.includes('/api/auth/')) return route.continue();
    if (path === '/api/teams/mine') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(roleMine('barista')) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  const q = await ctx2.newPage();
  await q.goto(BASE + '/employee/shifts?view=settings', { waitUntil: 'networkidle' });
  await q.waitForTimeout(1500);
  tvrdi('zaměstnanec: v Nastavení není Nahlášený obsah', !/Nahlášený obsah/.test(await q.evaluate(() => document.body.innerText)));
  await ctx2.close();
}

// ---------------------------------------------------------------------------
// O9: .well-known
// ---------------------------------------------------------------------------
console.log('O9 .well-known');
{
  const a = await http('/.well-known/apple-app-site-association', { ua: 'Apple-App-Site-Association-Bot' });
  tvrdi('AASA: 200 bez přesměrování, application/json', a.status === 200 && /application\/json/.test(a.typ), `${a.status} ${a.typ}`);
  let j = null; try { j = JSON.parse(a.text); } catch { /* chyba níž */ }
  tvrdi('AASA: platný JSON s oběma aplikacemi a disjunktními cestami', !!j && JSON.stringify(j).includes('app.managero.client') && JSON.stringify(j).includes('app.managero.app'));
  for (const ua of [UA_KLIENT, UA_PROVOZ]) {
    const r = await http('/.well-known/apple-app-site-association', { ua });
    tvrdi('AASA: ani s značkou obalu se nepřesměruje', r.status === 200, `${r.status}`);
  }
  const l = await http('/.well-known/assetlinks.json');
  tvrdi('assetlinks: 200 bez přesměrování, application/json, oba balíčky', l.status === 200 && /application\/json/.test(l.typ) && l.text.includes('app.managero.app') && l.text.includes('app.managero.client'), `${l.status} ${l.typ}`);
}

// ---------------------------------------------------------------------------
// O10 + O11: telefon 390, limetka, tmavý režim
// ---------------------------------------------------------------------------
console.log('O10 Telefon 390 a O11 tmavý režim');
{
  const b = await browser();
  const strany = [
    ['/soukromi', UA_WEB], ['/podminky', UA_WEB], ['/podpora', UA_WEB], ['/smazat-ucet', UA_WEB], ['/en/soukromi', UA_WEB],
    ['/zapomenute-heslo', UA_WEB], ['/client/zapomenute-heslo', UA_KLIENT], ['/client/nove-heslo?token=' + 'a'.repeat(43), UA_KLIENT],
    ['/smazat-ucet/potvrdit?token=' + 'a'.repeat(43), UA_WEB], ['/login', UA_PROVOZ], ['/register', UA_PROVOZ], ['/client/login', UA_KLIENT], ['/client/register', UA_KLIENT],
  ];
  for (const [cesta, ua] of strany) {
    const ctx = await b.newContext({ userAgent: ua, viewport: { width: 390, height: 844 }, locale: 'cs-CZ', isMobile: true, hasTouch: true });
    await ctx.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    const p = await ctx.newPage();
    const chyby = [];
    p.on('pageerror', e => chyby.push(String(e).slice(0, 160)));
    await p.goto(BASE + cesta, { waitUntil: 'networkidle' });
    await p.waitForTimeout(300);
    const m = await p.evaluate(() => ({ sirka: document.documentElement.scrollWidth, okno: window.innerWidth, lime: [...document.querySelectorAll('button, a')].filter(e => { const c = getComputedStyle(e).backgroundColor; return c === 'rgb(200, 245, 66)' && e.getBoundingClientRect().width > 0; }).length }));
    tvrdi(`telefon 390: ${cesta.split('?')[0]} bez vodorovného přetečení`, m.sirka <= m.okno, `${m.sirka} > ${m.okno}`);
    tvrdi(`telefon 390: ${cesta.split('?')[0]} nejvýš jedna plná limetka v obsahu (${m.lime})`, m.lime <= (cesta.startsWith('/client/login') || cesta.startsWith('/client/register') ? 2 : 1), `${m.lime}`);
    tvrdi(`telefon 390: ${cesta.split('?')[0]} bez chyb v konzoli`, chyby.length === 0, chyby.join(' | '));
    await ctx.close();
  }
  // Tmavý režim: právní stránka je čitelná (kontrast textu odstavce proti pozadí ≥ 4,5).
  for (const cesta of ['/soukromi', '/smazat-ucet']) {
    const ctx = await b.newContext({ userAgent: UA_WEB, viewport: { width: 390, height: 844 }, locale: 'cs-CZ' });
    await ctx.addInitScript(() => { try { localStorage.setItem('managero-theme', 'dark'); } catch { /* soukromé okno */ } });
    const p = await ctx.newPage();
    await p.goto(BASE + cesta, { waitUntil: 'networkidle' });
    const k = await p.evaluate(() => {
      const rgb = (s) => (s.match(/[\d.]+/g) || []).slice(0, 4).map(Number);
      const pozadi = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length === 3 || (c.length === 4 && c[3] > 0.5)) return c.slice(0, 3); } return [255, 255, 255]; };
      const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const kontrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
      const out = [];
      for (const sel of ['h1', 'section p', 'li']) {
        const el = document.querySelector(sel); if (!el) continue;
        const c = rgb(getComputedStyle(el).color);
        out.push({ sel, kontrast: Math.round(kontrast(c.slice(0, 3), pozadi(el)) * 10) / 10 });
      }
      return { tmavy: document.documentElement.getAttribute('data-theme') === 'dark', out };
    });
    tvrdi(`tmavý režim: ${cesta} má tmavý motiv a čitelný text (kontrast ≥ 4,5)`, k.tmavy && k.out.length > 0 && k.out.every(o => o.kontrast >= 4.5), JSON.stringify(k));
    await ctx.close();
  }
}

await konec();
