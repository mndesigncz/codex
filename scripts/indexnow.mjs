#!/usr/bin/env node
// Ohlásí adresy ze sitemapy vyhledávačům přes IndexNow (Bing, Seznam, Yandex…; Google IndexNow
// nepodporuje a sitemapu si najde sám přes řádek Sitemap v robots.txt). Klíč je veřejný soubor
// public/<klíč>.txt — jeho zveřejnění je podmínka protokolu, nic tajného.
//
// Použití (po nasazení): node scripts/indexnow.mjs [https://www.managero.app]

const ZAKLAD = (process.argv[2] ?? 'https://www.managero.app').replace(/\/$/, '');
const KLIC = '3c387c1953f7b12e7ca7d377cba67c2e';

const sitemap = await (await fetch(`${ZAKLAD}/sitemap.xml`)).text();
const adresy = [...new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim()))];
if (!adresy.length) { console.error('Sitemap je prázdná'); process.exit(1); }

const odpoved = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: new URL(ZAKLAD).host, key: KLIC, keyLocation: `${ZAKLAD}/${KLIC}.txt`, urlList: adresy }),
});
console.log(`IndexNow: ${adresy.length} adres → HTTP ${odpoved.status}`);
if (odpoved.status >= 400) { console.error(await odpoved.text()); process.exit(1); }
