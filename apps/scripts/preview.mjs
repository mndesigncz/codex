// App Preview (video z obrazovky aplikace) pro App Store: 15 až 30 s, H.264, 30 fps, tichá AAC stopa.
//
//   node apps/scripts/preview.mjs --app=managero|client --base=http://localhost:3505 [--delka=26] [--test]
//   FFMPEG=/cesta/k/ffmpeg (výchozí `ffmpeg`; na Macu `brew install ffmpeg`; v cloudové session viz docs/obchody/README.md)
//
// Scénář se bere ze snímkového scénáře (apps/app-store/<app>/snimky.json, seznam 'iphone'): každá obrazovka se
// ukáže stejně dlouho a pomalu se na ní posune obsah dolů. Nahrává Playwright (recordVideo, webm), ffmpeg převede
// na 886x1920 (iPhone 6.9" a 6.5"), 30 fps, H.264 High, tichá AAC. Rozměr a délku Apple v tabulce „App preview
// specifications“ mění, před odesláním je ověř. Výstup: apps/app-store/<app>/previews/<app>-preview-886x1920.mp4 (v .gitignore).
// Nezávisí na denní době: hodiny se zamknou jako u snímků.
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { APPS, REPO, argumenty, chromiumCesta, spolecne, KLICE } from './_spolecne.mjs';
import { klientFixtury, namockujKlienta } from './fixtury-klient.mjs';

const arg = argumenty();
const APP = arg.app;
if (!KLICE.includes(APP)) { console.error('--app=managero|client'); process.exit(2); }
const BASE = arg.base || 'http://localhost:3505';
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const DELKA = Math.min(29, Math.max(16, Number(arg.delka || 26)));
const ADR = `${APPS}/app-store/${APP}`;
const scen = JSON.parse(readFileSync(`${ADR}/snimky.json`, 'utf8'));
const tmp = `${ADR}/.tmp-preview`; rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
mkdirSync(`${ADR}/previews`, { recursive: true });

const browser = await chromium.launch({ executablePath: chromiumCesta() });
const ctx = await browser.newContext({
  viewport: { width: 443, height: 960 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  locale: 'cs-CZ', timezoneId: 'Europe/Prague', colorScheme: 'light',
  recordVideo: { dir: tmp, size: { width: 443, height: 960 } },
  userAgent: `Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1 ${spolecne.apps[APP].uaToken}/${spolecne.verze} (build ${spolecne.build})`,
});
const p = await ctx.newPage();
await p.clock.setFixedTime(new Date(scen.hodiny));
await p.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} }; });
const cdp = await ctx.newCDPSession(p);
await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 54, bottom: 34, left: 0, right: 0 } });

if (arg.test) {
  await p.setContent('<meta name=viewport content="width=device-width,initial-scale=1"><body style="margin:0;font:32px system-ui;padding:calc(env(safe-area-inset-top) + 20px) 20px"><p id=o>0</p><script>let n=0;setInterval(()=>{o.textContent=++n},250)</script>');
  await p.waitForTimeout(16500);
} else {
  const scenyVidea = scen.iphone.slice(0, 6);
  const dwell = Math.round((DELKA * 1000) / scenyVidea.length);
  if (APP === 'client') {
    const fix = klientFixtury(new Date(scen.hodiny).toISOString().slice(0, 10));
    const cookie = execFileSyncCookie();
    await ctx.addCookies([{ name: 'next-auth.session-token', value: cookie, url: BASE, httpOnly: true, sameSite: 'Lax' }]);
    await namockujKlienta(ctx, fix);
  }
  for (const s of scenyVidea) {
    await p.goto(BASE + (s.url || s.cesta), { waitUntil: 'networkidle', timeout: 60000 });
    const zacatek = Date.now();
    await p.waitForTimeout(Math.round(dwell * 0.35));
    // pomalé posouvání obsahu dolů, ať video není jen slideshow
    const kroku = 6;
    for (let i = 0; i < kroku; i++) { await p.mouse.wheel(0, 120); await p.waitForTimeout(Math.round((dwell * 0.6) / kroku)); }
    await p.waitForTimeout(Math.max(0, dwell - (Date.now() - zacatek)));
  }
}
await ctx.close(); // video se uloží až při zavření kontextu
await browser.close();

function execFileSyncCookie() {
  return execFileSync('node', [`${REPO}/scripts/sondy/cookie-role.mjs`, 'customer'], {
    encoding: 'utf8', env: { ...process.env, NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? 'sondy-ci-secret-0123456789abcdef' } }).trim();
}

const webm = readdirSync(tmp).find(f => f.endsWith('.webm'));
if (!webm) { console.error('Playwright nenahrál žádné video'); process.exit(1); }
const vystup = `${ADR}/previews/${APP}-preview-886x1920.mp4`;
execFileSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-i', `${tmp}/${webm}`,
  '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
  '-vf', 'fps=30,scale=886:1920:flags=lanczos,setsar=1,format=yuv420p',
  '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.2', '-crf', '18', '-r', '30',
  '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-t', '29', '-shortest', '-movflags', '+faststart', vystup]);
rmSync(tmp, { recursive: true, force: true });
// ffmpeg -i bez výstupu končí chybou, ale do stderr vypíše délku: přečteme ji z ní.
let delka = 0;
try { execFileSync(FFMPEG, ['-hide_banner', '-i', vystup], { stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) {
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(String(e.stderr));
  if (m) delka = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}
console.log(`hotovo: ${vystup}, ${delka.toFixed(1)} s ${delka < 15 ? '(POZOR: pod 15 s, Apple odmítne)' : delka > 30 ? '(POZOR: nad 30 s)' : ''}`);
if (delka < 15 || delka > 30) process.exit(1);
