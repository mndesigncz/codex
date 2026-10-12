#!/usr/bin/env node
// Uvnitř <form> je tlačítko bez `type` odesílací tlačítko.
//
// To je v HTML výchozí chování a je to past: do formuláře se přidá „Zrušit",
// „+ možnost" nebo „Smazat řádek", ono nemá `type="button"`, a první klik na
// něj formulář odešle. Projeví se to až v provozu — a vypadá to jako duch,
// protože ten samý kód mimo <form> funguje správně.
//
// Tahle kontrola vznikla ve chvíli, kdy se do aplikace přidávalo Enter =
// odeslat: zabalit dialog do <form> je správně, ale vytváří přesně tuhle
// past pro každé tlačítko uvnitř.
//
// Pravidlo: uvnitř <form> má každé <button> napsáno, čím je —
// type="submit" nebo type="button". Mimo <form> se nehlídá nic.
//
// Druhé pravidlo (audit kola 6, Z12): pole na dotykovém zařízení má aspoň
// 16 px, jinak Safari na iPhonu při fokusu přiblíží stránku a nechá ji
// zvětšenou. Písmo zvedá globals.css v `@media (pointer: coarse)` MIMO
// @layer (uvnitř vrstvy by ho utilita `text-sm` přebila): `.field`, holé pole
// s malou utilitou (`text-xs`, `text-sm`, `text-[11px]`–`text-[15px]`) a holé
// pole bez třídy písma (zdědí aspoň 16 px); malé utility i v important
// podobě (`!text-[13px]`). Hlídá se, že ta pravidla v CSS jsou, a že žádné
// <input>/<select>/<textarea> v kódu nemá malé písmo, na které nedosáhnou —
// jiná malá velikost (`text-[10px]`, `text-[0.875rem]`) bez třídy `field`,
// nebo taková velikost s `!` (important přebije i `.field`).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['app', 'components'];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules' && name !== '.next') yield* walk(p); }
    else if (/\.tsx$/.test(name)) yield p;
  }
}

/** Rozsahy znaků uvnitř <form …> … </form>. */
function formRanges(src) {
  const ranges = [];
  const open = /<form\b/g;
  let m;
  while ((m = open.exec(src))) {
    const end = src.indexOf('</form>', m.index);
    if (end === -1) continue;
    ranges.push([m.index, end]);
  }
  return ranges;
}

const hits = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const src = readFileSync(file, 'utf8');
    const ranges = formRanges(src);
    if (ranges.length === 0) continue;
    const rel = relative('.', file);

    const btn = /<button\b/g;
    let m;
    while ((m = btn.exec(src))) {
      if (!ranges.some(([a, b]) => m.index > a && m.index < b)) continue;
      // Otevírací značka tlačítka může být přes víc řádků — vezmeme ji až po `>`.
      const close = src.indexOf('>', m.index);
      const tag = src.slice(m.index, close === -1 ? m.index + 400 : close + 1);
      if (/\btype=/.test(tag)) continue;
      const line = src.slice(0, m.index).split('\n').length;
      hits.push(`${rel}:${line}  ${tag.replace(/\s+/g, ' ').slice(0, 96)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Pole na dotyku ≥ 16 px
/** Velikost písma pod 16 px zapsaná utilitou (i s `!` a s responzivní předponou). */
const MALE_PISMO = /(?<![\w-])(!?)text-(xs|sm|\[(?:1[0-5]|\d)(?:\.\d+)?px\]|\[0?\.\d+rem\])(?![\w-])/g;
/** Malé utility, které pravidlo 2 v globals.css zvedá na každém poli (i jako `!text-…`). */
const POKRYTE = new Set(['xs', 'sm', '[11px]', '[12px]', '[13px]', '[14px]', '[15px]']);

/** Otevírací JSX značka od `<` po její `>` — přes víc řádků, `=>` v atributu ani `>` v řetězci ji neutne. */
function oteviraciZnacka(src, od) {
  let hloubka = 0, uvozovka = null;
  for (let i = od + 1; i < src.length; i++) {
    const c = src[i];
    if (uvozovka) { if (c === '\\') i++; else if (c === uvozovka) uvozovka = null; continue; }
    if (c === '"' || c === "'" || c === '`') { uvozovka = c; continue; }
    if (c === '{') hloubka++;
    else if (c === '}') hloubka--;
    else if (c === '>' && hloubka === 0) return src.slice(od, i + 1);
  }
  return src.slice(od, od + 400);
}

