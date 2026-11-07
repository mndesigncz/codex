// Správa platformy na vlastním hostu (admin.managero.app; lokálně admin.localhost).
//
//  S1 Server, host správy (hlavička Host: admin.localhost): bez relace `/` → /prihlaseni, přihlašovací
//     obrazovka bez manifestu a s noindex, robots.txt „Disallow: /", aplikace/manifest/worker/NextAuth 404,
//     admin API bez relace 401, krok 2 bez kroku 1 401, podvržená cookie relace nic neotevře.
//  S2 Server, www (localhost): /admin a podstránky 404 (ne přesměrování, stejná stránka jako jiná neznámá
//     adresa), /api/admin bez tokenu 404, s cizím tokenem 401, přihlášení správy 404.
//  S3 Prohlížeč na http://admin.localhost:<port>: karta přihlášení (světle i tmavě, 390 i 1280), limetka jen
//     na hlavní akci, žádný service worker; e-mail + heslo → QR a klíč (první přihlášení) → kód → `/`;
//     a cesta s již nastaveným TOTP (rovnou kód). API podvrhuje sonda (databáze tu není).
//  S4 Aplikace vedení (telefon, správce): v menu Více už není „Správa platformy".
//
//   SONDY_ZAKLAD=http://localhost:3872 NEXTAUTH_SECRET=… node scripts/sondy/sprava-host.mjs
import http from 'node:http';
import { encode } from 'next-auth/jwt';
import { kontext, konec, tvrdi, dokud, jdi, OUT, BASE, browser } from './k68-spolecne.mjs';

const zaklad = new URL(BASE);
const PORT = zaklad.port || '80';
const ADMIN = `admin.localhost:${PORT}`;
const ADMIN_URL = `http://${ADMIN}`;

/** Požadavek s vlastní hlavičkou Host (fetch ji přepsat nedovolí). */
function ziskej(cesta, { host = zaklad.host, method = 'GET', headers = {}, body } = {}) {
  return new Promise((ok, chyba) => {
    const r = http.request({ host: zaklad.hostname, port: PORT, path: cesta, method, headers: { host, ...headers } }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', c => { data += c; });
      res.on('end', () => ok({ status: res.statusCode, headers: res.headers, body: data }));
    });
    r.on('error', chyba);
    if (body) r.write(body);
    r.end();
  });
}
const json = (b) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });

