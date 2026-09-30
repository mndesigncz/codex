// Kolo 74 — veřejná ukázka /demo: skutečná aplikace proti mock serveru v prohlížeči.
//
// Ukázka (lib/demo, components/demo) se vkládá do iframe na prodejní stránce
// a nahrává se. Sonda proto nehlídá jen „že se vykreslí", ale hlavně, že je
// bezpečná a že příběhy scén opravdu fungují:
//  D1 Izolace: NULA požadavků na skutečné /api/* (interceptor je v prohlížeči,
//     na síti nesmí být nic), žádné chyby v konzoli, žádný neznámý endpoint
//     (`window.__demoNezname`), žádné cookies, service worker ani push,
//     vlastní úložiště (volba tmavého motivu a režimu z aplikace se neprosákne
//     do ukázky ani zpět), světlý motiv vynucený.
//  D2 Všechny scény se vykreslí a řeknou rodiči `demo-pripraveno`.
//  D3 Uzávěrka: zamčeno → odškrtnout povinný úkol → odemčeno → odeslat →
//     uzávěrka je v seznamu. Zámek se odemkl skutečně (POST by jinak dostal 400).
//  D4 Rozvrh: vygenerovat → návrh → uložit a publikovat → směny jsou uložené.
//  D5 Telefon 390: žádné vodorovné přetečení na žádné scéně.
//  D6 Komunikace s rodičem (iframe téhož původu): `demo-pripraveno`, `demo-akce`,
//     příjem `demo-scena` a `demo-reset`, ?rezim=okno bez postranního panelu.
//  D7 Rámování: /demo se dá vložit ze stránky téhož původu (CSP i X-Frame-Options
//     to pustí), ze cizího původu ne, a ostatní trasy zůstávají nerámovatelné.
//  D8 Zprávy z cizího původu ukázka ignoruje.
import http from 'node:http';
import { browser, tvrdi, konec, BASE, OUT, dokud } from './k68-spolecne.mjs';

const b = await browser();
const SCENY = ['prehled', 'rozvrh', 'uzaverka', 'sklad', 'ukoly', 'tym', 'kiosk'];

