// Nativní obal: most (components/NativeBridge) se načte jen v obalu a dělá, co má.
//
// Obal rozpoznává značka ManageroApp/ nebo ManageroClient/ v User-Agentu (apps/*/capacitor.config.ts).
// Sonda podvrhne `window.Capacitor` s falešnými pluginy (skutečné jsou nativní, tady nejsou) a tvrdí:
//  O1 Web bez značky nestáhne kód mostu a `window.manageroNative` neexistuje (web se nezvětšil).
//  O2 V obalu se most načte a nahlásí se (`managero:nativni-pripraveno`), splash se schová a stavový řádek dostane styl.
//  O3 Push: token z nativní registrace jde na POST /api/native/push s app 'klient' a platformou (kontrakt plan-app-host.md 4.3).
//  O4 navigator.share a navigator.vibrate v obalu jdou přes nativní pluginy.
//  O5 Sken QR podniku otevře stránku podniku; cizí QR ne.
//  O6 Offline stránka obalu (apps/client/www/offline.html) je česky, schová splash a nabízí „Zkusit znovu“.
//  O7 Řetěz snímků pro obchody (apps/scripts/snimky.mjs --test) vyrobí přesné rozměry bez alfa kanálu.
// Nezávisí na denní době ani na databázi (API podvrhují fixtury z apps/scripts/fixtury-klient.mjs).
import { execFileSync } from 'node:child_process';
import { browser, tvrdi, konec, BASE, tokenPro } from './k68-spolecne.mjs';
import { klientFixtury, namockujKlienta } from '../../apps/scripts/fixtury-klient.mjs';

const b = await browser();
const fix = klientFixtury('2026-10-14');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

/** Falešný Capacitor s pluginy, které si pamatují, co se po nich chtělo. */
const FALESNY_CAPACITOR = () => {
  const posluchaci = {};
  const z = (window.__nativni = { splash: 0, styl: null, sdileno: null, vibraci: 0, skenu: 0 });
  window.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => 'ios',
    Plugins: {
      SplashScreen: { hide: () => { z.splash++; return Promise.resolve(); } },
      StatusBar: { setStyle: (o) => { z.styl = o.style; return Promise.resolve(); } },
      Share: { share: (d) => { z.sdileno = d; return Promise.resolve({}); } },
      Haptics: { impact: () => { z.vibraci++; return Promise.resolve(); }, notification: () => Promise.resolve() },
      App: { addListener: () => Promise.resolve({ remove() {} }), minimizeApp: () => Promise.resolve() },
      Preferences: { get: () => Promise.resolve({ value: null }), set: () => Promise.resolve() },
      PushNotifications: {
        checkPermissions: () => Promise.resolve({ receive: 'granted' }),
        requestPermissions: () => Promise.resolve({ receive: 'granted' }),
        createChannel: () => Promise.resolve(),
        addListener: (ev, cb) => { posluchaci[ev] = cb; return Promise.resolve({ remove() {} }); },
        register: () => { setTimeout(() => posluchaci.registration?.({ value: 'TOKEN-SONDA-123' }), 20); return Promise.resolve(); },
      },
      BarcodeScanner: {
        checkPermissions: () => Promise.resolve({ camera: 'granted' }),
        requestPermissions: () => Promise.resolve({ camera: 'granted' }),
        isGoogleBarcodeScannerModuleAvailable: () => Promise.resolve({ available: true }),
        scan: () => { z.skenu++; return Promise.resolve({ barcodes: [{ rawValue: window.__qr ?? '' }] }); },
      },
    },
  };
};