const poleHits = [];
{
  const css = readFileSync('app/globals.css', 'utf8');
  const bezKomentaru = css.replace(/\/\*[\s\S]*?\*\//g, c => ' '.repeat(c.length));
  const blok = /@media \(pointer: coarse\)\s*\{/g;
  let obsah = null, zacatek = -1, x;
  while ((x = blok.exec(bezKomentaru))) {
    // Obsah bloku po párovou závorku.
    let h = 1, i = x.index + x[0].length;
    for (; i < bezKomentaru.length && h > 0; i++) { if (bezKomentaru[i] === '{') h++; else if (bezKomentaru[i] === '}') h--; }
    const telo = bezKomentaru.slice(x.index + x[0].length, i - 1);
    if (/(^|[\s,}])\.field\s*\{\s*font-size:\s*1rem/.test(telo)) { obsah = telo; zacatek = x.index; break; }
  }
  if (obsah == null) poleHits.push('app/globals.css  chybí `@media (pointer: coarse) { .field { font-size: 1rem } … }`');
  else {
    const chybi = [];
    for (const u of POKRYTE) {
      const sel = '.text-' + u.replace(/[[\]]/g, c => '\\' + c);
      if (!obsah.includes(sel)) chybi.push(sel);
    }
    for (const u of POKRYTE) {
      const sel = '.\\!text-' + u.replace(/[[\]]/g, c => '\\' + c);
      if (!obsah.includes(sel)) chybi.push(sel);
    }
    if (chybi.length || !/:is\(input, select, textarea\):is\([^)]*\.text-[\s\S]*?font-size:\s*1rem;/.test(obsah)
      || !/:is\(input, select, textarea\):is\([^{]*\.\\!text-[^{]*\{\s*font-size:\s*1rem\s*!important/.test(obsah)) {
      poleHits.push(`app/globals.css  pravidla pro pole s malou utilitou (:is(input, select, textarea):is(…), i s !important) chybí nebo nemají ${chybi.join(' ')}`);
    }
    if (!/input:where\([\s\S]*?\),\s*select,\s*textarea\s*\{\s*font-size:\s*max\(1rem,\s*100%\)/.test(obsah)) poleHits.push('app/globals.css  chybí pravidlo pro holé pole bez třídy písma (input:where(…), select, textarea { font-size: max(1rem, 100%) })');
    // Uvnitř @layer? Spočítají se otevřené bloky @layer před pravidlem.
    const pred = bezKomentaru.slice(0, zacatek);
    let hloubka = 0, vLayeru = 0;
    const tok = /@layer\b[^{;]*\{|\{|\}/g;
    let y;
    while ((y = tok.exec(pred))) {
      if (y[0].startsWith('@layer')) { hloubka++; if (!vLayeru) vLayeru = hloubka; }
      else if (y[0] === '{') hloubka++;
      else { if (vLayeru === hloubka) vLayeru = 0; hloubka--; }
    }
    if (vLayeru > 0) poleHits.push('app/globals.css  pravidla 16 px pro pole jsou uvnitř @layer — utilita text-sm je přebije; patří mimo vrstvu');
  }
  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const src = readFileSync(file, 'utf8');
      const rel = relative('.', file);
      const tag = /<(input|select|textarea)\b/g;
      let m2;
      while ((m2 = tag.exec(src))) {
        const znacka = oteviraciZnacka(src, m2.index);
        // Zaškrtávátka, přepínače a posuvníky písmo nemají.
        if (/\btype=["'{]*(checkbox|radio|range|hidden|file|color)\b/.test(znacka)) continue;
        // Třídy z řetězců i šablon v className (proměnné jako `inputClass` se tu nevidí — ty jsou `.field`).
        const cls = (/\bclassName=(\{[\s\S]*\}|"[^"]*"|'[^']*')/.exec(znacka)?.[1] ?? '');
        const jeField = /(?<![\w-])field(?![\w-])/.test(cls) || /\$\{inputClass\}/.test(cls);
        // Pokryté utility zvedá pravidlo 2 (obyčejné i important); jiné malé velikosti jen `.field` a jen bez `!`.
        const spatne = [...cls.matchAll(MALE_PISMO)].filter(([, imp, vel]) => !POKRYTE.has(vel) && (imp === '!' || !jeField));
        if (!spatne.length) continue;
        const line = src.slice(0, m2.index).split('\n').length;
        poleHits.push(`${rel}:${line}  ${spatne.map(s => s[0]).join(' ')}  ${znacka.replace(/\s+/g, ' ').slice(0, 80)}`);
      }
    }
  }
}

if (poleHits.length) {
  console.error('\nPole na dotykovém zařízení musí mít aspoň 16 px, jinak iPhone při fokusu přiblíží stránku.');
  console.error('Písmo zvedá globals.css (`@media (pointer: coarse)`): `.field`, holé pole s text-xs/text-sm/text-[11–15px] a holé pole bez třídy.');
  console.error('Mimo dosah je `!text-sm` (important) a jiná malá velikost na poli bez `field` — použij `field`, nebo jednu z pokrytých utilit.\n');
  for (const h of poleHits) console.error('  ' + h);
  console.error('');
  process.exit(1);
}

if (hits.length) {
  console.error('\nTlačítko uvnitř <form> musí mít napsáno, čím je: type="submit" nebo type="button".');
  console.error('Bez toho je odesílací — „Zrušit" formulář odešle a nikdo neví proč.\n');
  for (const h of hits) console.error('  ' + h);
  console.error(`\n${hits.length} ${hits.length === 1 ? 'tlačítko' : 'tlačítek'} k doplnění.\n`);
  process.exit(1);
}
console.log('check-forms: v pořádku — tlačítka ve formulářích mají uvedený typ a pole mají na dotyku 16 px.');
