// Spuštění, balík O — Managero client v nativním obalu umí, co slibuje popis v obchodech.
//
// Obal se simuluje jako v sondě obal-most: značka ManageroClient/ v User-Agentu a podvržený
// `window.Capacitor` s falešnými pluginy, které si pamatují, co se po nich chtělo.
//  K1 Telefon 390: uprostřed spodního doku „Naskenovat" (≥ 44 px); klepnutí spustí nativní skener
//     a pod ním čeká okno s polem „Kód podniku"; QR podniku otevře podnik.
//  K2 Zavřený skener nechá okno; kód podniku otevře podnik, neznámý kód řekne proč; cizí QR ne.
//  K3 Počítač 1280: tlačítko „Naskenovat" s textem v hlavičce; nic nepřetéká ani na 320.
//  K4 Web bez obalu a bez kamery na QR: tlačítko říká „Zadat kód", okno má jen pole.
//  K5 Sdílení se soubory jde přes Filesystem → Share (files); canShare to přizná.
//  K6 Kartička z Moje se uloží i do úložiště aplikace (Preferences).
//  K7 window.open cizí adresy a veřejné stránky jde do prohlížeče v aplikaci (Browser).
//  K8 Aplikace Managero: /register vede na „Účet podniku založíte na webu", bez odkazu.
// Snímky (390 a 1280) do SONDY_SNIMKY, jinak do scripts/sondy/shots/.
import { mkdirSync } from 'node:fs';
import { browser, tvrdi, konec, BASE, OUT, tokenPro } from './k68-spolecne.mjs';
import { klientFixtury, namockujKlienta } from '../../apps/scripts/fixtury-klient.mjs';

const SNIMKY = process.env.SONDY_SNIMKY ?? OUT;
mkdirSync(SNIMKY, { recursive: true });
const b = await browser();
const fix = klientFixtury('2026-10-14');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const UA_KLIENT = `${UA} ManageroClient/1.0.0 (build 1)`;
const UA_PROVOZ = `${UA} ManageroApp/1.0.0 (build 1)`;

const FALESNY_CAPACITOR = () => {
  const z = (window.__nativni = { skenu: 0, sdileno: null, zapsano: [], prohlizec: [], prefs: {}, splash: 0 });
  window.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => 'ios',
    DEBUG: true,
    Plugins: {
      SplashScreen: { hide: () => { z.splash++; return Promise.resolve(); } },
      StatusBar: { setStyle: () => Promise.resolve() },
      Share: { share: (d) => { z.sdileno = d; return Promise.resolve({}); } },
      Filesystem: { writeFile: (o) => { z.zapsano.push(o.path); return Promise.resolve({ uri: `file:///cache/${o.path}` }); } },
      Browser: { open: (o) => { z.prohlizec.push(o.url); return Promise.resolve(); } },
      Haptics: { impact: () => Promise.resolve(), notification: () => Promise.resolve() },
      App: { addListener: () => Promise.resolve({ remove() {} }), minimizeApp: () => Promise.resolve() },
      Preferences: {
        get: (o) => Promise.resolve({ value: z.prefs[o.key] ?? null }),
        set: (o) => { z.prefs[o.key] = o.value; return Promise.resolve(); },
        remove: (o) => { delete z.prefs[o.key]; return Promise.resolve(); },
      },
      PushNotifications: {
        checkPermissions: () => Promise.resolve({ receive: 'denied' }),
        requestPermissions: () => Promise.resolve({ receive: 'denied' }),
        addListener: () => Promise.resolve({ remove() {} }), register: () => Promise.resolve(), createChannel: () => Promise.resolve(),
      },
      BarcodeScanner: {
        checkPermissions: () => Promise.resolve({ camera: 'granted' }),
        requestPermissions: () => Promise.resolve({ camera: 'granted' }),
        isGoogleBarcodeScannerModuleAvailable: () => Promise.resolve({ available: true }),
        scan: () => { z.skenu++; const v = window.__qr; return Promise.resolve({ barcodes: v ? [{ rawValue: v }] : [] }); },
      },
    },
  };
};

