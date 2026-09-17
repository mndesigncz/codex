#!/usr/bin/env node
// Texty, které mluví o jednom konkrétním podniku.
//
// Managero se prodává kavárnám, restauracím, barům i čajovnám. Když
// v placeholderu svítí „Např. Sencha Gyokuro" nebo hlavička slibuje
// „Pro čajovny…", zákazník s bistrem si řekne, že to není pro něj —
// a má pravdu, protože to tak vypadá.
//
// Hlídáme jen text, který uvidí uživatel: řetězce v uvozovkách uvnitř
// komponent a stránek. Komentáře v kódu a data, která si člověk zadá
// sám (názvy položek, odměny, postupy), sem nepatří.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Slova vázaná na jeden druh provozu. „Čaj" samo o sobě v pořádku je —
// kavárna ho taky nalévá; problém je „čajovna" jako typ podniku
// a konkrétní čajový sortiment v ukázkách.
const WORDS = /(čajovn\w*|pangea|sencha\w*|gyokuro|pu-?erh|matcha\w*|matchu|matchy|oolong|gunpowder|darjeeling)/i;
// Řetězec v uvozovkách nebo v JSX textu.
const STRING = /(["'`])((?:\\.|(?!\1)[^\\])*?)\1/g;

const hits = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue;
    const file = join(dir, name);
    if (statSync(file).isDirectory()) { walk(file); continue; }
    if (!/\.(tsx|ts)$/.test(file)) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const code = line.trimStart();
      // Komentáře neřešíme — nejdou uživateli na oči.
      if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return;
      // Klíče localStorage si nesou starý název kvůli zpětné kompatibilitě.
      if (/localStorage|COOKIE|LS_|_OLD/.test(line)) return;
      let m;
      STRING.lastIndex = 0;
      while ((m = STRING.exec(line))) {
        if (WORDS.test(m[2])) {
          hits.push(`${relative('.', file)}:${i + 1}  „${m[2].slice(0, 70)}"`);
          break;
        }
      }
      // JSX text mimo uvozovky
      const jsxText = line.replace(/<[^>]*>/g, ' ');
      if (!hits.some(h => h.startsWith(`${relative('.', file)}:${i + 1}`)) && WORDS.test(jsxText) && !/import |from '/.test(line)) {
        hits.push(`${relative('.', file)}:${i + 1}  ${code.slice(0, 80)}`);
      }
    });
  }
};
walk('components');
walk('app');

if (hits.length) {
  console.error('\nText mluví o jednom konkrétním typu podniku.');
  console.error('Aplikace se prodává kavárnám, restauracím i barům — ukázky a popisky musí sedět všem.\n');
  for (const h of hits) console.error('  ' + h);
  console.error(`\n${hits.length} ${hits.length === 1 ? 'místo' : 'míst'} k přepsání.\n`);
  process.exit(1);
}
console.log('check-generic-copy: v pořádku — texty nevážou aplikaci na jeden provoz.');
