#!/usr/bin/env node
// Hledání v české aplikaci musí najít „mražená" i na „mrazena".
//
// `name.toLowerCase().includes(dotaz)` to neudělá: `ž` a `z` jsou dva různé
// znaky. Obsluha pak vidí obrazovku, která vypadá stejně jako před hledáním,
// a usoudí, že položka ve skladu není. Přesně tohle se stalo ve Skladu —
// devatenáct hledání napříč čtrnácti komponentami mělo tutéž vadu.
//
// Použij `obsahuje()` / `obsahujeNekde()` z `lib/hledani.ts`.
//
// Kontrola hlídá jen porovnání s PROMĚNNOU, která vypadá jako uživatelský
// dotaz (q, search, needle, query, hledani, term, filtr…). Porovnání
// s literálem (`role.toLowerCase() === 'employer'`) je něco jiného a projde.

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const DOTAZ = 'q|qq|s|search|hledani|hledat|needle|query|term|filtr|filter|txt|text|posHledat|crewSearch|packSearch';
const VZOR = new RegExp(String.raw`\.toLowerCase\(\)\s*\.includes\(\s*(?:${DOTAZ})\b`, 'i');
const POVOLENO = ['lib/hledani.ts', 'scripts/check-hledani.mjs'];

// Celé složky, přípona se filtruje tady. Pathspec `components/**/*.tsx`
// vynechává soubory ležící PŘÍMO v `components/` (Guides, TeamManagement,
// Settings…) — tahle kontrola na to hned napoprvé naletěla a tvářila se
// zeleně nad vadou, kterou měla najít.
const soubory = execSync('git ls-files components app lib', { encoding: 'utf8' })
  .split('\n').filter(f => /\.(tsx?|jsx?)$/.test(f)).filter(f => !POVOLENO.includes(f));

const nalezy = [];
for (const f of soubory) {
  readFileSync(f, 'utf8').split('\n').forEach((radek, i) => {
    if (VZOR.test(radek)) nalezy.push(`${f}:${i + 1}  ${radek.trim().slice(0, 100)}`);
  });
}

if (nalezy.length) {
  console.error(`\nHledání bez normalizace diakritiky — ${nalezy.length} míst:\n`);
  for (const n of nalezy) console.error('  ' + n);
  console.error('\nPoužij obsahuje() / obsahujeNekde() z lib/hledani.ts.\n');
  process.exit(1);
}
console.log(`check-hledani: ${soubory.length} souborů, každé hledání zvládne diakritiku.`);
