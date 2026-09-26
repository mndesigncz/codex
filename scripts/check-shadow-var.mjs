#!/usr/bin/env node
// `shadow-[var(--…)]` — stín, který se nevykreslí.
//
// Tailwind 3.4 z holé proměnné nepozná, jestli v ní je celý stín, nebo jen
// jeho barva, a vybere barvu: vygeneruje `--tw-shadow-color` a žádný
// `box-shadow`. Třída v kódu vypadá správně a nedělá nic. Takhle přišla
// hromadná lišta (BulkBar → PlovouciLista) o stín, toast ho neměl nikdy,
// našeptávač hledání měl místo plovoucího stínu jen stín karty a karty
// v Plánování se na hover nezvedaly — změřeno v prohlížeči, box-shadow: none.
//
// Stín z proměnné se píše s nápovědou typu: `shadow-[shadow:var(--shadow-float)]`
// (nebo `[box-shadow:var(--shadow-float)]`). Kdyby šlo opravdu o barvu stínu,
// patří tam `shadow-[color:var(--…)]` — nápověda typu je pak rozhodnutí,
// ne náhoda.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const hits = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue;
    const file = join(dir, name);
    if (statSync(file).isDirectory()) { walk(file); continue; }
    if (!/\.(tsx|ts|jsx|js)$/.test(file)) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      // `drop-shadow-[var(…)]` je v pořádku: filtr má jediný plugin, nic se nemate.
      if (/(?<!drop-)\bshadow-\[var\(/.test(line)) hits.push(`${relative('.', file)}:${i + 1}`);
    });
  }
};
walk('components');
walk('app');
walk('lib');

if (hits.length) {
  console.error('\n`shadow-[var(--…)]` si Tailwind 3.4 vyloží jako barvu stínu — žádný stín se nevykreslí.');
  console.error('Stín z proměnné: `shadow-[shadow:var(--shadow-float)]`, barva stínu: `shadow-[color:var(--…)]`.\n');
  for (const h of hits) console.error('  ' + h);
  console.error(`\nMíst k opravě: ${hits.length}.\n`);
  process.exit(1);
}
console.log('check-shadow-var: v pořádku — každý stín z proměnné má nápovědu typu.');
