#!/usr/bin/env node
// OG obrázek prodejní stránky (1200×630 PNG) ze skutečného snímku aplikace.
//
// Odkaz nasdílený na síti ukáže tuhle kartu. Obrazovka v ní není nakreslená:
// je to plakát živé ukázky (public/brand/landing/rec/hero-prehled-pocitac.webp),
// tedy skutečný snímek aplikace s vymyšlenými daty. Text je Geist z balíčku
// `geist` (vložený do stránky jako data URI, ať render nezávisí na systémových
// fontech). Nic o zákaznících ani čísla, která by se nedala doložit.
//
//   SONDY_CHROMIUM=/cesta/chrome node scripts/landing-og.mjs   → public/brand/landing/og.png
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const KOREN = new URL('../', import.meta.url).pathname;
const font = (soubor) => `data:font/woff2;base64,${readFileSync(KOREN + 'node_modules/geist/dist/fonts/geist-sans/' + soubor).toString('base64')}`;
const logo = `data:image/svg+xml;base64,${readFileSync(KOREN + 'app/icon.svg').toString('base64')}`;
const plakat = `data:image/webp;base64,${readFileSync(KOREN + 'public/brand/landing/rec/hero-prehled-pocitac.webp').toString('base64')}`;

// Barvy jsou tokeny z app/globals.css (--bg, --ink, --lime), jen zapsané tady,
// protože render žije mimo aplikaci.
const html = `<!doctype html><html lang="cs"><meta charset="utf-8"><style>
@font-face{font-family:G;font-weight:700;src:url(${font('Geist-Bold.woff2')}) format('woff2')}
@font-face{font-family:G;font-weight:500;src:url(${font('Geist-Medium.woff2')}) format('woff2')}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:#F3F4F0;font-family:G,sans-serif;color:#16181A;position:relative;overflow:hidden}
.blob{position:absolute;right:-160px;top:-180px;width:720px;height:720px;border-radius:50%;background:radial-gradient(closest-side,rgba(200,245,66,.55),rgba(200,245,66,0))}
.text{position:absolute;left:64px;top:72px;width:520px}
.znacka{display:flex;align-items:center;gap:14px;font-weight:700;font-size:30px;letter-spacing:-.02em}
.znacka img{width:48px;height:48px;display:block}
h1{margin-top:44px;font-size:64px;line-height:1.04;letter-spacing:-.035em;font-weight:700}
p{margin-top:26px;font-size:26px;line-height:1.35;font-weight:500;color:rgba(22,24,26,.68)}
.pilule{position:absolute;left:64px;bottom:56px;background:#16181A;color:#fff;font-weight:700;font-size:24px;padding:14px 26px;border-radius:999px}
.ram{position:absolute;left:628px;top:150px;width:528px;padding:10px;background:#16181A;border-radius:26px;box-shadow:0 30px 70px rgba(25,35,15,.28)}
.ram img{display:block;width:508px;height:319px;object-fit:cover;object-position:top left;border-radius:17px}
</style><body><div class="blob"></div>
<div class="text"><div class="znacka"><img src="${logo}" alt="">Managero</div>
<h1>Směny, sklad a uzávěrka na jednom místě.</h1>
<p>Pro kavárny, restaurace a bary. Celá aplikace v telefonu týmu.</p></div>
<div class="ram"><img src="${plakat}" alt=""></div>
<div class="pilule">Zkus si ji přímo na webu</div>
</body></html>`;

const tmp = mkdtempSync(join(tmpdir(), 'managero-og-'));
const soubor = join(tmp, 'og.html');
writeFileSync(soubor, html);
const b = await chromium.launch({ executablePath: process.env.SONDY_CHROMIUM || undefined });
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await p.goto('file://' + soubor);
await p.evaluate(() => document.fonts.ready);
const png = await p.screenshot({ type: 'png' });
await b.close();
rmSync(tmp, { recursive: true, force: true });

const cil = KOREN + 'public/brand/landing/og.png';
// Paleta 256 barev srazí PNG o polovinu a na karty v sítích je to víc než dost.
const vystup = await sharp(png).png({ palette: true, quality: 92, effort: 8 }).toBuffer();
writeFileSync(cil, vystup);
const m = await sharp(cil).metadata();
console.log(`og.png ${m.width}x${m.height}, ${(vystup.length / 1024).toFixed(0)} kB`);
if (m.width !== 1200 || m.height !== 630) { console.error('✗ OG obrázek nemá 1200x630'); process.exit(1); }
