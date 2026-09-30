// Nativní obal aplikace Managero (provoz: vedení a zaměstnanci), iOS i Android.
//
// Celá konfigurace se čte z apps/apps.json (jediný zdroj pravdy: ID, UA token,
// vstupní adresa). Soubor je schválně samostatný a bez importů ze sousedních
// .ts souborů: Capacitor CLI ho transpiluje sám a relativní importy TypeScriptu
// by nenašel. Spouští se vždy z adresáře apps/managero (npx cap ...).
import type { CapacitorConfig } from '@capacitor/cli';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const KLIC = 'managero';
const spolecne = JSON.parse(readFileSync(join(process.cwd(), '..', 'apps.json'), 'utf8'));
const app = spolecne.apps[KLIC];

// Server pozná obal podle tohoto tokenu v User-Agentu (lib/obal.ts). Token nic
// neodemyká, jen zužuje: skryje platby a přesměruje špatnou roli. Číslo buildu
// v závorce čte server kvůli hlášce „Aktualizujte aplikaci“ u starých binárek.
const userAgent = `${app.uaToken}/${spolecne.verze} (build ${spolecne.build})`;

const config: CapacitorConfig = {
  appId: app.bundleId,
  appName: app.nazev,
  // webDir musí existovat i při server.url: obsahuje jen offline.html (errorPath)
  // a záchytný index.html. Generuje ho apps/scripts/sync-www.mjs.
  webDir: 'www',
  server: {
    // Živý web, ne zabalený export. Důvod: CSRF brána v middleware (lib/puvod.ts)
    // zamítá mutace z cizího Origin a cookie relace NextAuth je first-party jen
    // na www.managero.app. Zabalený shell (capacitor://localhost) by rozbil přihlášení.
    url: app.vstupniUrl,
    cleartext: false,
    // Všechno mimo naši doménu (odkazy na dodavatele, mapy) se otevře v systému.
    allowNavigation: [spolecne.domena],
    // Když se web při studeném startu nenačte, ukáže se www/offline.html místo bílé stránky.
    errorPath: 'offline.html',
  },
  ios: {
    appendUserAgent: userAgent,
    // Bezpečné okraje řeší CSS (env(safe-area-inset-*)), ne nativní inset.
    contentInset: 'never',
    preferredContentMode: 'mobile',
    // App-Bound Domains by zúžily WKWebView a rozbily most k pluginům.
    limitsNavigationsToAppBoundDomains: false,
    webContentsDebuggingEnabled: false,
  },
  android: {
    appendUserAgent: userAgent,
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
    // Klávesnice jde do vlastního vstupního spojení WebView, bez skoků rozvržení.
    captureInput: true,
  },
  plugins: {
    // Splash zmizí, až se web vykreslí (NativeBridge volá hide), nejpozději po 6 s.
    SplashScreen: {
      launchAutoHide: false,
      launchShowDuration: 0,
      backgroundColor: app.barvy.splashSvetly,
      androidScaleType: 'CENTER_INSIDE',
      showSpinner: false,
    },
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
    // Edge-to-edge od targetSdk 35: Capacitor předá okraje do CSS proměnných.
    SystemBars: { insetsHandling: 'css' },
    // CapacitorCookies a CapacitorHttp se NEZAPÍNAJÍ: změnily by chování fetch
    // a cookies, na kterých stojí NextAuth.
  },
};

export default config;
