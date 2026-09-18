#!/usr/bin/env node
// Hlavička dnů, která se sází ručně.
//
// Podnik si v Nastavení → Tým volí, jestli mu týden začíná pondělím, nebo
// nedělí. Šest komponent si ale pořadí počítalo samo a dvě z nich to
// nastavení ignorovaly: rozvrh i dostupnost měly pondělí natvrdo. Podnik
// s nedělním týdnem tak plánoval směny v mřížce, která začínala jinde než
// kalendář, ve kterém je pak četl.
//
// Pravidlo: seřazená hlavička dnů se bere z `zkratkyDnu(zacatek)`.
//
// Co se tímhle NEHLÍDÁ, protože to není pořadí sloupců:
//   `WD[d.getDay()]` — vyhledání jména dne pro konkrétní datum,
//   `hours[String(d)]` — otevírací doba s klíčem 0 = pondělí,
//   `.map((label, d) => …)` — editor, kde index JE uložená data
//      (otevírací doba, dny opakování připomínky).
// Všechno tohle je správně a se začátkem týdne se nemění. Kdyby se to
// „sjednotilo“, posunuly by se podnikům otevírací doba i připomínky o den.
//
// Rozlišuje se podle počtu parametrů: hlavička mapuje jen hodnotu,
// datový editor bere i index.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const KOREN = ['components', 'app'];
const souboryTsx = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? souboryTsx(p) : (f.endsWith('.tsx') ? [p] : []);
});

// Pole zkratek dnů, ať začíná pondělím nebo nedělí.
const POLE = /\[\s*'(?:Po|Ne)'\s*,\s*'(?:Út|Po)'[^\]]*\]/;

const nalezy = [];
for (const soubor of KOREN.flatMap(souboryTsx)) {
  const txt = readFileSync(soubor, 'utf8');
  const radky = txt.split('\n');

  radky.forEach((radek, i) => {
    // a) Pole zapsané rovnou a hned mapované do JSX.
    if (POLE.test(radek) && /\]\s*\.map\(\s*\(?\s*[A-Za-z_$][\w$]*\s*\)?\s*=>/.test(radek)) {
      nalezy.push(`${soubor}:${i + 1} — hlavička dnů psaná ručně; použij zkratkyDnu(zacatek)`);
      return;
    }
    // b) Pojmenovaná konstanta, která se někde v souboru mapuje.
    const m = radek.match(/const\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=]+)?=\s*(\[\s*'(?:Po|Ne)'[^\]]*\])/);
    if (!m) return;
    const jmeno = m[1];
    // Jen jednoparametrové mapování = hlavička. S indexem jde o data.
    if (new RegExp(`\\b${jmeno}\\s*\\.map\\(\\s*\\(?\\s*[A-Za-z_$][\\w$]*\\s*\\)?\\s*=>`).test(txt)) {
      nalezy.push(`${soubor}:${i + 1} — \`${jmeno}\` se mapuje jako hlavička; použij zkratkyDnu(zacatek)`);
    }
  });
}

if (nalezy.length) {
  console.error('Seřazená hlavička dnů se nesází ručně:\n');
  for (const n of nalezy) console.error('  ' + n);
  console.error('\nPořadí určuje nastavení podniku — `zkratkyDnu(zacatek)` z lib/week.');
  process.exit(1);
}
console.log('check-week-start: v pořádku — hlavičky dnů berou pořadí z nastavení podniku.');
