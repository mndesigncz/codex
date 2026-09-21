#!/usr/bin/env node
// Krytí, které Tailwind nevygeneruje — třída, co v CSS vůbec nevznikne.
//
// `bg-[#16181A]/72` vypadá jako platná třída a v JSX si ho nikdo nevšimne.
// Jenže 72 není krok Tailwindovy škály krytí, takže se pravidlo nevyrobí
// a prvek zůstane průhledný. Nic nespadne, nic se nevypíše — jen tam, kde
// mělo být ztmavení, není nic.
//
// Naměřeno při přestavbě prodejní stránky: bílý text seděl na vypálené
// fotce s kontrastem 1,04 : 1, protože překryv v CSS neexistoval. Stejná
// chyba se pak našla ještě na dvanácti dalších místech v aplikaci —
// `/12` u zvýrazněných řádků v rozvrhu, v úkolech, v uzávěrkách a na obou
// nástěnkách. Zvýraznění se prostě nekreslilo a nikomu to nedošlo.
//
// Kdo potřebuje hodnotu mimo škálu, napíše ji do hranatých závorek:
// `bg-[#16181A]/[0.72]`. Tohle je povolené a kontrola to nechá být.

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// Výchozí škála krytí v Tailwindu 3: po pěti, plus 0 a 100.
const SKALA = new Set([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100]);

// Utility, které krytí za lomítkem přijímají. Rozšiřuje se podle potřeby;
// smysl má jen to, co nese barvu.
const UTILITY = 'bg|text|border|from|via|to|ring|ring-offset|fill|stroke|decoration|divide|outline|accent|caret|shadow|placeholder';

// Barva může být hranatá (`[#16181A]`, `[rgb(0,0,0)]`), pojmenovaná z palety
// (`red-500`, `ok-ink`) nebo klíčové slovo.
const BARVA = '\\[[^\\]\\s]+\\]|[a-z][a-z0-9]*(?:-[a-z0-9]+)*';
const VZOR = new RegExp(`(?:^|[\\s"'\`])((?:${UTILITY})-(?:${BARVA})\\/(\\d{1,3}))(?![\\w.[])`, 'g');

const soubory = execSync(
  "git ls-files 'app/**/*.tsx' 'app/**/*.ts' 'components/**/*.tsx' 'components/**/*.ts' 'lib/**/*.tsx'",
  { encoding: 'utf8' },
).split('\n').filter(Boolean);

const nalezy = [];
for (const f of soubory) {
  const text = readFileSync(f, 'utf8');
  const radky = text.split('\n');
  radky.forEach((radek, i) => {
    for (const m of radek.matchAll(VZOR)) {
      const krok = Number(m[2]);
      if (SKALA.has(krok)) continue;
      nalezy.push({ f, radek: i + 1, trida: m[1], krok });
    }
  });
}

if (nalezy.length) {
  console.error(`\nKrytí mimo škálu — ${nalezy.length} tříd(y), které Tailwind nevygeneruje:\n`);
  for (const n of nalezy) {
    const bliz = [...SKALA].reduce((a, b) => (Math.abs(b - n.krok) < Math.abs(a - n.krok) ? b : a));
    console.error(`  ${n.f}:${n.radek}  ${n.trida}   → použij /${bliz} nebo /[0.${String(n.krok).padStart(2, '0')}]`);
  }
  console.error('\nŠkála jde po pěti (0, 5, 10 … 95, 100). Cokoliv mezi tím musí být v hranatých závorkách.\n');
  process.exit(1);
}
console.log(`check-opacity-steps: ${soubory.length} souborů, žádné krytí mimo škálu.`);
