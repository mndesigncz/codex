// Snímky obrazovek pro App Store i Google Play: přesné rozměry, bez průhlednosti, s nadpisem.
//
//   node apps/scripts/snimky.mjs --app=managero|client|vse --base=http://localhost:3505
//        [--obchod=apple|play|vse] [--zarizeni=iphone69,iphone65,ipad13,android-phone,android-tablet7,android-tablet10]
//        [--locale=cs,en-US] [--only=prehled,rozvrh] [--test]
//
// Zdroj obrazovek (apps/app-store/<app>/snimky.json):
//   Managero:        /demo (lib/demo, skutečná aplikace proti mock serveru v prohlížeči), žádná databáze.
//   Managero client: skutečné trasy /client/* s mock API z apps/scripts/fixtury-klient.mjs a cookie role
//                    'customer' (scripts/sondy/cookie-role.mjs), jako v sondách.
// Běží proti `next start` se stejným NEXTAUTH_SECRET, jaký má tenhle proces (cookie se razí z něj).
// Nezávisí na denní době: hodiny se zamknou na `hodiny` ze snímkového scénáře.
//
// Výstup (všechno v .gitignore, protože snímky mají desítky MB; skript je zdroj pravdy):
//   Apple:  apps/app-store/<app>/screenshots/<locale>/<zarizeni>_<NN>_<id>.png
//   Google: apps/play-store/<app>/metadata/android/<cs-CZ|en-US>/images/<phone|sevenInch|tenInch>Screenshots/<N>.png
// --test nepotřebuje server: vykreslí zkušební stránku, projde celým řetězcem (safe-area, stavový řádek,
// rámeček, rozměry, alfa) a vysledky smaže.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { APPS, REPO, KLICE, argumenty, chromiumCesta, spolecne } from './_spolecne.mjs';
import { klientFixtury, namockujKlienta } from './fixtury-klient.mjs';

const arg = argumenty();
const TEST = !!arg.test;
const APPKLICE = !arg.app || arg.app === 'vse' ? KLICE : [arg.app];
for (const k of APPKLICE) if (!KLICE.includes(k)) { console.error('--app=managero|client|vse'); process.exit(2); }
const BASE = arg.base || 'http://localhost:3505';
const LOCALES = (arg.locale || 'cs,en-US').split(',');
const OBCHODY = !arg.obchod || arg.obchod === 'vse' ? ['apple', 'play'] : [arg.obchod];
const ONLY = arg.only ? new Set(arg.only.split(',')) : null;
const PLAY_LOCALE = { cs: 'cs-CZ', 'en-US': 'en-US' };

// Rozměry: CSS viewport × dsf = výstup, žádné škálování. sat/sab = safe-area v CSS px.
// Apple: tabulka App Store Connect (2026). Google: doporučené rozměry pro telefon a tablety 7" a 10".
const ZAR = {
  iphone69:          { obchod: 'apple', plat: 'ios',     sada: 'iphone', w: 440,  h: 956,  dsf: 3, sat: 62, sab: 34, out: [1320, 2868] },
  iphone65:          { obchod: 'apple', plat: 'ios',     sada: 'iphone', w: 428,  h: 926,  dsf: 3, sat: 47, sab: 34, out: [1284, 2778] },
  ipad13:            { obchod: 'apple', plat: 'ios',     sada: 'ipad',   w: 1032, h: 1376, dsf: 2, sat: 24, sab: 20, out: [2064, 2752], sirka: 0.84 },
  ipad13l:           { obchod: 'apple', plat: 'ios',     sada: 'ipad',   w: 1376, h: 1032, dsf: 2, sat: 24, sab: 20, out: [2752, 2064] },
  'android-phone':   { obchod: 'play',  plat: 'android', sada: 'iphone', w: 360,  h: 720,  dsf: 3, sat: 28, sab: 16, out: [1080, 2160], slozka: 'phoneScreenshots' },
  'android-tablet7': { obchod: 'play',  plat: 'android', sada: 'ipad',   w: 600,  h: 960,  dsf: 2, sat: 28, sab: 16, out: [1200, 1920], slozka: 'sevenInchScreenshots', sirka: 0.84 },
  'android-tablet7l':{ obchod: 'play',  plat: 'android', sada: 'ipad',   w: 960,  h: 600,  dsf: 2, sat: 28, sab: 16, out: [1920, 1200], slozka: 'sevenInchScreenshots' },
  'android-tablet10':{ obchod: 'play',  plat: 'android', sada: 'ipad',   w: 800,  h: 1280, dsf: 2, sat: 28, sab: 16, out: [1600, 2560], slozka: 'tenInchScreenshots', sirka: 0.84 },
  'android-tablet10l':{ obchod: 'play', plat: 'android', sada: 'ipad',   w: 1280, h: 800,  dsf: 2, sat: 28, sab: 16, out: [2560, 1600], slozka: 'tenInchScreenshots' },
};
const UA = {
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
};

