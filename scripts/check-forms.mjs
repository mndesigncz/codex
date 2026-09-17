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

if (hits.length) {
  console.error('\nTlačítko uvnitř <form> musí mít napsáno, čím je: type="submit" nebo type="button".');
  console.error('Bez toho je odesílací — „Zrušit" formulář odešle a nikdo neví proč.\n');
  for (const h of hits) console.error('  ' + h);
  console.error(`\n${hits.length} ${hits.length === 1 ? 'tlačítko' : 'tlačítek'} k doplnění.\n`);
  process.exit(1);
}
console.log('check-forms: v pořádku — tlačítka ve formulářích mají uvedený typ.');
