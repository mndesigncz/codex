#!/usr/bin/env node
// Akce přilepená k pravému kraji uvnitř zalamovaného řádku.
//
// Na monitoru to vypadá správně: nadpis vlevo, tlačítko vpravo. Na 390 px
// se řádek zalomí, tlačítko spadne na vlastní řádek — a `ml-auto` ho tam
// drží u pravého kraje, kde nelícuje s ničím. Ve screenshotech z mobilu
// to byl nejčastější nález: „Oznámit týmu", „Připnout oznámení",
// „Nový úkol", „Ohodnotit" — všechno viselo samo v pravé půlce prázdného
// řádku.
//
// Pravidlo: v zalamovaném řádku (`flex-wrap`) smí být `ml-auto` jen
// s breakpointem (`sm:ml-auto`). Na telefonu pak akce lícuje s levým
// okrajem nadpisu; hlavní akce navíc dostává `w-full sm:w-auto`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const KOREN = ['components', 'app'];
const souboryTsx = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? souboryTsx(p) : (f.endsWith('.tsx') ? [p] : []);
});

const HOLE_ML = /(?<![\w:-])ml-auto(?![\w-])/;
const nalezy = [];

for (const soubor of KOREN.flatMap(souboryTsx)) {
  const txt = readFileSync(soubor, 'utf8');
  for (const m of txt.matchAll(/<(?:button|a|Link|Button)\b[\s\S]*?(?:\/>|>)/g)) {
    const tag = m[0];
    if (tag.length > 1200) continue;
    const tridy = [...tag.matchAll(/className=(?:"([^"]*)"|\{`((?:[^`\\]|\\.)*)`\})/g)]
      .map((c) => c[1] ?? c[2] ?? '').join(' ');
    if (!HOLE_ML.test(tridy)) continue;
    // Zalamuje se řádek, do kterého tlačítko patří? Hledá se nejbližší
    // předcházející kontejner s `flex`. Nezalamovaná lišta (patička okna,
    // panel nástrojů) `ml-auto` mít smí — tam se nic nikam nezlomí.
    const pred = txt.slice(0, m.index);
    const kontejnery = [...pred.matchAll(/className="([^"]*\bflex\b[^"]*)"/g)];
    const posledni = kontejnery.length ? kontejnery[kontejnery.length - 1][1] : '';
    if (!/\bflex-wrap\b/.test(posledni)) continue;
    nalezy.push(`${soubor}:${pred.split('\n').length}  ${tridy.match(HOLE_ML)[0]} v zalamovaném řádku`);
  }
}

if (nalezy.length) {
  console.error('Akce visí u pravého kraje zalomeného řádku (na telefonu nelícuje s ničím):\n');
  for (const n of nalezy) console.error('  ' + n);
  console.error('\nPoužij `sm:ml-auto`. Hlavní akci navíc `w-full sm:w-auto justify-center`.');
  process.exit(1);
}
console.log('Zarovnání akcí na telefonu v pořádku (žádné ml-auto v zalamovaném řádku).');