/** Nový kontext bez cookies a bez podvrženého API: ukázka má fungovat sama. */
async function novyKontext({ viewport = { width: 1280, height: 950 }, mobil = false, init = null } = {}) {
  const ctx = await b.newContext({ viewport, locale: 'cs-CZ', isMobile: mobil, hasTouch: mobil });
  if (init) await ctx.addInitScript(init);
  const api = [];
  const chyby = [];
  ctx.on('request', r => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/')) api.push(`${r.method()} ${u.pathname}`); });
  return { ctx, api, chyby };
}

function sleduj(p, chyby) {
  p.on('pageerror', e => chyby.push(`pageerror: ${String(e).slice(0, 200)}`));
  p.on('console', m => { if (m.type() === 'error') chyby.push(m.text().slice(0, 240)); });
}

/** Otevře ukázku a počká na `demo-pripraveno` (stejná událost, kterou dostane rodič). */
async function otevriDemo(p, cesta) {
  await p.goto(BASE + cesta, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => (window.__demoUdalosti ?? []).some(u => u.typ === 'demo-pripraveno'), null, { timeout: 20000 });
  await p.waitForTimeout(400);
}

const udalosti = (p) => p.evaluate(() => window.__demoUdalosti ?? []);
const nezname = (p) => p.evaluate(() => window.__demoNezname ?? []);
const bezPretecni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

// D1 + D2) Každá scéna: nula požadavků na /api, čistá konzole, nic neznámého, `demo-pripraveno`.
{
  const { ctx, api, chyby } = await novyKontext();
  const p = await ctx.newPage();
  sleduj(p, chyby);
  for (const scena of SCENY) {
    const a0 = api.length; const c0 = chyby.length;
    await otevriDemo(p, `/demo?scena=${scena}`);
    const text = (await p.locator('body').innerText()).trim();
    tvrdi(`D2 ${scena}: vykresleno (${text.length} znaků) a rodič dostal demo-pripraveno`,
      text.length > 300 && (await udalosti(p)).some(u => u.typ === 'demo-pripraveno' && u.scena === scena));
    tvrdi(`D1 ${scena}: nula požadavků na skutečné /api`, api.length === a0, api.slice(a0).join(', '));
    tvrdi(`D1 ${scena}: bez chyb v konzoli`, chyby.length === c0, chyby.slice(c0).join(' | '));
    tvrdi(`D1 ${scena}: mock zná všechny endpointy, které scéna volá`, (await nezname(p)).length === 0, (await nezname(p)).join(', '));
    if (scena === 'prehled') await p.screenshot({ path: OUT + 'k74-prehled.png' });
  }
  // Neznámá scéna a role spadnou na přehled vedení, ne na prázdnou stránku.
  await otevriDemo(p, '/demo?scena=neexistuje&role=nikdo');
  tvrdi('D2 neznámá scéna → přehled vedení', (await udalosti(p)).some(u => u.typ === 'demo-pripraveno' && u.scena === 'prehled' && u.role === 'vedeni'));
  // ?role= přepíše výchozí roli scény.
  await otevriDemo(p, '/demo?scena=sklad&role=zamestnanec');
  tvrdi('D2 ?role=zamestnanec: portál zaměstnance (ne správa podniku)', await p.getByText('Portál zaměstnance').first().isVisible());
  await ctx.close();
}

// D1) Izolace prostředí: cookies, service worker, úložiště, motiv.
{
  const { ctx } = await novyKontext({
    init: () => {
      try {
        // Volba z „skutečné aplikace": tmavý motiv a plný režim. Ukázka je nesmí převzít ani přepsat.
        if (!localStorage.getItem('managero-theme')) localStorage.setItem('managero-theme', 'dark');
        if (!localStorage.getItem('managero-app-mode')) localStorage.setItem('managero-app-mode', 'full');
      } catch { /* soukromé okno */ }
    },
  });
  await ctx.emulateMedia({ colorScheme: 'dark' });
  const p = await ctx.newPage();
  await otevriDemo(p, '/demo?scena=prehled');
  tvrdi('D1 světlý motiv vynucený i při uloženém tmavém a tmavém systému', await p.evaluate(() => document.documentElement.getAttribute('data-theme') === 'light'));
  tvrdi('D1 žádné cookies', (await ctx.cookies()).length === 0 && (await p.evaluate(() => document.cookie)) === '');
  tvrdi('D1 žádný service worker', (await p.evaluate(() => navigator.serviceWorker.getRegistrations().then(r => r.length))) === 0);
  await p.getByRole('button', { name: 'Přepnout do TO GO režimu' }).click();
  await p.waitForTimeout(500);
  await p.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  const uloz = await p.evaluate(() => ({ rezim: localStorage.getItem('managero-app-mode'), motiv: localStorage.getItem('managero-theme') }));
  tvrdi('D1 úložiště aplikace zůstalo nedotčené (režim TO GO z ukázky se neprosákl)', uloz.rezim === 'full' && uloz.motiv === 'dark', JSON.stringify(uloz));
  await ctx.close();
}

// D3) Uzávěrka: zamčeno → odškrtnout povinný úkol → odemčeno → odeslat → v seznamu.
{
  const { ctx, api, chyby } = await novyKontext();
  const p = await ctx.newPage();
  sleduj(p, chyby);
  await otevriDemo(p, '/demo?scena=uzaverka');
  const zamek = p.locator('[aria-labelledby="zamek-uzaverky-titulek"]');
  tvrdi('D3 uzávěrka je zamčená a ukazuje, co chybí', await dokud(() => zamek.isVisible(), 5000)
    && (await zamek.innerText()).includes('Vynést koš'));
  const odeslat = p.getByRole('button', { name: 'Uzávěrka je zamčená', exact: true });
  tvrdi('D3 odeslání je šedé (aria-disabled)', (await odeslat.count()) === 1 && (await odeslat.getAttribute('aria-disabled')) === 'true');
  await p.getByRole('button', { name: /^Hotovo: Vynést koš/ }).click();
  tvrdi('D3 po odškrtnutí povinného úkolu se uzávěrka odemkne', await dokud(() => p.getByText('uzávěrka je odemčená').isVisible(), 5000));
  const ev = (await udalosti(p)).map(u => u.akce).filter(Boolean);
  tvrdi('D3 rodič dostal ukol-odskrtnut i uzaverka-odemcena', ev.includes('ukol-odskrtnut') && ev.includes('uzaverka-odemcena'), ev.join(','));
  // Vyplnit z pokladny, skutečný stav kasy = očekávaný, odeslat.
  await p.getByRole('button', { name: 'Předvyplnit z pokladny' }).click();
  await p.waitForTimeout(400);
  const ocekavany = await p.evaluate(() => {
    const t = [...document.querySelectorAll('main')].map(m => m.innerText).join('\n');
    const m = /Očekávaný stav kasy\s*\n?\s*([\d\s ]+)\s*Kč/.exec(t);
    return m ? m[1].replace(/[\s ]/g, '') : null;
  });
  tvrdi('D3 formulář spočítal očekávaný stav kasy', !!ocekavany, String(ocekavany));
  await p.getByLabel(/Skutečný stav kasy/).fill(String(ocekavany ?? 0));
  await p.getByRole('button', { name: 'Odeslat uzávěrku' }).click();
  // Uzávěrka s rozdílem se ještě zeptá; potvrdit, ať dojde k POST.
  for (let i = 0; i < 3 && !(await udalosti(p)).some(u => u.akce === 'uzaverka-odeslana'); i++) {
    const dal = p.getByRole('dialog').getByRole('button').filter({ hasText: /Odeslat|Pokračovat|Potvrdit/ }).first();
    if (await dal.isVisible().catch(() => false)) await dal.click();
    await p.waitForTimeout(600);
  }
  tvrdi('D3 uzávěrka odešla (rodič dostal uzaverka-odeslana)', await dokud(async () => (await udalosti(p)).some(u => u.akce === 'uzaverka-odeslana'), 5000));
  const dnes = await p.evaluate(() => window.__demoStav().dnes);
  const vSeznamu = await dokud(() => p.evaluate((d) => window.__demoStav().uzaverky.some(u => u.shift_date === d && u.created_by === 3), dnes), 3000);
  tvrdi('D3 dnešní uzávěrka je uložená ve stavu ukázky', vSeznamu);
  await p.waitForTimeout(800);
  const tx = await p.locator('main').innerText();
  tvrdi('D3 uzávěrka se objevila v seznamu (formulář už ji nenabízí)', /Středa 30\. září|Dnes|dnes/.test(tx) || !(await p.getByRole('button', { name: 'Odeslat uzávěrku' }).isVisible().catch(() => false)));
  tvrdi('D3 čistá konzole a nula požadavků na /api', chyby.length === 0 && api.length === 0, `${chyby.slice(0, 2).join(' | ')} ${api.slice(0, 2).join(',')}`);
  await p.screenshot({ path: OUT + 'k74-uzaverka-odeslana.png' });
  await ctx.close();
}

// D4) Rozvrh: vygenerovat → návrh → uložit a publikovat.
{
  const { ctx, api, chyby } = await novyKontext();
  const p = await ctx.newPage();
  sleduj(p, chyby);
  await otevriDemo(p, '/demo?scena=rozvrh');
  await p.getByRole('button', { name: /Vygenerovat rozvrh/ }).first().click();
  tvrdi('D4 generátor ukáže návrh', await dokud(() => p.getByText('Navržený rozvrh').isVisible(), 8000));
  const navrh = await p.locator('main').innerText();
  const m = /(\d+) navržen/.exec(navrh);
  tvrdi('D4 návrh nese směny (skutečný algoritmus, ne prázdný)', !!m && Number(m[1]) > 20, m?.[0] ?? 'bez počtu');
  const pred = await p.evaluate(() => window.__demoStav().smeny.length);
  await p.getByRole('button', { name: 'Uložit a publikovat' }).click();
  // Přepsání uložených směn se ještě zeptá: potvrdit.
  for (let i = 0; i < 4 && !(await udalosti(p)).some(u => u.akce === 'rozvrh-publikovan'); i++) {
    const dal = p.getByRole('dialog').getByRole('button').filter({ hasText: /Nahradit|Uložit|Potvrdit|Publikovat/ }).first();
    if (await dal.isVisible().catch(() => false)) await dal.click();
    await p.waitForTimeout(700);
  }
  const ev = (await udalosti(p)).map(u => u.akce).filter(Boolean);
  tvrdi('D4 rodič dostal rozvrh-vygenerovan, rozvrh-ulozen a rozvrh-publikovan', ['rozvrh-vygenerovan', 'rozvrh-ulozen', 'rozvrh-publikovan'].every(x => ev.includes(x)), ev.join(','));
  const po = await p.evaluate(() => window.__demoStav().smeny.length);
  tvrdi('D4 směny z návrhu jsou uložené v /api/schedule (stav ukázky)', po > pred - 20 && po >= Number(m?.[1] ?? 999) - 5, `před ${pred}, po ${po}`);
  tvrdi('D4 upozornění „rozvrh dostali lidé" je vidět', await dokud(() => p.getByText(/rozvrh dostal/).first().isVisible(), 4000));
  tvrdi('D4 čistá konzole a nula požadavků na /api', chyby.length === 0 && api.length === 0, `${chyby.slice(0, 2).join(' | ')} ${api.slice(0, 2).join(',')}`);
  await p.screenshot({ path: OUT + 'k74-rozvrh-publikovan.png' });
  await ctx.close();
}

// D5) Telefon 390: žádné vodorovné přetečení.
{
  const { ctx, api, chyby } = await novyKontext({ viewport: { width: 390, height: 844 }, mobil: true });
  const p = await ctx.newPage();
  sleduj(p, chyby);
  for (const scena of ['prehled', 'rozvrh', 'uzaverka', 'sklad', 'ukoly', 'tym']) {
    await otevriDemo(p, `/demo?scena=${scena}`);
    await p.waitForTimeout(600);
    tvrdi(`D5 telefon 390 ${scena}: bez vodorovného přetečení`, await bezPretecni(p), String(await p.evaluate(() => document.documentElement.scrollWidth)));
  }
  await p.screenshot({ path: OUT + 'k74-telefon.png' });
  tvrdi('D5 telefon: čistá konzole a nula požadavků na /api', chyby.length === 0 && api.length === 0, `${chyby.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

// D6 + D7) Iframe téhož původu: zprávy s rodičem, ?rezim=okno, rámování.
{
  const { ctx, chyby } = await novyKontext();
  const p = await ctx.newPage();
  sleduj(p, chyby);
  const porusenia = [];
  await p.exposeFunction('__porusenoCsp', (t) => porusenia.push(t));
  // Rodič: běžná stránka téhož původu s vlastním CSP (frame-src musí pustit 'self').
  await p.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => {
    window.__zpravy = [];
    window.addEventListener('message', e => { if (e.origin === location.origin) window.__zpravy.push(e.data); });
    document.addEventListener('securitypolicyviolation', e => window.__porusenoCsp(`${e.violatedDirective} ${e.blockedURI}`));
    const f = document.createElement('iframe');
    f.src = '/demo?scena=uzaverka&rezim=okno';
    f.style.cssText = 'width:1100px;height:800px;border:0';
    document.body.append(f);
  });
  const zpravy = () => p.evaluate(() => window.__zpravy);
  tvrdi('D7 iframe /demo ze stránky téhož původu se načte (CSP ani X-Frame-Options ho neblokují)',
    await dokud(async () => (await zpravy()).some(z => z.typ === 'demo-pripraveno'), 20000) && porusenia.length === 0, porusenia.join(' | '));
  const ram = p.frameLocator('iframe');
  tvrdi('D6 demo-pripraveno nese scénu a roli', (await zpravy()).some(z => z.typ === 'demo-pripraveno' && z.scena === 'uzaverka' && z.role === 'zamestnanec' && z.okno === true));
  tvrdi('D6 ?rezim=okno: bez postranního panelu', !(await ram.locator('aside').first().isVisible().catch(() => false)));
  await ram.getByRole('button', { name: /^Hotovo: Vynést koš/ }).click();
  await dokud(async () => (await zpravy()).some(z => z.akce === 'uzaverka-odemcena'), 6000);
  const akce = (await zpravy()).map(z => z.akce).filter(Boolean);
  tvrdi('D6 demo-akce dorazí rodiči (ukol-odskrtnut, uzaverka-odemcena)', akce.includes('ukol-odskrtnut') && akce.includes('uzaverka-odemcena'), akce.join(','));

  // demo-scena: přepnutí na Sklad bez načtení stránky, ve stejné roli.
  await p.evaluate(() => document.querySelector('iframe').contentWindow.postMessage({ typ: 'demo-scena', scena: 'sklad' }, location.origin));
  tvrdi('D6 demo-scena přepne pohled (Sklad zaměstnance)', await dokud(() => ram.getByRole('heading', { name: 'Sklad', level: 1 }).isVisible().catch(() => false), 8000)
    || await dokud(() => ram.locator('main').getByText(/16 položek/).isVisible().catch(() => false), 3000));
  // Přepnutí zpět na uzávěrku: odškrtnutý úkol zůstal odškrtnutý (stav ukázky se nezahodil).
  await p.evaluate(() => document.querySelector('iframe').contentWindow.postMessage({ typ: 'demo-scena', scena: 'uzaverka' }, location.origin));
  tvrdi('D6 stav přežije přepnutí scény (zámek je dál odemčený)', await dokud(() => ram.getByText('uzávěrka je odemčená').isVisible().catch(() => false), 8000));

  // demo-reset: čistý stav, zámek je zase zamčený a rodič dostane nové demo-pripraveno.
  const pripraveno0 = (await zpravy()).filter(z => z.typ === 'demo-pripraveno').length;
  await p.evaluate(() => document.querySelector('iframe').contentWindow.postMessage({ typ: 'demo-reset' }, location.origin));
  tvrdi('D6 demo-reset vrátí ukázku do výchozího stavu (povinný úkol znovu chybí)',
    await dokud(() => ram.getByRole('button', { name: /^Hotovo: Vynést koš/ }).isVisible().catch(() => false), 15000));
  tvrdi('D6 po resetu rodič dostal nové demo-pripraveno', await dokud(async () => (await zpravy()).filter(z => z.typ === 'demo-pripraveno').length > pripraveno0, 15000));
  tvrdi('D7 v iframe žádné porušení CSP', porusenia.length === 0, porusenia.join(' | '));
  await p.screenshot({ path: OUT + 'k74-iframe.png' });
  await ctx.close();
}

// D7) Hlavičky: /demo jen pro stejný původ, ostatní trasy nikdy; cizí původ ukázku nevloží.
{
  const dem = await fetch(BASE + '/demo');
  const csp = dem.headers.get('content-security-policy') ?? '';
  tvrdi('D7 /demo: X-Frame-Options SAMEORIGIN a frame-ancestors \'self\'', dem.headers.get('x-frame-options') === 'SAMEORIGIN' && /frame-ancestors 'self'/.test(csp), `${dem.headers.get('x-frame-options')} ${csp}`);
  tvrdi('D7 /demo: noindex (X-Robots-Tag i meta robots)', /noindex/.test(dem.headers.get('x-robots-tag') ?? '') && /<meta name="robots" content="noindex/.test(await dem.text()));
  tvrdi('D7 /demo: CSP zúžená (žádné Stripe, na síť jen \'self\')', !/stripe/.test(csp) && /connect-src 'self';/.test(csp), csp);
  for (const cesta of ['/login', '/', '/employer/overview', '/kiosk', '/api/teams']) {
    const r = await fetch(BASE + cesta, { redirect: 'manual' });
    const c = r.headers.get('content-security-policy') ?? '';
    tvrdi(`D7 ${cesta}: zůstává nerámovatelná (DENY, frame-ancestors 'none')`, r.headers.get('x-frame-options') === 'DENY' && /frame-ancestors 'none'/.test(c), `${r.status} ${r.headers.get('x-frame-options')}`);
  }
  const login = await fetch(BASE + '/login');
  tvrdi('D7 ostatní stránky smí vložit ukázku (frame-src má \'self\')', /frame-src 'self'/.test(login.headers.get('content-security-policy') ?? ''));

  // Cizí původ: stránka na jiném portu se pokusí ukázku vložit a otevřít.
  const cizi = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><title>cizí</title><iframe id="f" src="${BASE}/demo?scena=prehled" width="600" height="400"></iframe>`);
  });
  await new Promise(r => cizi.listen(0, '127.0.0.1', r));
  const port = cizi.address().port;
  const { ctx } = await novyKontext();
  const p = await ctx.newPage();
  await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  const ramy = p.frames().filter(f => f !== p.mainFrame());
  const vlozeno = ramy.some(f => f.url().startsWith(BASE + '/demo'));
  const obsah = vlozeno ? await ramy.find(f => f.url().startsWith(BASE + '/demo')).evaluate(() => document.body?.innerText?.length ?? 0).catch(() => 0) : 0;
  tvrdi('D7 cizí původ ukázku do iframe nevloží (blokuje frame-ancestors)', !vlozeno || obsah < 50, `${ramy.map(f => f.url()).join(', ')} (${obsah} znaků)`);

  // D8) Zpráva z cizího původu se ignoruje: otevřít ukázku z cizí stránky a poslat jí demo-scena.
  const [okno] = await Promise.all([
    p.waitForEvent('popup'),
    p.evaluate((u) => { window.__okno = window.open(u, '_blank'); }, `${BASE}/demo?scena=prehled`),
  ]);
  await okno.waitForFunction(() => (window.__demoUdalosti ?? []).some(u => u.typ === 'demo-pripraveno'), null, { timeout: 20000 });
  await p.evaluate(() => window.__okno.postMessage({ typ: 'demo-scena', scena: 'sklad' }, '*'));
  await okno.waitForTimeout(1500);
  const nadpis = (await okno.locator('main').innerText()).slice(0, 200);
  tvrdi('D8 zprávu z cizího původu ukázka ignoruje (scéna se nezměnila)', /Dobré (ráno|dopoledne|odpoledne|večer)|Přehled/.test(nadpis) && !/16 položek/.test(nadpis), nadpis.slice(0, 80));
  await ctx.close();
  cizi.close();
}

await konec();
