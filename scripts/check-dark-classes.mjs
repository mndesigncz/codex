#!/usr/bin/env node
// Třída, která si nastaví barvu textu, a zapomene na tmavý režim.
//
// Tmavý režim přebarvuje text plošným pravidlem pro `.text-black/NN`.
// Na třídu, která si barvu nastavuje sama — `.seg-off`, `.btn-icon`,
// `.cat-1` — to pravidlo nedosáhne, protože jméno třídy je jiné. Text
// v ní zůstane inkoustový i na tmavém podkladu.
//
// Neaktivní záložky takhle vycházely na 1,03 : 1: „Přehled", „Moje směny"
// ani „Uzávěrka" nebyly v tmavém režimu vidět vůbec. Předtím stejně vypadl
// stupeň /65 u štítků směn. Je to opakovaná chyba, ne náhoda.
//
// Výjimky jsou plochy, které zůstávají světlé i v tmavém režimu — tam je
// tmavý text správně a přebarvit ho by byla chyba opačným směrem.

import { readFileSync } from 'node:fs';

const css = readFileSync('app/globals.css', 'utf8');

// Zůstávají světlé i v tmavém režimu, takže inkoust je na nich v pořádku.
const SVETLE_OSTROVY = new Set([
  'on-accent', 'on-accent-muted', 'panel-light', 'btn-accent', 'chip-ink',
]);

// Barvy odvozené od inkoustu a limetky — ty, co se v tmavém režimu mění.
const INKOUST = /color:\s*(rgba\(22,\s*24,\s*26|#16181A)/i;

const svetle = new Map();
for (const m of css.matchAll(/^\.([a-zA-Z0-9_\\\-]+)[^{]*\{([^}]*)\}/gm)) {
  const [, name, body] = m;
  if (name.includes('\\')) continue;            // utilita s lomítkem řeší plošné pravidlo
  if (SVETLE_OSTROVY.has(name)) continue;
  if (INKOUST.test(body)) {
    const line = css.slice(0, m.index).split('\n').length;
    svetle.set(name, line);
  }
}

const tmave = new Set(
  [...css.matchAll(/:root\[data-theme="dark"\][^{]*?\.([a-zA-Z0-9_\\\-]+)/g)].map(m => m[1]),
);

const chybi = [...svetle.entries()].filter(([name]) => !tmave.has(name));

if (chybi.length) {
  console.error(`\n${chybi.length} tříd nastavuje inkoustový text a nemá tmavou variantu:`);
  console.error('V tmavém režimu zůstanou černé na černém.\n');
  for (const [name, line] of chybi) console.error(`  app/globals.css:${line}  .${name}`);
  console.error('\nPřidej `:root[data-theme="dark"] .<třída> { color: … }`,');
  console.error('nebo ji zapiš mezi světlé ostrovy v tomhle skriptu, když má zůstat tmavá.\n');
  process.exit(1);
}
console.log('check-dark-classes: v pořádku — každá barva textu má i tmavou variantu.');
