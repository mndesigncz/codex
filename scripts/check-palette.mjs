#!/usr/bin/env node
// Barvy mimo paletu Managera.
//
// Paleta má pět stavových tónů (ok, wait, bad, info, muted) a limetku jako
// jediný akcent. Když se k tomu přidá oranžová, žlutá, fialová a tyrkysová,
// přestane barva něco znamenat: „Ke schválení" bylo na jedné obrazovce
// oranžové a na druhé žluté, a člověk se marně snažil najít rozdíl.
//
// Pro odlišení KATEGORIÍ (typy směn, dostupnosti) je v globals.css zvlášť
// řada .cat-1 až .cat-6. Ta se smí použít jen k rozlišení, nikdy ke sdělení
// stavu — červená znamená problém, ne „třetí typ směny".
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// amber = wait, red = bad, blue = info, neutral/black/white = muted a plochy.
const OFF = /\b(?:bg|text|border|ring|from|to|via)-(purple|violet|fuchsia|pink|rose|indigo|sky|cyan|teal|emerald|green|lime|yellow|orange|stone|zinc|slate|gray)-\d{2,3}/g;

const hits = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue;
    const file = join(dir, name);
    if (statSync(file).isDirectory()) { walk(file); continue; }
    if (!/\.tsx$/.test(file)) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      OFF.lastIndex = 0;
      let m;
      while ((m = OFF.exec(line))) hits.push(`${relative('.', file)}:${i + 1}  ${m[0]}`);
    });
  }
};
walk('components');
walk('app');

if (hits.length) {
  console.error('\nBarva mimo paletu Managera.');
  console.error('Stav patří na amber (čeká), red (chyba), blue (info) nebo neutrální šedou.');
  console.error('Na rozlišení kategorií je řada .cat-1 až .cat-6 v globals.css.\n');
  for (const h of hits) console.error('  ' + h);
  console.error(`\n${hits.length} ${hits.length === 1 ? 'místo' : 'míst'} k opravě.\n`);
  process.exit(1);
}
console.log('check-palette: v pořádku — barvy drží paletu.');
