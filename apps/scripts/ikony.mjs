// Ikony, launch screen a grafika pro obchody obou aplikací ze zdrojových SVG.
//   node apps/scripts/ikony.mjs [--jen=managero|client]
//
// Zdroj (kolo „Bon", 2026-10): dvě kopie téhož bonu, limetka jen jako tečka za součtem.
//   apps/_shared/assets/src/<app>-hero.png  1024 skleněný render (Higgsfield) — iOS ikona, Google Play, splash
//   apps/_shared/assets/src/<app>.svg       vektor (viewBox 120, plná plocha; geometrie = LogoMark
//                                           v components/Icons.tsx) — Android adaptivní vrstvy a monochrom
//   managero  grafitová plocha, kouřový bon nakloněný doprava
//   client    papírová plocha, mléčný bon nakloněný doleva
// Bez hero renderu se vše bere z vektoru jako dřív.
//
// Výstup v apps/<app>/assets/:
//   icon-only.png           1024×1024, plné pozadí, BEZ alfa a BEZ zaoblení (iOS maskuje sám; vstup @capacitor/assets)
//   icon-foreground.png     1024×1024 průhledné, motiv v bezpečném kruhu 66 % (Android adaptivní; vstup @capacitor/assets)
//   icon-background.png     1024×1024 plné pozadí (Android adaptivní)
//   splash.png, splash-dark.png   2732×2732, motiv uprostřed (bezpečná oblast ~1200 px)
//   android/ic_launcher_foreground_432.png, ic_launcher_background_432.png, ic_launcher_monochrome_432.png
//                           adaptivní ikona v nativní velikosti 108 dp × 4 = 432 px (motiv v kruhu 264 px)
//   play-icon-512.png       ikona pro Google Play (512×512, bez průhlednosti; Google přidá masku)
//   feature-graphic-<cs|en-US>.png   1024×500 bez alfa (Google Play)
// Play varianty se kopírují i do apps/play-store/<app>/metadata/android/<locale>/images/.
import sharp from 'sharp';
import { chromium } from 'playwright-core';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { APPS, GEIST, argumenty, chromiumCesta, KLICE, spolecne } from './_spolecne.mjs';

const arg = argumenty();
const klice = arg.jen ? [arg.jen] : KLICE;

const SPLASH = Object.fromEntries(KLICE.map(k => [k, { svetly: spolecne.apps[k].barvy.splashSvetly, tmavy: spolecne.apps[k].barvy.splashTmavy }]));
const PLAY_LOCALE = { cs: 'cs-CZ', 'en-US': 'en-US' };
const TEXTY = {
  managero: { cs: ['Managero', 'Směny, sklad a uzávěrky na jednom místě'], 'en-US': ['Managero', 'Shifts, stock and closings in one place'] },
  client: { cs: ['Managero client', 'Karta, rezervace a objednávky od stolu'], 'en-US': ['Managero client', 'Loyalty card, booking and table orders'] },
};
const svgOf = (app) => readFileSync(`${APPS}/_shared/assets/src/${app}.svg`);
// Skleněný render tam, kde se ikona ukazuje celá (iOS, Play, splash); vektor jako záloha.
const heroOf = (app) => existsSync(`${APPS}/_shared/assets/src/${app}-hero.png`)
  ? readFileSync(`${APPS}/_shared/assets/src/${app}-hero.png`) : null;

