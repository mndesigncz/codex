// Kontrola podkladů pro App Store a Google Play: limity znaků, chybějící soubory, zakázané výrazy,
// rozměry a alfa kanál ikon a snímků.
//
//   node apps/scripts/kontrola-listingu.mjs              # varuje na {{zástupce}} a chybějící snímky
//   node apps/scripts/kontrola-listingu.mjs --release    # {{zástupce}}, málo snímků a chybějící grafika = chyba
//   node apps/scripts/kontrola-listingu.mjs --jen=apple|play
//
// Nezávisí na denní době ani na síti, běží v CI vedle testů (npm run obchody:kontrola nebo přímo node).
// Limity jsou z App Store Connect a Play Console k 2026; před odesláním je porovnej s aktuální nápovědou
// (Apple: Screenshot specifications, Google: Preview assets).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import sharp from 'sharp';
import { APPS, KLICE, argumenty, spolecne } from './_spolecne.mjs';

const arg = argumenty();
const RELEASE = !!arg.release;
const JEN = arg.jen;

const APPLE_LIM = { name: 30, subtitle: 30, promotional_text: 170, description: 4000, keywords: 100, release_notes: 4000 };
const APPLE_POVINNE = [...Object.keys(APPLE_LIM), 'support_url', 'privacy_url'];
const APPLE_LOCALES = ['cs', 'en-US'];
const PLAY_LOCALES = ['cs-CZ', 'en-US'];
const PLAY_LIM = { title: 30, short_description: 80, full_description: 4000 };

// Sady snímků pro App Store Connect (přesné rozměry; jiný rozměr Apple odmítne).
const APPLE_SADY = {
  'iPhone 6.9"': ['1320x2868', '1290x2796', '1260x2736'],
  'iPhone 6.5"': ['1284x2778', '1242x2688'],
  'iPad 13"': ['2064x2752', '2752x2064', '2048x2732', '2732x2048'],
};