// ---------------------------------------------------------------------------
console.log('S1 Server, host správy');
{
  const a = await ziskej('/', { host: ADMIN });
  tvrdi('S1: / bez relace → /prihlaseni', [302, 303, 307, 308].includes(a.status) && /^(\/prihlaseni|http:\/\/admin\.localhost:\d+\/prihlaseni)$/.test(a.headers.location ?? ''), `${a.status} ${a.headers.location}`);
  const p = await ziskej('/prihlaseni', { host: ADMIN });
  tvrdi('S1: /prihlaseni 200 s přihlašovací kartou', p.status === 200 && p.body.includes('Správa platformy') && p.body.includes('sprava-email'), String(p.status));
  tvrdi('S1: bez manifestu a instalace na plochu', !/rel="manifest"/.test(p.body) && !/apple-mobile-web-app-capable/.test(p.body));
  tvrdi('S1: noindex v hlavičce i v <meta>', /noindex/.test(String(p.headers['x-robots-tag'])) && /<meta name="robots" content="noindex, nofollow/.test(p.body), String(p.headers['x-robots-tag']));
  tvrdi('S1: <html> nese značku správy (motiv podle systému, žádný worker)', /<html[^>]*data-sprava=""/.test(p.body));
  const r = await ziskej('/robots.txt', { host: ADMIN });
  tvrdi('S1: robots.txt zakazuje všechno', r.status === 200 && /User-agent: \*\s+Disallow: \/\s*$/.test(r.body), r.body);
  for (const cesta of ['/employer/overview', '/login', '/manifest.webmanifest', '/sw.js', '/admin', '/admin/teams/1', '/client', '/sitemap.xml', '/teams/abc']) {
    const x = await ziskej(cesta, { host: ADMIN });
    tvrdi(`S1: ${cesta} na hostu správy 404`, x.status === 404, String(x.status));
  }
  for (const cesta of ['/api/auth/session', '/api/mcp', '/api/schedule']) {
    const x = await ziskej(cesta, { host: ADMIN });
    tvrdi(`S1: ${cesta} na hostu správy 404`, x.status === 404, String(x.status));
  }
  const api = await ziskej('/api/admin/overview', { host: ADMIN });
  tvrdi('S1: admin API bez relace 401', api.status === 401, `${api.status} ${api.body.slice(0, 80)}`);
  const kod = await ziskej('/api/sprava/kod', { host: ADMIN, ...json({ kod: '123456' }) });
  tvrdi('S1: kód bez kroku 1 → 401 „vypršelo"', kod.status === 401 && /vypršelo/.test(kod.body), `${kod.status} ${kod.body}`);
  const podvrh = '__Host-mgr-sprava=v1.15.' + Math.floor(Date.now() / 1000) + '.' + 'A'.repeat(43);
  const f = await ziskej('/', { host: ADMIN, headers: { cookie: podvrh } });
  tvrdi('S1: podvržená cookie relace → zpět na přihlášení', [302, 303, 307, 308].includes(f.status) && /prihlaseni/.test(f.headers.location ?? ''), `${f.status} ${f.headers.location}`);
  const fa = await ziskej('/api/admin/teams', { host: ADMIN, headers: { cookie: podvrh } });
  tvrdi('S1: podvržená cookie relace → admin API 401', fa.status === 401, String(fa.status));
  // Relace aplikace (NextAuth, správce) na hostu správy nic neotevře — správa ji nečte.
  const nextauth = await encode({ token: { sub: '15', email: 'employer@test.cz', role: 'employer', teamId: 1, superadmin: true }, secret: process.env.NEXTAUTH_SECRET });
  const na = await ziskej('/api/admin/overview', { host: ADMIN, headers: { cookie: `next-auth.session-token=${nextauth}` } });
  tvrdi('S1: relace aplikace (i správce) do admin API nevede', na.status === 401, String(na.status));
  const cizi = await ziskej('/api/sprava/prihlaseni', { host: ADMIN, method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://zly.cz' }, body: '{}' });
  tvrdi('S1: přihlášení z cizí stránky (Origin) 403', cizi.status === 403, String(cizi.status));
}

// ---------------------------------------------------------------------------
console.log('S2 Server, www');
{
  const jina = await ziskej('/tahle-adresa-neni');
  for (const cesta of ['/admin', '/admin/teams/1', '/admin/nahlaseni', '/admin/prihlaseni']) {
    const x = await ziskej(cesta);
    tvrdi(`S2: ${cesta} na www 404 bez přesměrování`, x.status === 404 && !x.headers.location, `${x.status} ${x.headers.location ?? ''}`);
    // Adresa sama se v datech stránky objeví u každé 404; hlídá se obsah správy a hlavičky navíc.
    tvrdi(`S2: ${cesta} vypadá jako každá jiná neznámá adresa`, x.body.includes('Tahle stránka tu není') && !/Správa platformy|sprava-email|<html[^>]*data-sprava/.test(x.body) && !x.headers['x-robots-tag'] === !jina.headers['x-robots-tag']);
  }
  // Lomítko na konci Next srovná u každé adresy stejně (308 bez lomítka) — ani tady se /admin neliší.
  const [lomitko, lomitkoJinde] = [await ziskej('/admin/'), await ziskej('/tahle-adresa-neni/')];
  tvrdi('S2: /admin/ se chová jako jiná neznámá adresa s lomítkem', lomitko.status === lomitkoJinde.status && lomitko.headers.location === '/admin' && lomitkoJinde.headers.location === '/tahle-adresa-neni', `${lomitko.status} ${lomitko.headers.location} × ${lomitkoJinde.status} ${lomitkoJinde.headers.location}`);
  const s = await ziskej('/admin', { headers: { cookie: `next-auth.session-token=${await encode({ token: { sub: '15', email: 'employer@test.cz', role: 'employer', teamId: 1, superadmin: true }, secret: process.env.NEXTAUTH_SECRET })}` } });
  tvrdi('S2: /admin 404 i pro přihlášeného správce', s.status === 404 && !s.headers.location, String(s.status));
  const bez = await ziskej('/api/admin/overview');
  tvrdi('S2: /api/admin bez tokenu 404', bez.status === 404, String(bez.status));
  const spatny = await ziskej('/api/admin/overview', { headers: { authorization: 'Bearer ' + 'x'.repeat(40) } });
  tvrdi('S2: /api/admin s cizím tokenem 401 (token ověřuje brána)', spatny.status === 401, String(spatny.status));
  const sp = await ziskej('/api/sprava/prihlaseni', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  tvrdi('S2: přihlášení správy na www 404', sp.status === 404, String(sp.status));
  const mcp = await ziskej('/api/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  tvrdi('S2: MCP bez tokenu 401 (jako dřív)', mcp.status === 401, String(mcp.status));
  const robots = await ziskej('/robots.txt');
  tvrdi('S2: robots.txt na www /admin nezmiňuje', robots.status === 200 && !/admin/.test(robots.body), robots.body.slice(0, 200));
}

// ---------------------------------------------------------------------------
console.log('S3 Přihlášení v prohlížeči');
const QR = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#16181A"/></svg>').toString('base64');
for (const [vp, tmavy] of [[{ width: 390, height: 844 }, false], [{ width: 1280, height: 900 }, false], [{ width: 390, height: 844 }, true]]) {
  for (const nastaveno of [false, true]) {
    const b = await browser();
    const ctx = await b.newContext({ viewport: vp, locale: 'cs-CZ', colorScheme: tmavy ? 'dark' : 'light', isMobile: vp.width < 500, hasTouch: vp.width < 500 });
    const tela = [];
    await ctx.route('**/api/sprava/prihlaseni', r => { tela.push(['heslo', r.request().postDataJSON()]); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(nastaveno ? { krok: 'kod' } : { krok: 'nastaveni', qr: QR, klic: 'ABCD EFGH IJKL MNOP QRST UVWX YZ23 4567', uri: 'otpauth://totp/x' }) }); });
    let pokusu = 0;
    await ctx.route('**/api/sprava/kod', r => {
      tela.push(['kod', r.request().postDataJSON()]);
      pokusu++;
      return pokusu === 1
        ? r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Kód nesedí. Opiš aktuální kód z aplikace.' }) })
        : r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    const p = await ctx.newPage();
    const chyby = [];
    p.on('pageerror', e => chyby.push(String(e)));
    const navigace = [];
    p.on('request', r => { if (r.isNavigationRequest()) navigace.push(new URL(r.url()).pathname); });
    const jmeno = `sprava-prihlaseni-${vp.width}${tmavy ? '-tmave' : ''}${nastaveno ? '-kod' : ''}`;
    await jdi(p, ADMIN_URL + '/', { waitUntil: 'networkidle' });
    tvrdi(`S3 ${jmeno}: / bez relace skončí na /prihlaseni`, new URL(p.url()).pathname === '/prihlaseni', p.url());
    tvrdi(`S3 ${jmeno}: motiv ${tmavy ? 'tmavý' : 'světlý'} podle systému`, (await p.evaluate(() => document.documentElement.getAttribute('data-theme'))) === (tmavy ? 'dark' : 'light'));
    const akce = p.getByRole('button', { name: 'Pokračovat' });
    tvrdi(`S3 ${jmeno}: karta s e-mailem, heslem a jednou limetkovou akcí`, await p.getByLabel('E-mail').isVisible() && await p.getByLabel('Heslo').isVisible() && await akce.isVisible()
      && (await p.evaluate(() => [...document.querySelectorAll('button')].filter(b => getComputedStyle(b).backgroundColor === 'rgb(200, 245, 66)').length)) === 1);
    tvrdi(`S3 ${jmeno}: písmo Geist`, /Geist/i.test(await p.evaluate(() => getComputedStyle(document.body).fontFamily)));
    if (!nastaveno && !tmavy) await p.screenshot({ path: `${OUT}${jmeno}-1.png` });
    if (tmavy && !nastaveno) await p.screenshot({ path: `${OUT}${jmeno}-1.png` });
    await p.getByLabel('E-mail').fill('martin@managero.app');
    await p.getByLabel('Heslo').fill('tajneheslo1');
    await akce.click();
    if (!nastaveno) {
      tvrdi(`S3 ${jmeno}: první přihlášení ukáže QR a klíč k opisu`, await dokud(() => p.getByAltText('QR kód pro autentizační aplikaci').isVisible(), 5000) && await p.getByText('ABCD EFGH IJKL MNOP').isVisible());
      await p.screenshot({ path: `${OUT}${jmeno}-2.png` });
    } else {
      tvrdi(`S3 ${jmeno}: s nastavenou aplikací rovnou kód`, await dokud(() => p.getByLabel('Kód z aplikace').isVisible(), 5000) && !(await p.getByAltText('QR kód pro autentizační aplikaci').count()));
    }
    tvrdi(`S3 ${jmeno}: heslo odešlo jednou, v těle e-mail a heslo`, tela.filter(t => t[0] === 'heslo').length === 1 && tela[0][1].email === 'martin@managero.app' && tela[0][1].heslo === 'tajneheslo1', JSON.stringify(tela));
    tvrdi(`S3 ${jmeno}: kód má fokus`, await p.evaluate(() => document.activeElement?.id === 'sprava-kod'));
    const potvrdit = p.getByRole('button', { name: nastaveno ? 'Přihlásit' : 'Potvrdit a přihlásit' });
    tvrdi(`S3 ${jmeno}: bez šesti číslic nejde potvrdit`, await potvrdit.isDisabled());
    await p.getByLabel('Kód z aplikace').fill('12a3 45');
    tvrdi(`S3 ${jmeno}: pole bere jen číslice`, (await p.getByLabel('Kód z aplikace').inputValue()) === '123 45');
    await p.getByLabel('Kód z aplikace').fill('000000');
    await potvrdit.click();
    tvrdi(`S3 ${jmeno}: špatný kód → hláška, pole prázdné`, await dokud(() => p.getByText('Kód nesedí. Opiš aktuální kód z aplikace.').isVisible(), 5000) && (await p.getByLabel('Kód z aplikace').inputValue()) === '');
    await p.getByLabel('Kód z aplikace').fill('123456');
    navigace.length = 0;
    await potvrdit.click();
    tvrdi(`S3 ${jmeno}: správný kód → celé načtení /`, await dokud(() => navigace.includes('/'), 8000), navigace.join(' '));
    tvrdi(`S3 ${jmeno}: kód odešel bez mezer`, tela.filter(t => t[0] === 'kod').map(t => t[1].kod).join(',') === '000000,123456', JSON.stringify(tela));
    await p.waitForTimeout(300);
    const sw = await p.evaluate(async () => ('serviceWorker' in navigator) ? (await navigator.serviceWorker.getRegistrations()).length : 0);
    tvrdi(`S3 ${jmeno}: žádný service worker`, sw === 0, String(sw));
    tvrdi(`S3 ${jmeno}: nic nepřetéká`, !(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
    tvrdi(`S3 ${jmeno}: bez chyb v konzoli stránky`, chyby.length === 0, chyby.join(' | '));
    await ctx.close();
  }
}

// ---------------------------------------------------------------------------
console.log('S4 Menu vedení');
{
  const token = await encode({
    token: { sub: '15', name: 'Martin', email: 'employer@test.cz', role: 'employer', avatar: '🧑', jobTitle: 'Test', teamId: 1, superadmin: true },
    secret: process.env.NEXTAUTH_SECRET,
  });
  const { ctx, p } = await kontext({ viewport: { width: 390, height: 844 }, mobil: true });
  await ctx.addCookies([{ name: 'next-auth.session-token', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await jdi(p, BASE + '/employer/overview');
  await p.locator('button[title="Více"]').click();
  tvrdi('S4: menu Více se otevřelo (Odhlásit se je vidět)', await dokud(() => p.getByRole('button', { name: 'Odhlásit se' }).isVisible(), 5000));
  tvrdi('S4: položka „Správa platformy" v menu není', await p.getByRole('button', { name: 'Správa platformy' }).count() === 0);
  tvrdi('S4: nikde v aplikaci odkaz na /admin', await p.locator('a[href^="/admin"]').count() === 0);
  await ctx.close();
}

await konec();