async function otevri({ ua, stub, sirka = 390, vyska = 844, prihlasen = true, cesta = '/client' }) {
  const mobil = sirka < 768;
  const ctx = await b.newContext({ viewport: { width: sirka, height: vyska }, locale: 'cs-CZ', isMobile: mobil, hasTouch: mobil, userAgent: ua });
  if (prihlasen) await ctx.addCookies([{ name: 'next-auth.session-token', value: tokenPro('customer'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  if (stub) await ctx.addInitScript(FALESNY_CAPACITOR);
  // Prohlížeč bez BarcodeDetector (jako Safari): web nabídne jen kód podniku.
  await ctx.addInitScript(() => { try { delete window.BarcodeDetector; } catch { /* není */ } });
  await namockujKlienta(ctx, fix);
  const p = await ctx.newPage();
  const chyby = [];
  p.on('pageerror', e => chyby.push(String(e).slice(0, 200)));
  await p.goto(BASE + cesta, { waitUntil: 'networkidle', timeout: 60000 });
  return { ctx, p, chyby };
}
/** Dotyková plocha: rámeček prvku, nebo zvětšení přes ::before (.tap-target, globals.css). */
const plocha = (loc) => loc.evaluate(el => {
  const r = el.getBoundingClientRect(); const pr = getComputedStyle(el, '::before');
  return { w: Math.max(r.width, parseFloat(pr.width) || 0), h: Math.max(r.height, parseFloat(pr.height) || 0) };
});
const pretece = (p) => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const snimek = (p, jmeno) => p.screenshot({ path: `${SNIMKY}/k88-${jmeno}.png` });
const cekejMost = (p) => p.waitForFunction(() => window.manageroNative, null, { timeout: 15000 }).catch(() => {});

console.log('K1 + K2 Telefon v obalu: Naskenovat a Zadat kód podniku');
{
  const { ctx, p, chyby } = await otevri({ ua: UA_KLIENT, stub: true });
  await cekejMost(p);
  // Přestavba hosta (2026-10-21): uprostřed doku je „U kasy“ (QR karty přes celou výšku); sken stojánku
  // nebo stolu se přestěhoval do hlavičky obrazovky Podniky (/client pro přihlášeného).
  tvrdi('dok má uprostřed „U kasy"', await p.getByRole('navigation', { name: 'Spodní navigace' }).getByRole('button', { name: 'U kasy: ukázat kartu' }).count() === 1);
  const dok = p.getByRole('button', { name: 'Naskenovat QR kód nebo zadat kód podniku' });
  tvrdi('Podniky mají v hlavičce „Naskenovat"', await dok.count() === 1);
  const box = await dok.boundingBox();
  tvrdi('cíl „Naskenovat" je aspoň 44 × 44 px', !!box && box.width >= 44 && box.height >= 44, JSON.stringify(box));
  tvrdi('telefon 390: nic nepřetéká', !(await pretece(p)));
  await snimek(p, 'klient-dok-390');

  // Skener zavřený bez kódu: okno s polem zůstane.
  await p.evaluate(() => { window.__qr = ''; });
  await dok.click();
  await p.getByRole('dialog', { name: 'Najít podnik' }).waitFor({ timeout: 10000 });
  await p.waitForTimeout(300);
  tvrdi('klepnutí spustilo nativní skener', await p.evaluate(() => window.__nativni.skenu) === 1);
  tvrdi('po zavření skeneru čeká pole „Kód podniku"', await p.getByRole('textbox', { name: 'Kód podniku' }).count() === 1);
  const pole = await p.getByRole('textbox', { name: 'Kód podniku' }).evaluate(el => ({ im: el.inputMode, cap: el.autocapitalize, h: el.getBoundingClientRect().height }));
  tvrdi('pole: klávesnice pro adresu, bez velkých písmen, výška ≥ 44', pole.im === 'url' && pole.cap === 'none' && pole.h >= 44, JSON.stringify(pole));
  await snimek(p, 'klient-okno-390');

  // Neznámý kód (podvržené API vrací 404) řekne, co s tím.
  await p.getByRole('textbox', { name: 'Kód podniku' }).fill('neexistuje-xyz');
  await p.getByRole('button', { name: 'Otevřít podnik' }).click();
  await p.getByText('Podnik s tímhle kódem jsme nenašli').waitFor({ timeout: 10000 }).catch(() => {});
  tvrdi('neznámý kód: srozumitelná hláška', await p.getByText('Podnik s tímhle kódem jsme nenašli').count() === 1);
  await p.getByRole('textbox', { name: 'Kód podniku' }).fill('Kavárna');
  await p.getByRole('button', { name: 'Otevřít podnik' }).click();
  tvrdi('kód s diakritikou: vysvětlí, jak kód vypadá', await p.getByText('Takový kód podniku nemáme').count() === 1);
  await snimek(p, 'klient-okno-chyba-390');

  // Cizí QR se neotevře.
  await p.evaluate(() => { window.__qr = 'https://evil.example/client/x'; });
  await p.getByRole('button', { name: 'Naskenovat QR kód', exact: true }).click();
  await p.getByText('Tohle není QR kód podniku z Managera').waitFor({ timeout: 10000 }).catch(() => {});
  tvrdi('cizí QR: hláška, žádné otevření', await p.getByText('Tohle není QR kód podniku z Managera').count() === 1 && new URL(p.url()).pathname === '/client');

  // Kód podniku otevře podnik.
  await p.getByRole('textbox', { name: 'Kód podniku' }).fill(' Ukazkova-Cajovna ');
  await Promise.all([p.waitForURL(/\/client\/ukazkova-cajovna/, { timeout: 15000 }).catch(() => {}), p.getByRole('button', { name: 'Otevřít podnik' }).click()]);
  tvrdi('kód podniku otevřel stránku podniku', /\/client\/ukazkova-cajovna$/.test(new URL(p.url()).pathname), p.url());

  // QR stolu ze skeneru otevře objednávku u stolu.
  await p.goto(BASE + '/client', { waitUntil: 'networkidle' });
  await cekejMost(p);
  await p.evaluate(() => { window.__qr = 'https://www.managero.app/client/kavarna-u-lipy?tab=order&table=3'; });
  await Promise.all([p.waitForURL(/\/client\/kavarna-u-lipy\?tab=order/, { timeout: 15000 }).catch(() => {}),
    p.getByRole('button', { name: 'Naskenovat QR kód nebo zadat kód podniku' }).click()]);
  tvrdi('QR stolu ze skeneru otevřel objednávku u stolu', /\/client\/kavarna-u-lipy\?tab=order&table=3/.test(p.url()), p.url());
  tvrdi('bez chyb na stránce', chyby.length === 0, chyby.join(' | '));
  await ctx.close();
}

console.log('K3 Počítač a úzký telefon');
{
  const { ctx, p } = await otevri({ ua: UA_KLIENT, stub: true, sirka: 1280, vyska: 900 });
  await cekejMost(p);
  const tl = p.getByRole('button', { name: 'Naskenovat QR kód nebo zadat kód podniku' });
  tvrdi('1280: tlačítko v hlavičce s textem „Naskenovat"', await tl.count() === 1 && /Naskenovat/.test(await tl.innerText()));
  tvrdi('1280: nic nepřetéká', !(await pretece(p)));
  await snimek(p, 'klient-hlavicka-1280');
  await tl.click();
  await p.getByRole('dialog', { name: 'Najít podnik' }).waitFor({ timeout: 10000 });
  await p.waitForTimeout(300);
  await snimek(p, 'klient-okno-1280');
  await ctx.close();
  for (const prihlasen of [true, false]) {
    const u = await otevri({ ua: UA_KLIENT, stub: true, sirka: 320, vyska: 700, prihlasen });
    tvrdi(`320 (${prihlasen ? 'přihlášený' : 'nepřihlášený'}): nic nepřetéká`, !(await pretece(u.p)));
    if (!prihlasen) {
      const t = u.p.getByRole('button', { name: 'Naskenovat QR kód nebo zadat kód podniku' });
      const bx = await plocha(t);
      tvrdi('320 nepřihlášený: tlačítko skenu v hlavičce, dotyková plocha ≥ 44 px', bx.w >= 44 && bx.h >= 44, JSON.stringify(bx));
      await snimek(u.p, 'klient-nepřihlášený-320');
    }
    await u.ctx.close();
  }
}

console.log('K4 Web bez obalu a bez kamery na QR');
{
  const { ctx, p } = await otevri({ ua: UA, stub: false, prihlasen: false });
  const tl = p.getByRole('button', { name: 'Zadat kód podniku' });
  tvrdi('web: tlačítko „Zadat kód podniku"', await tl.count() === 1);
  await tl.click();
  await p.getByRole('dialog', { name: 'Najít podnik' }).waitFor({ timeout: 10000 });
  tvrdi('web: okno bez tlačítka skenu, jen pole kódu', await p.getByRole('button', { name: 'Naskenovat QR kód' }).count() === 0 && await p.getByRole('textbox', { name: 'Kód podniku' }).count() === 1);
  await snimek(p, 'web-zadat-kod-390');
  await ctx.close();
}

console.log('K5–K7 Soubory, kartička v úložišti aplikace, odkazy ven');
{
  const { ctx, p } = await otevri({ ua: UA_KLIENT, stub: true, cesta: '/client/me' });
  await cekejMost(p);
  await p.waitForFunction(() => !!window.__nativni.prefs['managero-karta-v1'], null, { timeout: 15000 }).catch(() => {});
  const karta = await p.evaluate(() => window.__nativni.prefs['managero-karta-v1'] ?? '');
  tvrdi('kartička z Moje je v úložišti aplikace (Preferences)', /"code":"[A-Z0-9-]{8,16}"/.test(karta), karta.slice(0, 80));
  const s = await p.evaluate(async () => {
    const soubor = new File(['ahoj'], 'karta.png', { type: 'image/png' });
    const umi = navigator.canShare({ files: [soubor] });
    await navigator.share({ files: [soubor], title: 'Kartička' });
    return { umi, zapsano: window.__nativni.zapsano, sdileno: window.__nativni.sdileno };
  });
  tvrdi('canShare se soubory: ano (Filesystem je)', s.umi === true);
  tvrdi('sdílení souboru: zapsán do mezipaměti a předán Share jako files', s.zapsano.includes('karta.png') && JSON.stringify(s.sdileno?.files) === JSON.stringify(['file:///cache/karta.png']), JSON.stringify(s));
  const o = await p.evaluate(() => { window.open('https://mapy.cz/zakladni?q=Brno', '_blank'); window.open('/client/ukazkova-cajovna', '_blank'); return window.__nativni.prohlizec; });
  tvrdi('window.open cizí adresy i veřejné stránky → prohlížeč v aplikaci s celou adresou', o[0] === 'https://mapy.cz/zakladni?q=Brno' && /^http:\/\/localhost:\d+\/client\/ukazkova-cajovna$/.test(o[1] ?? ''), JSON.stringify(o));
  await snimek(p, 'klient-moje-390');
  await ctx.close();
}

console.log('K8 Aplikace Managero: založení podniku jen na webu');
for (const [sirka, vyska] of [[390, 844], [1280, 900]]) {
  const mobil = sirka < 768;
  const ctx = await b.newContext({ viewport: { width: sirka, height: vyska }, locale: 'cs-CZ', isMobile: mobil, hasTouch: mobil, userAgent: UA_PROVOZ });
  const p = await ctx.newPage();
  await p.goto(BASE + '/register', { waitUntil: 'networkidle', timeout: 60000 });
  const t = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  tvrdi(`${sirka}: /register → /zalozit-podnik s vysvětlením`, new URL(p.url()).pathname === '/zalozit-podnik' && /Účet podniku založíte na webu/.test(t), p.url());
  tvrdi(`${sirka}: bez odkazu ven a bez registrace`, await p.locator('a[href^="http"], a[href="/register"]').count() === 0);
  tvrdi(`${sirka}: nic nepřetéká`, !(await pretece(p)));
  const cile = await p.locator('main a').evaluateAll(a => a.map(x => x.getBoundingClientRect().height));
  tvrdi(`${sirka}: tlačítka aspoň 44 px`, cile.length === 2 && cile.every(h => h >= 44), JSON.stringify(cile));
  await snimek(p, `managero-zalozit-podnik-${sirka}`);
  await ctx.close();
}

await konec();