// Zakázané výrazy. Cizí značky v listingu nemají co dělat (Apple 2.3.7, Google Metadata policy).
const SPOLECNE_ZAKAZ = [
  [/storyous|stripe|pangea/i, 'cizí značka'],
  [/nejlepší|číslo 1|#1|\bbest\b|\bno\. ?1\b/i, 'superlativ'],
  [/\p{Extended_Pictographic}/u, 'emoji'],
];
const APPLE_ZAKAZ = [[/android|google play|play store|windows/i, 'jiná platforma'], ...SPOLECNE_ZAKAZ];
const PLAY_ZAKAZ = [[/\b(?:ios|iphone|ipad|apple|app store|testflight)\b/i, 'jiná platforma'], ...SPOLECNE_ZAKAZ];
// Cena a předplatné: v listingu obalu nemá co dělat (Apple 3.1.1, Google Payments policy: žádné navádění k platbě).
const CENA = /(\d\s?(kč|€|eur|czk|usd)\b|zdarma|\bfree\b|\bcena\b|\bceny\b|\bprice\b|sleva|slevy|discount|předplatné|subscription|\bpro\/max\b)/i;

let chyb = 0, varov = 0;
const err = (m) => { chyb++; console.log('  CHYBA   ', m); };
const warn = (m) => { varov++; console.log('  varování', m); };
const strict = (m) => (RELEASE ? err : warn)(m);
const rd = (f) => readFileSync(f, 'utf8').replace(/\n$/, '');
const delka = (t) => [...t].length;

async function rozmery(soubor) {
  const m = await sharp(soubor).metadata();
  return { w: m.width, h: m.height, alfa: !!m.hasAlpha, kanaly: m.channels, bytes: statSync(soubor).size, format: m.format };
}
const soubory = (dir) => (existsSync(dir) ? readdirSync(dir).filter(f => /\.(png|jpe?g)$/i.test(f)).sort() : []);

// ------------------------------------------------------------------------------------------------
async function ikony(app) {
  const A = `${APPS}/${app}/assets`;
  const ik = `${A}/icon-only.png`;
  if (!existsSync(ik)) return strict(`chybí apps/${app}/assets/icon-only.png (node apps/scripts/ikony.mjs)`);
  const m = await rozmery(ik);
  if (m.w !== 1024 || m.h !== 1024) err(`ikona iOS ${m.w}x${m.h}, má být 1024x1024`);
  if (m.alfa) err('ikona iOS (icon-only.png) má alfa kanál, Apple ji odmítne');
  const fg = `${A}/icon-foreground.png`;
  if (existsSync(fg)) { const f = await rozmery(fg); if (f.w !== 1024 || f.h !== 1024) err(`icon-foreground ${f.w}x${f.h}`); if (!f.alfa) err('icon-foreground má být průhledné'); }
  for (const [soubor, w, h, alfa] of [['android/ic_launcher_foreground_432.png', 432, 432, true], ['android/ic_launcher_background_432.png', 432, 432, false], ['android/ic_launcher_monochrome_432.png', 432, 432, true],
    ['play-icon-512.png', 512, 512, false], ['splash.png', 2732, 2732, false], ['splash-dark.png', 2732, 2732, false], ['feature-graphic-cs.png', 1024, 500, false], ['feature-graphic-en-US.png', 1024, 500, false]]) {
    const p = `${A}/${soubor}`;
    if (!existsSync(p)) { strict(`chybí ${soubor}`); continue; }
    const x = await rozmery(p);
    if (x.w !== w || x.h !== h) err(`${soubor} ${x.w}x${x.h}, má být ${w}x${h}`);
    if (!alfa && x.alfa) err(`${soubor} nesmí mít alfa kanál`);
    if (/play-icon/.test(soubor) && x.bytes > 1024 * 1024) err('ikona Play > 1 MB');
  }
}

// ------------------------------------------------------------------------------------------------
async function apple(app) {
  console.log(`\nApp Store: ${app}`);
  const M = `${APPS}/app-store/${app}/metadata`;
  for (const f of ['primary_category', 'secondary_category', 'copyright']) {
    if (!existsSync(`${M}/${f}.txt`)) { err(`chybí ${f}.txt`); continue; }
    if (/\{\{/.test(rd(`${M}/${f}.txt`))) strict(`${f}.txt obsahuje {{zástupce}}`);
  }
  const texty = {};
  for (const loc of APPLE_LOCALES) {
    const D = `${M}/${loc}`;
    if (!existsSync(D)) { err(`chybí locale ${loc}`); continue; }
    texty[loc] = {};
    for (const f of APPLE_POVINNE) {
      const p = `${D}/${f}.txt`;
      if (!existsSync(p)) { err(`${loc}/${f}.txt chybí`); continue; }
      const t = rd(p); texty[loc][f] = t;
      if (!t.trim()) err(`${loc}/${f} je prázdné`);
      if (APPLE_LIM[f] && delka(t) > APPLE_LIM[f]) err(`${loc}/${f}: ${delka(t)} > ${APPLE_LIM[f]}`);
      if (/\{\{/.test(t)) strict(`${loc}/${f} obsahuje {{zástupce}}`);
      for (const [re, proc] of APPLE_ZAKAZ) if (re.test(t)) err(`${loc}/${f}: ${proc} (${re})`);
      if (['name', 'subtitle', 'keywords', 'promotional_text'].includes(f) && CENA.test(t)) err(`${loc}/${f}: cena nebo předplatné v krátkém textu`);
      if (/_url$/.test(f)) {
        if (!/^https:\/\/\S+$/.test(t)) err(`${loc}/${f}: musí být https URL`);
        else if (new URL(t).hostname !== spolecne.domena) err(`${loc}/${f}: hostitel ${new URL(t).hostname}, má být ${spolecne.domena}`);
      }
    }
    const kw = texty[loc].keywords || '';
    if (/,\s|\s,/.test(kw)) err(`${loc}/keywords: mezera kolem čárky zbytečně žere znaky`);
    const slova = new Set(`${texty[loc].name} ${texty[loc].subtitle}`.toLowerCase().split(/[\s,]+/));
    const dup = kw.split(',').filter(k => slova.has(k.toLowerCase()));
    if (dup.length) warn(`${loc}/keywords opakují slova z názvu nebo podtitulu: ${dup.join(', ')}`);
  }
  if (texty.cs && texty['en-US'] && texty.cs.name !== texty['en-US'].name) warn('název se v cs a en-US liší');
  const nazev = spolecne.apps[app].nazev;
  if (texty.cs && texty.cs.name !== nazev) err(`name.txt (${texty.cs.name}) se liší od apps.json (${nazev})`);

  const notes = `${M}/review_information/notes.txt`;
  if (!existsSync(notes)) err('chybí metadata/review_information/notes.txt');
  else {
    const n = readFileSync(notes, 'utf8');
    if (n.length > 4000) err('review_information/notes.txt > 4000 znaků');
    if (/\{\{/.test(n) && RELEASE) warn('review_information/notes.txt má {{zástupce}}: doplní je Fastfile z prostředí (lane *_listing), ne ručně');
    if (/(password|heslo)[ \t]*[:=][ \t]*\S+/i.test(n.replace(/\{\{[A-Z_]+\}\}/g, ''))) err('review_information/notes.txt obsahuje heslo');
  }

  for (const loc of APPLE_LOCALES) {
    const S = `${APPS}/app-store/${app}/screenshots/${loc}`;
    const s = soubory(S);
    if (!s.length) { strict(`${loc}: žádné snímky App Store`); continue; }
    const pocty = {};
    for (const f of s) {
      const m = await rozmery(`${S}/${f}`);
      const r = `${m.w}x${m.h}`;
      const sada = Object.keys(APPLE_SADY).find(k => APPLE_SADY[k].includes(r));
      if (!sada) { err(`${loc}/${f}: rozměr ${r} není v žádné sadě`); continue; }
      if (m.alfa) err(`${loc}/${f}: má alfa kanál`);
      pocty[sada] = (pocty[sada] || 0) + 1;
    }
    for (const [sada, n] of Object.entries(pocty)) {
      if (n > 10) err(`${loc}: ${sada} má ${n} snímků, max 10`);
      if (n < 3) strict(`${loc}: ${sada} má ${n} snímků, doporučeno 3 až 10`);
    }
    console.log(`  ${loc}: ${Object.entries(pocty).map(([k, v]) => `${k} x${v}`).join(', ')}`);
  }
  const PV = `${APPS}/app-store/${app}/previews`;
  if (existsSync(PV)) for (const f of readdirSync(PV).filter(f => /\.(mp4|mov|m4v)$/i.test(f))) {
    if (statSync(`${PV}/${f}`).size > 500 * 1024 * 1024) err(`previews/${f} > 500 MB`);
  }
}

// ------------------------------------------------------------------------------------------------
async function play(app) {
  console.log(`\nGoogle Play: ${app}`);
  for (const loc of PLAY_LOCALES) {
    const D = `${APPS}/play-store/${app}/metadata/android/${loc}`;
    if (!existsSync(D)) { err(`chybí locale ${loc}`); continue; }
    const t = {};
    for (const [f, lim] of Object.entries(PLAY_LIM)) {
      const p = `${D}/${f}.txt`;
      if (!existsSync(p)) { err(`${loc}/${f}.txt chybí`); continue; }
      t[f] = rd(p);
      if (!t[f].trim()) err(`${loc}/${f} je prázdné`);
      if (delka(t[f]) > lim) err(`${loc}/${f}: ${delka(t[f])} > ${lim}`);
      if (/\{\{/.test(t[f])) strict(`${loc}/${f} obsahuje {{zástupce}}`);
      for (const [re, proc] of PLAY_ZAKAZ) if (re.test(t[f])) err(`${loc}/${f}: ${proc} (${re})`);
      if (CENA.test(t[f])) err(`${loc}/${f}: cena, sleva nebo předplatné (Google: žádné navádění k platbě a slibování slev)`);
    }
    if (t.title && t.title === t.title.toUpperCase() && /[A-ZÁ-Ž]{3,}/.test(t.title)) err(`${loc}/title: samá velká písmena`);
    const ch = `${D}/changelogs/default.txt`;
    if (!existsSync(ch)) err(`${loc}/changelogs/default.txt chybí`);
    else if (delka(rd(ch)) > 500) err(`${loc}/changelogs/default.txt > 500 znaků`);
    const I = `${D}/images`;
    const ik = `${I}/icon.png`;
    if (!existsSync(ik)) strict(`${loc}: chybí images/icon.png (node apps/scripts/ikony.mjs)`);
    else { const m = await rozmery(ik); if (m.w !== 512 || m.h !== 512) err(`${loc}/icon.png ${m.w}x${m.h}, má být 512x512`); if (m.bytes > 1024 * 1024) err(`${loc}/icon.png > 1 MB`); }
    const fgr = `${I}/featureGraphic.png`;
    if (!existsSync(fgr)) strict(`${loc}: chybí images/featureGraphic.png`);
    else { const m = await rozmery(fgr); if (m.w !== 1024 || m.h !== 500) err(`${loc}/featureGraphic ${m.w}x${m.h}, má být 1024x500`); if (m.alfa) err(`${loc}/featureGraphic má alfa kanál`); }
    for (const [slozka, minimum] of [['phoneScreenshots', 2], ['sevenInchScreenshots', 0], ['tenInchScreenshots', 0]]) {
      const s = soubory(`${I}/${slozka}`);
      if (!s.length) { if (minimum) strict(`${loc}: ${slozka} je prázdná (minimum ${minimum})`); else warn(`${loc}: ${slozka} chybí (doporučeno pro velké obrazovky)`); continue; }
      if (s.length < 2 || s.length > 8) (s.length > 8 ? err : strict)(`${loc}/${slozka}: ${s.length} snímků, Google chce 2 až 8`);
      for (const f of s) {
        const m = await rozmery(`${I}/${slozka}/${f}`);
        const kratsi = Math.min(m.w, m.h), delsi = Math.max(m.w, m.h);
        if (kratsi < 320 || delsi > 3840) err(`${loc}/${slozka}/${f}: strany ${m.w}x${m.h} mimo 320 až 3840 px`);
        if (delsi > 2 * kratsi) err(`${loc}/${slozka}/${f}: delší strana je víc než 2x kratší (${m.w}x${m.h})`);
        if (m.bytes > 8 * 1024 * 1024) err(`${loc}/${slozka}/${f}: > 8 MB`);
        if (m.alfa) err(`${loc}/${slozka}/${f}: má alfa kanál`);
      }
      console.log(`  ${loc}/${slozka}: ${s.length}x`);
    }
  }
}

// ------------------------------------------------------------------------------------------------
for (const app of KLICE) {
  await ikony(app).catch(e => err(`ikony ${app}: ${e.message}`));
  if (JEN !== 'play') await apple(app);
  if (JEN !== 'apple') await play(app);
}
// Jednotná ID: fastlane a manifesty čtou apps.json, ale texty a dokumentace je mají napsané ručně.
for (const k of KLICE) {
  const a = spolecne.apps[k];
  if (a.bundleId !== a.applicationId) err(`${k}: bundleId a applicationId se liší`);
}
console.log(`\n${chyb} chyb, ${varov} varování`);
process.exit(chyb ? 1 : 0);
