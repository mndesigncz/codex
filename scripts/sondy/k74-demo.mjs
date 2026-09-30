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
//  D9 Skutečné úložiště a cookies: ukázka nesmí přečíst ani zapsat NIC do skutečného
//     localStorage, sessionStorage a document.cookie (kiosk píše `managero-kiosk-acting`,
//     kterou server u skutečné kioskové relace uznává; cookie skutečného tabletu přežije).
//  D10 Klientská navigace: router.push('/demo') z jiné stránky = nula /api požadavků
//     a plné načtení; odchod z ukázky klientskou navigací nenechá patchnutý fetch.
//  D11 Odhlášení (vedení, zaměstnanec, tablet) neopustí /demo.
//  D12 Zápisy z prvních obrazovek skončí viditelně, ne chybou: oznámení, chat, postup,
//     příjem objednávky, objednávka hosta, pozvánka, receptury, počítadla Odměn.
//  D13 Dny a hodiny: příchody podle směn, zprávy ne z noci, kdykoli se ukázka otevře.
//  D14 Beforeunload aplikace neblokuje reset; stav přežije přepnutí role; demo-ping.
import http from 'node:http';
import { browser, tvrdi, konec, BASE, OUT, dokud } from './k68-spolecne.mjs';

const b = await browser();
const SCENY = ['prehled', 'rozvrh', 'uzaverka', 'sklad', 'ukoly', 'tym', 'kiosk'];

/**
 * Zaznamenává každý přístup ke SKUTEČNÉMU úložišti a cookies. Paměťové úložiště a
 * cookie jar ukázky jsou jiné objekty (vlastní třída, vlastní vlastnost na `document`),
 * takže cokoli, co projde přes Storage.prototype nebo Document.prototype.cookie, je
 * skutečné: v ukázce se to nesmí stát ani jednou.
 */
const STOPA = () => {
  window.__realneUloziste = [];
  const S = Storage.prototype;
  for (const m of ['getItem', 'setItem', 'removeItem', 'clear', 'key']) {
    const o = S[m];
    S[m] = function (...a) { window.__realneUloziste.push(`${m}:${a[0] ?? ''}`); return o.apply(this, a); };
  }
  const d = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
  Object.defineProperty(Document.prototype, 'cookie', {
    configurable: true,
    get() { window.__realneUloziste.push('cookie.get'); return d.get.call(this); },
    set(v) { window.__realneUloziste.push(`cookie.set:${String(v).split('=')[0]}`); d.set.call(this, v); },
  });
};
const realne = (p) => p.evaluate(() => window.__realneUloziste ?? []);

