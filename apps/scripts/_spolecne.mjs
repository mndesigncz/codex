// Společné pomocné věci pro skripty v apps/scripts (ikony, snímky, video, kontroly).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const APPS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = path.resolve(APPS, '..');
export const spolecne = JSON.parse(readFileSync(`${APPS}/apps.json`, 'utf8'));
export const KLICE = Object.keys(spolecne.apps);

/** --klic=hodnota a --priznak → { klic: 'hodnota', priznak: '1' } */
export function argumenty(argv = process.argv.slice(2)) {
  return Object.fromEntries(argv.map(a => { const [k, v = '1'] = a.replace(/^--/, '').split('='); return [k, v]; }));
}

/**
 * Cesta k Chromiu: jen SONDY_CHROMIUM, jinak undefined a Playwright si najde prohlížeč sám
 * (PLAYWRIGHT_BROWSERS_PATH, nebo `npx playwright-core install chromium`), stejně jako sondy.
 * Záměrně se NEhledá plný chrome v /opt/pw-browsers: ten při velkém viewportu (1320x2868)
 * padal na „Target crashed“, headless shell ne.
 */
export function chromiumCesta() {
  return process.env.SONDY_CHROMIUM || undefined;
}

export const GEIST = `${REPO}/node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2`;