async function otevri({ obal, stub }) {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, locale: 'cs-CZ', isMobile: true, hasTouch: true,
    userAgent: obal ? `${UA} ${obal}` : UA,
  });
  await ctx.addCookies([{ name: 'next-auth.session-token', value: tokenPro('customer'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  if (stub) await ctx.addInitScript(FALESNY_CAPACITOR);
  await namockujKlienta(ctx, fix);
  const push = []; const skripty = [];
  ctx.on('request', r => { if (r.url().includes('/api/native/push')) push.push({ metoda: r.method(), telo: r.postData() }); });
  ctx.on('response', async r => {
    if (r.request().resourceType() === 'script') { try { skripty.push(await r.text()); } catch { /* přesměrování */ } }
  });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/client`, { waitUntil: 'networkidle', timeout: 45000 });
  return { ctx, p, push, skripty };
}

console.log('Web bez značky obalu:');
{
  const { ctx, p, skripty } = await otevri({ obal: null, stub: false });
  await p.waitForTimeout(1500);
  tvrdi('kód mostu se nestáhl', !skripty.some(t => t.includes('managero-push-token')), 'chunk NativeBridge je i na webu');
  tvrdi('window.manageroNative neexistuje', await p.evaluate(() => typeof window.manageroNative === 'undefined'));
  await ctx.close();
}

console.log('Obal Managero client:');
{
  const { ctx, p, push, skripty } = await otevri({ obal: 'ManageroClient/1.0.0 (build 1)', stub: true });
  await p.waitForFunction(() => window.manageroNative, null, { timeout: 15000 }).catch(() => {});
  tvrdi('kód mostu se stáhl', skripty.some(t => t.includes('managero-push-token')), 'bez značky v UA se most nenačetl');
  const n = await p.evaluate(() => ({ api: !!window.manageroNative, obal: window.manageroNative?.obal, splash: window.__nativni.splash, styl: window.__nativni.styl, dataObal: document.documentElement.dataset.obal }));
  tvrdi('most se nahlásil jako client', n.api && n.obal === 'client', JSON.stringify(n));
  tvrdi('html má data-obal', n.dataObal === 'client', String(n.dataObal));
  tvrdi('splash se schoval', n.splash >= 1, String(n.splash));
  tvrdi('stavový řádek dostal styl', n.styl === 'LIGHT' || n.styl === 'DARK', String(n.styl));

  await p.waitForTimeout(1500);
  const post = push.find(x => x.metoda === 'POST');
  const telo = post ? JSON.parse(post.telo || '{}') : null;
  tvrdi('token šel na POST /api/native/push', !!post, 'nic neodešlo (session není přihlášená, nebo registrace selhala)');
  tvrdi('tělo: token, platforma ios, aplikace klient', telo?.token === 'TOKEN-SONDA-123' && telo?.platform === 'ios' && telo?.app === 'klient', JSON.stringify(telo));

  await p.evaluate(() => { navigator.share({ title: 'Podnik', url: 'https://www.managero.app/client/x' }); navigator.vibrate(8); });
  await p.waitForTimeout(200);
  const s = await p.evaluate(() => ({ sdileno: window.__nativni.sdileno, vibraci: window.__nativni.vibraci }));
  tvrdi('navigator.share jde přes plugin Share', s.sdileno?.title === 'Podnik', JSON.stringify(s.sdileno));
  tvrdi('navigator.vibrate jde přes plugin Haptics', s.vibraci >= 1, String(s.vibraci));

  await p.evaluate(() => { window.__qr = 'https://www.managero.app/client/ukazkova-cajovna?tab=order'; });
  await Promise.all([p.waitForURL(/\/client\/ukazkova-cajovna\?tab=order/, { timeout: 15000 }).catch(() => {}), p.evaluate(() => window.manageroNative.skenujAOtevri())]);
  tvrdi('sken QR podniku otevřel stránku podniku', /\/client\/ukazkova-cajovna\?tab=order/.test(p.url()), p.url());
  // Cizí QR se neotevře a funkce to řekne (false), aby UI mohlo ukázat hlášku.
  const p2 = await ctx.newPage();
  await p2.goto(`${BASE}/client`, { waitUntil: 'networkidle' });
  await p2.waitForFunction(() => window.manageroNative, null, { timeout: 15000 }).catch(() => {});
  await p2.evaluate(() => { window.__qr = 'https://evil.example/client/x'; });
  const cizi = await p2.evaluate(() => window.manageroNative.skenujAOtevri());
  tvrdi('cizí QR se neotevře', cizi === false && p2.url().startsWith(BASE), `${cizi} ${p2.url()}`);
  await ctx.close();
}

console.log('Offline stránka obalu:');
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'cs-CZ' });
  await ctx.addInitScript(FALESNY_CAPACITOR);
  const p = await ctx.newPage();
  const soubor = new URL('../../apps/client/www/offline.html', import.meta.url).href;
  await p.goto(soubor);
  const t = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  tvrdi('česky a poctivě', /Nejsi připojený/.test(t) && /Zkusit znovu/.test(t), t.slice(0, 120));
  tvrdi('nic o rozepsaném ani o offline režimu neslibuje', !/rozepsan|offline režim|nic se neztratilo/i.test(t), t);
  tvrdi('schoval splash', await p.evaluate(() => window.__nativni.splash >= 1));
  await ctx.close();
}

console.log('Snímky pro obchody (řetěz safe-area, rámeček, rozměry):');
{
  let ok = true; let vystup = '';
  try {
    vystup = execFileSync('node', [new URL('../../apps/scripts/snimky.mjs', import.meta.url).pathname, '--app=client', '--test', '--zarizeni=iphone69,android-phone', '--locale=cs'],
      { encoding: 'utf8', env: { ...process.env } });
  } catch (e) { ok = false; vystup = String(e.stdout ?? e.message); }
  tvrdi('snimky.mjs --test prošel', ok && /iphone69/.test(vystup) && /1320x2868/.test(vystup) && /1080x2160/.test(vystup), vystup.slice(-300));
  tvrdi('žádný snímek s alfa kanálem', !/alfa!/.test(vystup), vystup.slice(-300));
}

await konec();