/** Nový kontext bez cookies a bez podvrženého API: ukázka má fungovat sama. */
async function novyKontext({ viewport = { width: 1280, height: 950 }, mobil = false, init = null, stopa = false, cookies = [] } = {}) {
  const ctx = await b.newContext({ viewport, locale: 'cs-CZ', isMobile: mobil, hasTouch: mobil });
  if (cookies.length) await ctx.addCookies(cookies);
  if (stopa) await ctx.addInitScript(STOPA);
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

/** Vyhodnocení, které přežije načtení stránky uprostřed (kontext zaniká → zatím false). */
const prezije = (p, f, arg) => p.evaluate(f, arg).catch(() => false);

const udalosti = (p) => p.evaluate(() => window.__demoUdalosti ?? []);
const nezname = (p) => p.evaluate(() => window.__demoNezname ?? []);
const bezPretecni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

// D1 + D2) Každá scéna: nula požadavků na /api, čistá konzole, nic neznámého, `demo-pripraveno`.
{
  const { ctx, api, chyby } = await novyKontext({ stopa: true });
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
    tvrdi(`D9 ${scena}: žádný přístup ke skutečnému localStorage, sessionStorage ani cookies`, (await realne(p)).length === 0, (await realne(p)).join(', '));
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
  const p = await ctx.newPage();
  await p.emulateMedia({ colorScheme: 'dark' });
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
  // Skutečná routa schvaluje uzávěrku se směnou sama (approved = bezSchvaleni || !!shift):
  // dnešní směna je v seznamu a nečeká na schválení.
  tvrdi('D3 uzávěrka se směnou je schválená rovnou (ne „Čeká na schválení")',
    await p.evaluate((d) => window.__demoStav().uzaverky.find(u => u.shift_date === d && u.created_by === 3)?.approved === true, dnes)
    && (await p.getByText('Čeká na schválení').count()) === 0);
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
  // Nástroj je ve scéně nahoře: návrh se objeví na první obrazovce, ne pod pěti widgety.
  tvrdi('D4 návrh je po vygenerování vidět bez scrollování', await p.getByText('Navržený rozvrh').evaluate(el => el.getBoundingClientRect().top < innerHeight));
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
    if (scena === 'rozvrh') tvrdi('D5 telefon 390 rozvrh: Vygenerovat rozvrh je na první obrazovce', await p.getByRole('button', { name: /Vygenerovat rozvrh/ }).first().evaluate(el => el.getBoundingClientRect().top < innerHeight));
    if (scena === 'uzaverka') tvrdi('D5 telefon 390 uzávěrka: zámek je na první obrazovce', await p.locator('[aria-labelledby="zamek-uzaverky-titulek"]').evaluate(el => el.getBoundingClientRect().top < innerHeight));
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

// ---------------------------------------------------------------------------
// Pomocné pro pevný čas: ukázku otevře návštěvník kdykoli, sonda ne. Playwright
// hodiny (Date, časovače běží dál samy) dají každému běhu stejnou denní dobu.
// ---------------------------------------------------------------------------
const dnesPraha = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date());
/** Okamžik `hh:mm` pražského času dneška (posun podle letního/zimního času). */
function pragaCas(hm) {
  const den = dnesPraha();
  const poledne = new Date(`${den}T12:00:00Z`);
  const hodinaVPraze = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Prague', hour: 'numeric', hourCycle: 'h23' }).format(poledne));
  const posun = hodinaVPraze - 12;
  const [h, m] = hm.split(':').map(Number);
  return new Date(Date.UTC(...den.split('-').map((x, i) => (i === 1 ? Number(x) - 1 : Number(x))), h - posun, m));
}
async function kontextVCase(hm, opts = {}) {
  const k = await novyKontext(opts);
  await k.ctx.clock.install({ time: pragaCas(hm) });
  return k;
}

// D9) Skutečné cookies a úložiště: kiosk (zapisuje managero-kiosk-acting) v noci, kdy si tablet
// zeptá, kdo přichází. Cookie skutečného tabletu musí přežít a identita vybraná v ukázce se
// zapíše jen do paměťového cookie jaru; ve skutečném úložišti se nesmí stát nic.
{
  const { ctx, api, chyby } = await kontextVCase('04:30', { stopa: true, cookies: [{ name: 'managero-kiosk-acting', value: '42', url: BASE }] });
  const p = await ctx.newPage();
  sleduj(p, chyby);
  const skutecne = async () => (await ctx.cookies()).map(c => `${c.name}=${c.value}`).join(';');
  await otevriDemo(p, '/demo?scena=kiosk');
  tvrdi('D9 kiosk: skutečná cookie tabletu přežila otevření ukázky (nesmazala ji)', (await skutecne()) === 'managero-kiosk-acting=42', await skutecne());
  tvrdi('D9 kiosk: ukázka skutečnou cookie nevidí (document.cookie je prázdné)', (await p.evaluate(() => document.cookie)) === '');
  await p.getByRole('button', { name: 'Jsem na směně' }).click();
  await p.getByRole('button', { name: /Tomáš Dvořák/ }).click();
  await p.getByRole('button', { name: 'Odpíchnout příchod' }).click();
  tvrdi('D9 kiosk: vybraná osoba se zapsala do paměťové cookie ukázky', await dokud(() => p.evaluate(() => document.cookie.includes('managero-kiosk-acting=2')), 5000), await p.evaluate(() => document.cookie));
  tvrdi('D9 kiosk: skutečná cookie se výběrem osoby nezměnila', (await skutecne()) === 'managero-kiosk-acting=42', await skutecne());
  tvrdi('D9 kiosk: žádný přístup ke skutečnému localStorage, sessionStorage ani cookies', (await realne(p)).length === 0, (await realne(p)).join(', '));
  // D12) Objednávka hosta od stolu: přijmout ji musí být vidět (dřív stál stav pořád „Nová").
  await p.getByRole('button', { name: /^Objednávky/ }).first().click();
  await p.getByRole('button', { name: 'Přijmout' }).first().click();
  tvrdi('D12 kiosk: přijatá objednávka hosta změní stav (Připravuje se) a rodič to ví',
    await dokud(() => p.getByText('Připravuje se').first().isVisible().catch(() => false), 5000)
    && (await udalosti(p)).some(u => u.akce === 'objednavka-hosta-prijata'));
  tvrdi('D12 kiosk: čistá konzole a nula požadavků na /api', chyby.length === 0 && api.length === 0, `${chyby.slice(0, 2).join(' | ')} ${api.slice(0, 2).join(',')}`);
  await ctx.close();
}

// D10) Klientská navigace: router.push('/demo') z jiné stránky nesmí nechat nativní fetch.
{
  const { ctx, api, chyby } = await novyKontext({ stopa: true });
  const p = await ctx.newPage();
  sleduj(p, chyby);
  await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  api.length = 0; // co dělá /login sám, sem nepatří
  await p.evaluate(() => { window.__marker = 1; window.next.router.push('/demo?scena=prehled&role=vedeni'); });
  const nacteno = await dokud(() => prezije(p, () => location.pathname === '/demo' && window.__marker === undefined && (window.__demoUdalosti ?? []).some(u => u.typ === 'demo-pripraveno')), 30000);
  await p.waitForTimeout(1500);
  tvrdi('D10 router.push(/demo) z /login: ukázka se načte (plné načtení, ne klientský render)', nacteno);
  tvrdi('D10 router.push(/demo) z /login: nula požadavků na skutečné /api', api.length === 0, api.join(', '));
  tvrdi('D10 po klientském vstupu je interceptor i paměťové úložiště nainstalované',
    await p.evaluate(() => window.__demoNainstalovano === true && !String(window.fetch).includes('[native code]') && !(localStorage instanceof Storage)));
  tvrdi('D10 po klientském vstupu žádný přístup ke skutečnému úložišti', (await realne(p)).length === 0, (await realne(p)).join(', '));
  tvrdi('D10 po klientském vstupu čistá konzole', chyby.length === 0, chyby.slice(0, 2).join(' | '));
  // Odchod klientskou navigací: patchnutý fetch a paměťové úložiště nesmí přežít.
  await p.evaluate(() => { window.__marker = 1; window.next.router.push('/login'); });
  const odesel = await dokud(() => prezije(p, () => location.pathname === '/login' && window.__marker === undefined), 30000);
  tvrdi('D10 odchod z ukázky klientskou navigací: skutečná stránka bez patchnutého fetch a s pravým úložištěm',
    odesel && await p.evaluate(() => window.__demoNainstalovano !== true && String(window.fetch).includes('[native code]') && localStorage instanceof Storage));
  await ctx.close();
}

// D11) Odhlášení neopustí ukázku: next-auth dostane adresu ukázky, ne skutečné /login.
{
  const { ctx, api, chyby } = await novyKontext();
  const p = await ctx.newPage();
  sleduj(p, chyby);
  const odhlasit = async (nazev, jmeno) => {
    await otevriDemo(p, nazev);
    await p.evaluate(() => { window.__marker = 1; });
    await p.getByRole('button', { name: new RegExp(jmeno) }).first().click();
    await p.getByRole('menuitem', { name: 'Odhlásit se' }).or(p.getByRole('button', { name: 'Odhlásit se' })).first().click();
    const znovu = await dokud(() => prezije(p, () => window.__marker === undefined && (window.__demoUdalosti ?? []).some(u => u.typ === 'demo-pripraveno')), 20000);
    return znovu && new URL(p.url()).pathname === '/demo';
  };
  tvrdi('D11 vedení: Odhlásit se zůstane v ukázce (načte ji znovu)', await odhlasit('/demo?scena=prehled', 'Marta Havlíková'), p.url());
  tvrdi('D11 zaměstnanec: Odhlásit se zůstane v ukázce', await odhlasit('/demo?scena=prehled&role=zamestnanec', 'Eliška Nováková'), p.url());
  await otevriDemo(p, '/demo?scena=kiosk');
  await p.evaluate(() => { window.__marker = 1; });
  await p.getByRole('button', { name: 'Odhlásit tablet' }).first().click();
  await p.getByRole('dialog').getByRole('button', { name: 'Odhlásit tablet' }).click();
  tvrdi('D11 tablet: Odhlásit tablet zůstane v ukázce',
    await dokud(() => prezije(p, () => window.__marker === undefined && (window.__demoUdalosti ?? []).some(u => u.typ === 'demo-pripraveno')), 20000) && new URL(p.url()).pathname === '/demo', p.url());
  tvrdi('D11 odhlášení: nula požadavků na /api, nikdy /login, čistá konzole', api.length === 0 && chyby.length === 0 && !p.url().includes('/login'), `${api.slice(0, 2).join(',')} ${chyby.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

// D12) Zápisy z prvních obrazovek: musí skončit viditelně, ne chybovou hláškou.
{
  const { ctx, api, chyby } = await novyKontext();
  const p = await ctx.newPage();
  sleduj(p, chyby);
  // Nástěnka a chat na Přehledu vedení.
  await otevriDemo(p, '/demo?scena=prehled');
  await p.getByLabel('Nové oznámení').fill('Zkouška oznámení z ukázky');
  await p.getByRole('button', { name: 'Připnout oznámení' }).click();
  tvrdi('D12 nástěnka: připnuté oznámení je v seznamu a bez chyby',
    await dokud(() => p.getByText('Zkouška oznámení z ukázky').first().isVisible(), 5000) && (await p.getByText('nepodařilo připnout').count()) === 0);
  await p.getByRole('button', { name: /^Chat, nepřečtené/ }).click();
  const tym = p.getByText('Týmový chat').first();
  if (await tym.count()) await tym.click();
  const pole = p.getByPlaceholder(/^Zpráva/);
  await pole.fill('Zpráva z ukázky');
  await pole.press('Enter');
  // Zpráva se ukáže hned (optimisticky), chyba „nepodařilo odeslat" a vrácený text přijdou až po odpovědi.
  await p.waitForTimeout(900);
  tvrdi('D12 chat: odeslaná zpráva je ve vlákně, bez chyby a pole je prázdné (tvar odpovědi { message })',
    await p.getByText('Zpráva z ukázky').first().isVisible() && (await p.getByText('nepodařilo odeslat').count()) === 0 && (await pole.inputValue()) === '');
  // Zpráva se v chatu ukáže hned (optimisticky); událost přijde až s odpovědí mocku.
  await dokud(async () => (await udalosti(p)).some(u => u.akce === 'zprava-odeslana'), 5000);
  const akcePrehledu = (await udalosti(p)).map(u => u.akce).filter(Boolean);
  tvrdi('D12 chat a nástěnka: rodič dostal oznameni-pridano i zprava-odeslana', ['oznameni-pridano', 'zprava-odeslana'].every(a => akcePrehledu.includes(a)), akcePrehledu.join(','));
  tvrdi('D12 chat: zpráva je uložená ve stavu ukázky (odpověď mocku má tvar { message })', await p.evaluate(() => window.__demoStav().zpravy.some(z => z.content === 'Zpráva z ukázky')));
  // Receptury a Odměny (počítadla nesmí lhát).
  await p.locator('aside').getByRole('button', { name: 'Receptury' }).first().click();
  tvrdi('D12 receptury: pokrytí recepturou není nula (7 z 8 položek)', await dokud(() => p.getByText('7 z 8 položek').isVisible().catch(() => false), 5000));
  await p.locator('aside').getByRole('button', { name: 'Odměny' }).first().click();
  const odmeny = async () => (await p.locator('main').innerText());
  tvrdi('D12 odměny: nehodnocené směny se počítají a u lidí je Ohodnotit (žádné „Vše ohodnoceno")',
    await dokud(async () => /Ohodnotit/.test(await odmeny()), 5000) && !/Vše ohodnoceno/.test(await odmeny()));
  tvrdi('D12 přehled: čistá konzole, nic neznámého, nula požadavků na /api', chyby.length === 0 && api.length === 0 && (await nezname(p)).length === 0, `${chyby.slice(0, 2).join(' | ')} ${api.slice(0, 2).join(',')} ${(await nezname(p)).join(',')}`);

  // Postup (zaměstnanec): spustit → odškrtnout → dokončit.
  await otevriDemo(p, '/demo?scena=prehled&role=zamestnanec');
  await p.getByRole('button', { name: 'Postupy' }).first().click();
  await p.getByRole('button', { name: /Spustit/ }).first().click();
  tvrdi('D12 postupy: Spustit otevře běh (runner s kroky, ne mrtvé tlačítko)', await dokud(() => p.getByText('Zapnout kávovar a mlýnek').first().isVisible(), 5000));
  for (const t of ['Zapnout kávovar a mlýnek', 'Zkontrolovat mléko a ovesný nápoj', 'Napéct ranní koláče', 'Spočítat kasu při otevření']) await p.getByText(t).first().click();
  await p.getByRole('button', { name: 'Dokončit' }).click();
  tvrdi('D12 postupy: dokončení uloží běh a rodič dostane postup-spusten i postup-dokoncen',
    await dokud(async () => (await udalosti(p)).some(u => u.akce === 'postup-dokoncen'), 5000) && (await udalosti(p)).some(u => u.akce === 'postup-spusten'));
  tvrdi('D12 postupy: dokončený běh je ve stavu ukázky', await p.evaluate(() => window.__demoStav().behyPostupu.filter(b => b.status === 'completed' && b.checked.length === 4).length === 1));

  // Sklad: příjem objednávky naskladní a zásoba přestane docházet.
  await otevriDemo(p, '/demo?scena=sklad');
  const pred = await p.evaluate(() => window.__demoStav().zasoby.find(z => z.id === 1).quantity);
  await p.getByRole('button', { name: /Přijmout/ }).first().click();
  await p.getByRole('button', { name: 'Přijmout a naskladnit' }).click();
  tvrdi('D12 sklad: příjem objednávky ji vyřídí a naskladní (PATCH s action: received)',
    await dokud(() => p.evaluate(() => window.__demoStav().objednavky.some(o => o.supplier === 'Pražírna Pod Věží' && o.status === 'received')), 5000)
    && (await p.evaluate(() => window.__demoStav().zasoby.find(z => z.id === 1).quantity)) === pred + 10);
  tvrdi('D12 sklad: čekající objednávka z přehledu zmizela', await dokud(() => p.getByText('Žádná objednávka nečeká na příjem.').isVisible().catch(() => false), 5000));

  // Tým: pozvánka se zapíše a je v seznamu.
  await otevriDemo(p, '/demo?scena=tym');
  await p.getByRole('button', { name: 'Pozvat člena' }).click();
  await p.locator('[role=dialog] textarea').first().fill('nova@ukazka.example');
  await p.getByRole('dialog').getByRole('button', { name: 'Odeslat pozvánku' }).click();
  tvrdi('D12 tým: odeslaná pozvánka je v seznamu pozvánek', await dokud(() => p.evaluate(() => window.__demoStav().pozvanky.some(x => x.email === 'nova@ukazka.example')), 5000)
    && await dokud(() => p.getByText('nova@ukazka.example').first().isVisible().catch(() => false), 5000));
  tvrdi('D12 sklad, tým, postupy: čistá konzole, nic neznámého, nula požadavků na /api', chyby.length === 0 && api.length === 0 && (await nezname(p)).length === 0, `${chyby.slice(0, 2).join(' | ')} ${api.slice(0, 2).join(',')} ${(await nezname(p)).join(',')}`);
  await ctx.close();
}

// D13) Denní doba: příchody vycházejí ze směn dneška, zprávy nejsou z noci pod DNES.
for (const hm of ['03:50', '10:00', '21:30']) {
  const { ctx } = await kontextVCase(hm);
  const p = await ctx.newPage();
  await otevriDemo(p, '/demo?scena=prehled');
  const r = await p.evaluate(() => {
    const s = window.__demoStav(); const ted = Date.now();
    const praha = (iso) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
    const den = (iso) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(iso));
    const dnes = s.dnes;
    const dnesni = s.pichacky.filter(x => den(x.clockIn) === dnes);
    const chybi = dnesni.filter(x => !s.smeny.some(m => m.date === dnes && m.employeeId === x.employeeId && praha(x.clockIn) >= m.startTime));
    const budoucnost = s.pichacky.filter(x => new Date(x.clockIn).getTime() > ted || (x.clockOut && new Date(x.clockOut).getTime() > ted));
    const zpravy = s.zpravy.map(z => ({ den: den(z.createdAt), cas: praha(z.createdAt), po: new Date(z.createdAt).getTime() > ted }));
    return { dnes, naSmene: dnesni.filter(x => !x.clockOut).map(x => x.employeeId).sort(), bezSmeny: chybi.length, budoucnost: budoucnost.length, zpravy };
  });
  tvrdi(`D13 ${hm}: každý dnešní příchod má směnu a není v budoucnosti`, r.bezSmeny === 0 && r.budoucnost === 0, JSON.stringify(r));
  const ocekavani = hm === '03:50' ? [] : hm === '10:00' ? [2, 5] : [3];
  tvrdi(`D13 ${hm}: na směně je ${ocekavani.length ? ocekavani.join(' + ') : 'nikdo'}`, JSON.stringify(r.naSmene) === JSON.stringify(ocekavani), JSON.stringify(r.naSmene));
  const zpravyOk = r.zpravy.every(z => !z.po && (hm === '03:50' ? z.den < r.dnes : z.den === r.dnes && z.cas >= '07:45' && z.cas <= '20:00'));
  tvrdi(`D13 ${hm}: zprávy chatu nejsou z noci ani z budoucnosti (${hm === '03:50' ? 'včera' : 'dnes v provozní době'})`, zpravyOk, JSON.stringify(r.zpravy));
  await ctx.close();
}

// D14) Beforeunload aplikace neblokuje reset, stav přežije přepnutí role, demo-ping.
{
  const { ctx, chyby } = await novyKontext();
  const p = await ctx.newPage();
  sleduj(p, chyby);
  const dialogy = [];
  p.on('dialog', d => { dialogy.push(`${d.type()}: ${d.message()}`); d.accept().catch(() => {}); });
  await otevriDemo(p, '/demo?scena=rozvrh');
  await p.getByRole('button', { name: /Vygenerovat rozvrh/ }).first().click();
  await dokud(() => p.getByText('Navržený rozvrh').isVisible(), 8000);
  await p.evaluate(() => { window.__marker = 1; window.__demoReset(); });
  const znovu = await dokud(() => prezije(p, () => window.__marker === undefined), 15000);
  tvrdi('D14 reset s rozpracovaným návrhem rozvrhu se provede bez dialogu „Opustit stránku?"', znovu && dialogy.length === 0, dialogy.join(' | '));
  await ctx.close();
}
{
  const { ctx, chyby } = await novyKontext();
  const p = await ctx.newPage();
  sleduj(p, chyby);
  await p.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => {
    window.__zpravy = [];
    window.addEventListener('message', e => { if (e.origin === location.origin) window.__zpravy.push(e.data); });
    const f = document.createElement('iframe');
    f.src = '/demo?scena=uzaverka&rezim=okno';
    f.style.cssText = 'width:1100px;height:800px;border:0';
    document.body.append(f);
  });
  const zpravy = () => p.evaluate(() => window.__zpravy);
  const pripraveno = async () => (await zpravy()).filter(z => z.typ === 'demo-pripraveno');
  await dokud(async () => (await pripraveno()).length >= 1, 20000);
  const ram = p.frameLocator('iframe');
  tvrdi('D14 demo-ping: rodič, který se přihlásil pozdě, dostane demo-pripraveno znovu', await (async () => {
    const n = (await pripraveno()).length;
    await p.evaluate(() => document.querySelector('iframe').contentWindow.postMessage({ typ: 'demo-ping' }, location.origin));
    return dokud(async () => (await pripraveno()).length > n, 5000);
  })());
  // Zaměstnanec odškrtne povinný úkol, pak se přepne na vedení: druhá role vidí stejná data.
  await ram.getByRole('button', { name: /^Hotovo: Vynést koš/ }).click();
  await dokud(async () => (await zpravy()).some(z => z.akce === 'uzaverka-odemcena'), 6000);
  const n0 = (await pripraveno()).length;
  await p.evaluate(() => document.querySelector('iframe').contentWindow.postMessage({ typ: 'demo-scena', scena: 'uzaverka', role: 'vedeni' }, location.origin));
  tvrdi('D14 přepnutí role načte ukázku znovu pro vedení', await dokud(async () => (await pripraveno()).length > n0 && (await pripraveno()).at(-1).role === 'vedeni', 20000));
  const ramec = p.frames().find(f => f.url().includes('/demo'));
  tvrdi('D14 stav přežil přepnutí role (povinný úkol z role zaměstnance je u vedení splněný)',
    await ramec.evaluate(() => window.__demoStav().ukoly.find(u => u.id === 41)?.status === 'done' && window.__demoStav().role === 'vedeni'));
  tvrdi('D14 přenos stavu nezanechal stopu (window.name je po převzetí prázdné)', await ramec.evaluate(() => window.name === ''));
  await ctx.close();
}

await konec();
