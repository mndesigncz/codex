#!/usr/bin/env node
// `transition-all` — animuje i to, co animovat nemá.
//
// DESIGN.md to má v anti-vzorech a je to praktická věc, ne estetická:
// `all` zahrnuje i rozvržení (šířku, výšku, odsazení). Prohlížeč pak při
// každé změně barvy přepočítává rozvržení a animace na slabším tabletu
// u kasy poskakuje. Tailwindovo holé `transition` má kurátorovaný seznam
// — barvy, transform, stín, průhlednost — tedy přesně to, co jde po
// kompozitoru a co obvykle chceme.
//
// Když se šířka animovat MÁ (ukazatel postupu, sbalení panelu), vyjmenuje
// se: `transition-[width]`. Z „náhodou to funguje" se stane rozhodnutí.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const hits = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue;
    const file = join(dir, name);
    if (statSync(file).isDirectory()) { walk(file); continue; }
    if (!/\.tsx$/.test(file)) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (/\btransition-all\b/.test(line)) hits.push(`${relative('.', file)}:${i + 1}`);
    });
  }
};
walk('components');
walk('app');

if (hits.length) {
  console.error('\n`transition-all` animuje i rozvržení — na slabším zařízení to poskakuje.');
  console.error('Použij holé `transition` (barvy, transform, stín), nebo vyjmenuj: `transition-[width]`.\n');
  for (const h of hits) console.error('  ' + h);
  console.error(`\n${hits.length} ${hits.length === 1 ? 'místo' : 'míst'} k opravě.\n`);
  process.exit(1);
}
console.log('check-transitions: v pořádku — žádné transition-all.');
