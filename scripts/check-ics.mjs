#!/usr/bin/env node
// Ruční skládání souboru pro kalendář.
//
// Dvě místa v aplikaci si `.ics` lepila sama a každé jinak. Obě vyráběla
// soubor, který Apple a Google spolknou, ale který podle RFC 5545 platný
// není: chyběl `DTSTAMP` (Outlook takový soubor odmítne), chyběl popis
// pásma k `TZID=Europe/Prague` (klient, co Prahu nezná, posune směnu
// o hodiny) a dlouhé řádky se nezalamovaly. Jedno z nich neošetřovalo ani
// čárku, takže „Degustace, ročník 2019" rozdělilo vlastnost na dvě.
//
// Kalendář je slib o čase. Skládá ho `lib/ics`, a to jedno místo je
// pokryté testy — tahle kontrola hlídá, aby nevzniklo třetí.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['app', 'components', 'lib'];
const ALLOW = ['lib/ics.ts', 'scripts/check-ics.mjs'];
const BAD = /BEGIN:VCALENDAR|BEGIN:VEVENT|text\/calendar/;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules' && name !== '.next') yield* walk(p); }
    else if (/\.(ts|tsx)$/.test(name)) yield p;
  }
}

const hits = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const rel = relative('.', file);
    if (ALLOW.includes(rel)) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      const code = line.trimStart();
      if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return;
      if (BAD.test(line)) hits.push(`${rel}:${i + 1}  ${line.trim().slice(0, 96)}`);
    });
  }
}

if (hits.length) {
  console.error(`\nSoubor pro kalendář se skládá ručně na ${hits.length} místech.`);
  console.error('Použij buildIcs()/downloadIcs() z lib/ics — má DTSTAMP, pásmo i zalamování.\n');
  for (const h of hits) console.error('  ' + h);
  console.error('');
  process.exit(1);
}
console.log('check-ics: v pořádku — kalendář se skládá na jednom místě.');
