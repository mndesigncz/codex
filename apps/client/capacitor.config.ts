// Nativní obal aplikace Managero client (hosté: karta, rezervace, objednávky od stolu), iOS i Android.
//
// Stejná konfigurace jako apps/managero/capacitor.config.ts, liší se jen klíč
// v apps/apps.json (ID, UA token, vstupní adresa). Viz komentáře tam.
import type { CapacitorConfig } from '@capacitor/cli';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const KLIC = 'client';
const spolecne = JSON.parse(readFileSync(join(process.cwd(), '..', 'apps.json'), 'utf8'));
const app = spolecne.apps[KLIC];

const userAgent = `${app.uaToken}/${spolecne.verze} (build ${spolecne.build})`;

const config: CapacitorConfig = {
  appId: app.bundleId,
  appName: app.nazev,
  webDir: 'www',
  server: {
    url: app.vstupniUrl,
    cleartext: false,
    allowNavigation: [spolecne.domena, "managero.app"],
    errorPath: 'offline.html',
  },
  ios: {
    appendUserAgent: userAgent,
    contentInset: 'never',
    preferredContentMode: 'mobile',
    limitsNavigationsToAppBoundDomains: false,
    webContentsDebuggingEnabled: false,
  },
  android: {
    appendUserAgent: userAgent,
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
    captureInput: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      launchShowDuration: 0,
      backgroundColor: app.barvy.splashSvetly,
      androidScaleType: 'CENTER_INSIDE',
      showSpinner: false,
    },
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
    SystemBars: { insetsHandling: 'css' },
  },
};

export default config;
