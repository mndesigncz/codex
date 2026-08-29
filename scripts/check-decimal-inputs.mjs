#!/usr/bin/env node
// Množství se v česku píše s desetinnou čárkou. Pole <input type="number">
// ale „0,7" nepovažuje za platnou hodnotu a pošle prázdný řetězec — číslo
// tiše zmizí a uloží se nula. U velikosti balení nebo gramáže v receptuře
// to znamená špatný odpis ze skladu a špatnou marži.
//
// Desetinná pole proto necháváme textová, jen s inputMode="decimal", a
// hodnotu parsujeme přes replace(',', '.').

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['app', 'components'];
const BAD = /type=["']number["'][^>]*inputMode=["']decimal["']|inputMode=["']decimal["'][^>]*type=["']number["']/;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules' && name !== '.next') yield* walk(p); }
    else if (/\.tsx$/.test(name)) yield p;
  }
}

const hits = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const rel = relative('.', file);
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (BAD.test(line)) hits.push(`${rel}:${i + 1}  ${line.trim().slice(0, 110)}`);
    });
  }
}

if (hits.length) {
  console.error('\nDesetinné pole nesmí být type="number" — česká čárka se v něm zahodí a uloží se nula.');
  console.error('Nech pole textové s inputMode="decimal" a číslo parsuj přes replace(\',\', \'.\').\n');
  for (const h of hits) console.error('  ' + h);
  console.error(`\n${hits.length} ${hits.length === 1 ? 'místo' : 'míst'} k opravě.\n`);
  process.exit(1);
}
console.log('check-decimal-inputs: v pořádku — desetinná pole snesou čárku.');