const browser = await chromium.launch({ executablePath: chromiumCesta() });
try {
  for (const app of klice) {
    const out = `${APPS}/${app}/assets`;
    mkdirSync(`${out}/android`, { recursive: true });
    const svg = svgOf(app);
    const hero = heroOf(app);
    // Plná ikona (s plochou): render, nebo vektor. `density` platí jen pro SVG.
    const plna = () => hero ? sharp(hero) : sharp(svg, { density: 96 });
    const bez = svg.toString().replace(/<rect width="120" height="120"[^>]*\/>/g, ''); // jen motiv, bez pozadí
    const pozadi = spolecne.apps[app].barvy.pozadiIkony;

    // iOS: plné pozadí, žádná alfa, žádné zaoblení.
    await plna().resize(1024, 1024).flatten({ background: '#000' }).removeAlpha().png().toFile(`${out}/icon-only.png`);

    // Android adaptivní ikona: popředí v kruhu 66 % + jednobarevné pozadí + monochrom.
    const motiv = async (px) => sharp(Buffer.from(bez), { density: 96 }).resize(px, px).png().toBuffer();
    const foreground = async (velikost, kruh) => sharp({ create: { width: velikost, height: velikost, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await motiv(kruh), gravity: 'center' }]).png().toBuffer();
    writeFileSync(`${out}/icon-foreground.png`, await foreground(1024, 676));
    await sharp({ create: { width: 1024, height: 1024, channels: 3, background: pozadi } }).png().toFile(`${out}/icon-background.png`);
    writeFileSync(`${out}/android/ic_launcher_foreground_432.png`, await foreground(432, 264));
    await sharp({ create: { width: 432, height: 432, channels: 3, background: pozadi } }).png().toFile(`${out}/android/ic_launcher_background_432.png`);
    // Monochrom: jen tvar z alfa kanálu popředí, černý (Android ho obarví podle tapety).
    const fg = await foreground(432, 264);
    const { data, info } = await sharp(fg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4) { data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; }
    await sharp(data, { raw: info }).png().toFile(`${out}/android/ic_launcher_monochrome_432.png`);

    // Launch screen: dlaždice uprostřed na barvě pozadí aplikace (světlé / tmavé).
    for (const [nazev, barva] of [['splash', SPLASH[app].svetly], ['splash-dark', SPLASH[app].tmavy]]) {
      const maska = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="560" height="560"><rect width="560" height="560" rx="125" fill="#fff"/></svg>');
      const tile = await plna().resize(560, 560).composite([{ input: maska, blend: 'dest-in' }]).png().toBuffer();
      await sharp({ create: { width: 2732, height: 2732, channels: 3, background: barva } })
        .composite([{ input: tile, gravity: 'center' }]).removeAlpha().png().toFile(`${out}/${nazev}.png`);
    }

    // Google Play: ikona 512 a feature graphic 1024×500 (obojí do metadat supply).
    await plna().resize(512, 512).flatten({ background: '#000' }).removeAlpha().png().toFile(`${out}/play-icon-512.png`);
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    const sablona = readFileSync(`${APPS}/_shared/feature-graphic.html`, 'utf8').replace('GEIST_URL', pathToFileURL(GEIST).href);
    const tmp = `${out}/.tmp-feature.html`;
    writeFileSync(tmp, sablona);
    for (const [loc, [t, s]] of Object.entries(TEXTY[app])) {
      const url = `${pathToFileURL(tmp)}?app=${app}&t=${encodeURIComponent(t)}&s=${encodeURIComponent(s)}&ikona=${encodeURIComponent(pathToFileURL(`${out}/icon-only.png`))}`;
      await p.goto(url); await p.waitForSelector('html[data-hotovo]');
      const buf = await p.screenshot({ type: 'png' });
      const soubor = `${out}/feature-graphic-${loc}.png`;
      await sharp(buf).flatten({ background: '#ffffff' }).removeAlpha().png({ compressionLevel: 9 }).toFile(soubor);
      const img = `${APPS}/play-store/${app}/metadata/android/${PLAY_LOCALE[loc]}/images`;
      mkdirSync(img, { recursive: true });
      copyFileSync(soubor, `${img}/featureGraphic.png`);
      copyFileSync(`${out}/play-icon-512.png`, `${img}/icon.png`);
    }
    await ctx.close();
    (await import('node:fs')).rmSync(tmp, { force: true });
    console.log('hotovo', app);
  }
} finally {
  await browser.close();
}