const cookie = (role) => execFileSync('node', [`${REPO}/scripts/sondy/cookie-role.mjs`, role], {
  encoding: 'utf8', env: { ...process.env, NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? 'sondy-ci-secret-0123456789abcdef' } }).trim();

// Falešný stavový řádek (čas, signál, baterie). Jen ve snímku, nikdy v aplikaci.
// Připojuje se k <html>, ne k <body>: hydratace Reactu ho tak nesmaže.
const stavovyRadek = (cas, vyska, plat) => `(() => {
  const s = document.createElement('div');
  const ios = ${plat === 'ios'};
  s.style.cssText = 'position:fixed;top:0;left:0;right:0;height:${vyska}px;z-index:2147483647;pointer-events:none;display:flex;align-items:center;justify-content:space-between;padding:' + (ios ? '${Math.round(vyska * .18)}px 34px 0 46px' : '0 14px') + ';font:600 ' + (ios ? 17 : 13) + 'px/1 -apple-system,system-ui,sans-serif;color:#000';
  s.innerHTML = '<span>${cas}</span><span style="display:flex;gap:6px;align-items:center"><svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5" width="3" height="7" rx="1"/><rect x="10" y="2.5" width="3" height="9.5" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg><svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="22" height="12" rx="3.5" fill="none" stroke="#000" opacity=".4"/><rect x="2" y="2" width="19" height="9" rx="2"/><rect x="24" y="4" width="2" height="5" rx="1" opacity=".4"/></svg></span>';
  if (ios && ${vyska} > 40) { const o = document.createElement('div'); o.style.cssText = 'position:fixed;top:11px;left:50%;width:126px;height:37px;margin-left:-63px;border-radius:19px;background:#000;z-index:2147483647;pointer-events:none'; document.documentElement.append(o); }
  document.documentElement.append(s);
})()`;

const TEST_HTML = `<meta name=viewport content="width=device-width,initial-scale=1">
<style>body{margin:0;font:16px Geist,system-ui;background:#F3F4F0}
header{position:sticky;top:0;padding:calc(env(safe-area-inset-top) + 12px) 16px 12px;background:#fff;font-weight:700}
main{padding:16px}.k{background:#fff;border-radius:20px;padding:20px;margin-bottom:12px;box-shadow:0 8px 24px -12px rgba(0,0,0,.2)}
nav{position:fixed;left:0;right:0;bottom:0;padding:12px 16px calc(env(safe-area-inset-bottom) + 12px);background:#16181A;color:#C8F542;display:flex;justify-content:space-around}</style>
<header>Zkušební stránka</header><main><div class=k>Karta 1</div><div class=k>Karta 2</div><div class=k>Karta 3</div></main><nav><b>Podniky</b><b>Karta</b><b>Profil</b></nav>`;

const browser = await chromium.launch({ executablePath: chromiumCesta() });
const problemy = [];
const tmpKoren = `${APPS}/.tmp-snimky`; mkdirSync(tmpKoren, { recursive: true });
const fix = klientFixtury(new Date(JSON.parse(readFileSync(`${APPS}/app-store/client/snimky.json`, 'utf8')).hodiny).toISOString().slice(0, 10));

async function zachyt(z, s, app) {
  const ctx = await browser.newContext({ viewport: { width: z.w, height: z.h }, deviceScaleFactor: z.dsf, isMobile: true, hasTouch: true,
    locale: 'cs-CZ', timezoneId: 'Europe/Prague', colorScheme: 'light', reducedMotion: 'reduce',
    userAgent: `${UA[z.plat]} ${spolecne.apps[app].uaToken}/${spolecne.verze} (build ${spolecne.build})` });
  const p = await ctx.newPage();
  const scen = JSON.parse(readFileSync(`${APPS}/app-store/${app}/snimky.json`, 'utf8'));
  await p.clock.setFixedTime(new Date(scen.hodiny));
  // Obal v aplikaci: Capacitor hlásí nativní platformu (bez pluginů), takže se vykreslí, co host v aplikaci vidí.
  await p.addInitScript((plat) => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => plat, Plugins: {} }; }, z.plat);
  const cas = new Date(scen.hodiny).toLocaleTimeString('cs-CZ', { hour: 'numeric', minute: '2-digit', timeZone: 'Europe/Prague' });
  await p.addInitScript(stavovyRadek(cas, z.sat, z.plat));
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: z.sat, bottom: z.sab, left: 0, right: 0 } });
  if (TEST) await p.setContent(TEST_HTML);
  else {
    if (s.zdroj !== 'demo') {
      await ctx.addCookies([{ name: 'next-auth.session-token', value: cookie(app === 'client' ? 'customer' : (s.role || 'employer')), url: BASE, httpOnly: true, sameSite: 'Lax' }]);
      if (app === 'client') await namockujKlienta(ctx, fix);
    }
    await p.goto(BASE + (s.url || s.cesta), { waitUntil: 'networkidle', timeout: 60000 });
    for (const [akce, cil] of (s.kroky || [])) {
      const l = p.locator(cil).first();
      if (akce === 'klik') await l.click({ timeout: 15000 });
      else if (akce === 'scroll') await l.scrollIntoViewIfNeeded({ timeout: 15000 });
      else await l.waitFor({ timeout: 15000 });
      await p.waitForTimeout(350);
    }
    await p.waitForTimeout(1100);
  }
  const buf = await p.screenshot({ type: 'png' });
  await ctx.close();
  return sharp(buf).flatten({ background: '#ffffff' }).removeAlpha().png().toBuffer();
}

