#!/usr/bin/env node
// Texty prodejní stránky smějí tvrdit jen to, co o produktu platí.
//
// Prodejní web láká na vymyšlená čísla a citace nejsnáz: „tisíce podniků", „5 hvězdiček",
// „za 5 minut". Nic z toho se tu nedá doložit, a kdo to na stránku jednou napíše, už to
// nikdo nezkontroluje. Kontrola hlídá, aby se to nedostalo do kódu prodejní stránky:
//  1. žádné vymyšlené hodnocení ani svědectví (`aggregateRating`, `review`, „recenze",
//     „hodnocení", „tisíce", „nejlepší", „za 5 minut"),
//  2. žádné pomlčky jako interpunkce v textech (— a –; spojovník v rozsahu 8-16 je v pořádku),
//  3. číslo s podstatným jménem se nepíše napevno („30 dní"), ale přes lib/czech.ts
//     (czCount, czForm): po změně čísla by zůstala věta, která nesedí.
// Komentáře se ignorují: ty vysvětlují PROČ a smějí o zakázaných věcech mluvit.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const KOREN = new URL('../', import.meta.url).pathname;
const SOUBORY = [];
const projdi = (dir) => {
  for (const jmeno of readdirSync(dir)) {
    const cesta = join(dir, jmeno);
    if (statSync(cesta).isDirectory()) { projdi(cesta); continue; }
    if (/\.(ts|tsx)$/.test(jmeno) && !/\.generated\.ts$/.test(jmeno)) SOUBORY.push(cesta);
  }
};
projdi(KOREN + 'components/landing');
SOUBORY.push(KOREN + 'components/Landing.tsx');

// Komentáře pryč, ale řádky zůstanou (čísla řádků v hlášení musí sedět).
const bezKomentaru = (kod) => kod
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/.*$/gm, (m, p) => p + ' '.repeat(m.length - p.length));

const PRAVIDLA = [
  { re: /aggregateRating|"review"|'review'|\bAggregateOffer\b/, proc: 'hodnocení ani recenze, které neexistují, se do strukturovaných dat nepíšou' },
  { re: /recenz|hodnocen|tisíc|nejlepší|číslo jedna|\b5 minut|pět minut/i, proc: 'vymyšlený sociální důkaz nebo slib, který se nedá doložit' },
  { re: /[—–]/, proc: 'pomlčka jako interpunkce v textu (dvojtečka, čárka nebo nová věta)' },
  { re: /(['"`>]\s*|\s)\d+\s+(dní|dny|den|lidí|člověka|směn|směny|směna|položek|položky|měsíců|měsíce)\b/, proc: 'číslo s podstatným jménem napevno, patří přes czCount/czForm z lib/czech.ts' },
];

const nalezy = [];
for (const soubor of SOUBORY) {
  const radky = bezKomentaru(readFileSync(soubor, 'utf8')).split('\n');
  radky.forEach((r, i) => {
    // Importy a názvy typů nejsou text pro návštěvníka.
    if (/^\s*import\s/.test(r)) return;
    for (const { re, proc } of PRAVIDLA) if (re.test(r)) nalezy.push(`${relative(KOREN, soubor)}:${i + 1}  ${proc}\n      ${r.trim().slice(0, 120)}`);
  });
}

if (nalezy.length) {
  console.error('\nText prodejní stránky tvrdí víc, než se dá doložit, nebo porušuje pravidla textu:\n');
  for (const n of nalezy) console.error('  ' + n);
  console.error(`\n${nalezy.length} ${nalezy.length === 1 ? 'místo' : 'míst'} k opravě.\n`);
  process.exit(1);
}
console.log(`Texty prodejní stránky: ${SOUBORY.length} souborů bez vymyšleného sociálního důkazu a bez pomlček v textu.`);
