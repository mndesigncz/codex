#!/usr/bin/env node
// Business days in this app run on the Europe/Prague wall clock. Deriving one
// from the current instant in UTC — new Date().toISOString().slice(0, 10) —
// silently returns YESTERDAY between midnight and ~02:00 Prague, which is
// exactly when a closing after a night shift gets filed. That bug family cost
// a whole debugging round; this guard stops it coming back.
//
// Use pragueToday() / pragueDayOf() / pragueDaySafe() from lib/pragueTime.
// Deriving a day from a timestamp pinned to noon UTC stays fine and is allowed.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['app', 'components', 'lib'];
const ALLOW = ['lib/pragueTime.ts', 'scripts/check-time.mjs'];
// "now" in UTC, then cut to a date or a month.
const BAD = /new Date\(\s*(?:Date\.now\(\)[^)]*)?\)\s*\.toISOString\(\)\s*\.(?:split\('T'\)\[0\]|slice\(0,\s*(?:7|10)\))/;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules' && name !== '.next') yield* walk(p); }
    else if (/\.(ts|tsx|mjs)$/.test(name)) yield p;
  }
}

const hits = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const rel = relative('.', file);
    if (ALLOW.includes(rel)) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (BAD.test(line)) hits.push(`${rel}:${i + 1}  ${line.trim().slice(0, 110)}`);
    });
  }
}

if (hits.length) {
  console.error('\nDatum obchodního dne se nesmí odvozovat z UTC — použij pragueToday()/pragueDayOf() z lib/pragueTime.');
  console.error('Mezi půlnocí a druhou ranní v Praze vrací UTC včerejšek, což rozbíjí uzávěrky po noční.\n');
  for (const h of hits) console.error('  ' + h);
  console.error(`\n${hits.length} ${hits.length === 1 ? 'místo' : 'míst'} k opravě.\n`);
  process.exit(1);
}
console.log('check-time: v pořádku — žádné UTC odvození obchodního dne.');