async function ram(rawBuf, z, app, nadpis, vystup) {
  const raw = `${tmpKoren}/raw-${process.pid}.png`;
  await sharp(rawBuf).toFile(raw);
  const ctx = await browser.newContext({ viewport: { width: z.out[0], height: z.out[1] }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const rad = z.plat === 'android' ? 0.05 : 0.10;
  const url = `${pathToFileURL(`${APPS}/app-store/_sablona/snimek.html`)}?w=${z.out[0]}&h=${z.out[1]}&app=${app}&t=${encodeURIComponent(nadpis)}&img=${encodeURIComponent(pathToFileURL(raw))}&r=${rad}${z.sirka ? `&sirka=${z.sirka}` : ''}`;
  await p.goto(url); await p.waitForSelector('html[data-hotovo]'); await p.evaluate(() => document.fonts.ready);
  const buf = await p.screenshot({ type: 'png' });
  await ctx.close();
  mkdirSync(vystup.replace(/\/[^/]+$/, ''), { recursive: true });
  await sharp(buf).flatten({ background: '#ffffff' }).removeAlpha().png({ compressionLevel: 9 }).toFile(vystup);
  rmSync(raw, { force: true });
}

async function over(soubor, z, nazev) {
  const m = await sharp(soubor).metadata();
  const ok = m.width === z.out[0] && m.height === z.out[1] && !m.hasAlpha && m.channels === 3;
  console.log(ok ? '  ok    ' : '  CHYBA ', nazev, `${m.width}x${m.height}`, m.hasAlpha ? 'alfa!' : '');
  if (!ok) problemy.push(nazev);
}

for (const app of APPKLICE) {
  const ADR = `${APPS}/app-store/${app}`;
  const scen = JSON.parse(readFileSync(`${ADR}/snimky.json`, 'utf8'));
  const maTablet = (scen.ipad || []).length > 0;
  const vychozi = [];
  if (OBCHODY.includes('apple')) vychozi.push('iphone69', 'iphone65', ...(maTablet ? ['ipad13'] : []));
  if (OBCHODY.includes('play')) vychozi.push('android-phone', ...(maTablet ? ['android-tablet7', 'android-tablet10'] : []));
  const zarizeni = (arg.zarizeni ? arg.zarizeni.split(',') : vychozi).filter(d => ZAR[d] && OBCHODY.includes(ZAR[d].obchod));
  console.log(`\n${app}: ${zarizeni.join(', ')}`);
  const cache = new Map(); // surový snímek stejné velikosti se nerenderuje znovu pro druhý jazyk ani druhý obchod
  for (const dev of zarizeni) {
    const spec = ZAR[dev];
    const seznam = (scen[spec.sada] || []).filter(s => !ONLY || ONLY.has(s.id));
    for (let i = 0; i < (TEST ? Math.min(1, seznam.length || 1) : seznam.length); i++) {
      const s = seznam[i] ?? { id: 'test' };
      const z = (spec.sada === 'ipad' && s.orientace === 'na-sirku') ? ZAR[dev.startsWith('android') ? `${dev}l` : 'ipad13l'] ?? spec : spec;
      const klic = `${z.w}x${z.h}@${z.dsf}|${z.plat}|${s.id}`;
      if (!cache.has(klic)) cache.set(klic, await zachyt(z, s, app));
      for (const loc of LOCALES) {
        const nadpis = s[loc] || s.cs || 'Zkouška';
        const vystup = TEST
          ? `${tmpKoren}/${app}-${dev}-${loc}.png`
          : z.obchod === 'apple'
            ? `${ADR}/screenshots/${loc}/${dev}_${String(i + 1).padStart(2, '0')}_${s.id}.png`
            : `${APPS}/play-store/${app}/metadata/android/${PLAY_LOCALE[loc]}/images/${z.slozka}/${i + 1}.png`;
        await ram(cache.get(klic), z, app, nadpis, vystup);
        await over(vystup, z, `${z.obchod}/${loc}/${dev}/${s.id}`);
      }
    }
  }
}
rmSync(tmpKoren, { recursive: true, force: true });
await browser.close();
if (problemy.length) { console.error('Špatné snímky:', problemy.join(', ')); process.exit(1); }
console.log('\nhotovo');
