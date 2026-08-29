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

// Druhá rodina: čas z databáze zobrazený bez zóny.
//
// Sloupce TIMESTAMP nesou UTC, ale Postgres je posílá bez značky zóny
// ("2026-08-29 22:22:01"). `new Date()` takový tvar bere jako MÍSTNÍ čas, takže
// se hodina zobrazí posunutá o pražský offset — a když se taková hodnota vrátí
// do formuláře a uloží, posune se záznam o dvě hodiny při každé editaci.
//
// Použij parseDbTime() / dbTimeHM() / dbTimeDayHM() z lib/pragueTime.
const BAD_TZ = /new Date\([^)]*\)\s*\.toLocale(?:Time)?String\(/;
const HAS_HOUR = /hour:\s*'2-digit'/;
const HAS_TZ = /timeZone:/;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules' && name !== '.next') yield* walk(p); }
    else if (/\.(ts|tsx|mjs)$/.test(name)) yield p;
  }
}

const hits = [];
const tzHits = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const rel = relative('.', file);
    if (ALLOW.includes(rel)) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (BAD.test(line)) hits.push(`${rel}:${i + 1}  ${line.trim().slice(0, 110)}`);
      // `new Date()` bez argumentu je „teď" — ten je správně v místní zóně.
      if (BAD_TZ.test(line) && HAS_HOUR.test(line) && !HAS_TZ.test(line)
          && !/new Date\(\s*\)/.test(line)) {
        tzHits.push(`${rel}:${i + 1}  ${line.trim().slice(0, 110)}`);
      }
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
if (tzHits.length) {
  console.error('\nČas z databáze se nesmí zobrazovat bez zóny — použij dbTimeHM()/dbTimeDayHM() z lib/pragueTime.');
  console.error('Postgres posílá TIMESTAMP bez značky zóny, takže prohlížeč UTC hodnotu vezme jako místní čas.\n');
  for (const h of tzHits) console.error('  ' + h);
  console.error(`\n${tzHits.length} ${tzHits.length === 1 ? 'místo' : 'míst'} k opravě.\n`);
  process.exit(1);
}
console.log('check-time: v pořádku — obchodní den i zobrazený čas drží pražskou zónu.');
