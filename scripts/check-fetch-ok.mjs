#!/usr/bin/env node
// Načítání, které nepozná, že server odmítl.
//
//   fetch('/api/tasks').then(r => r.json()).then(setTasks).catch(() => {});
//
// `fetch` nepadá na HTTP 500 — chybová odpověď je pro něj splněný slib.
// `r.json()` většinou taky projde, protože server vrátí `{"error":"..."}`,
// a do stavu se uloží objekt, který obrazovka čte jako prázdno. Člověk pak
// vidí „Žádné úkoly 🎉" místo „nepodařilo se načíst" a `catch` mlčí, protože
// nic nespadlo. Je to ta nejtišší lež, jakou aplikace umí.
//
// Správně je `.then(okJson)` z `lib/api`: chybový stav vyhodí jako chybu
// i se zprávou, kterou server napsal, a `catch` na konci řetězu konečně
// dostane, co má ukázat.
//
// Výjimky: `lib/api` sám (ten `r.json()` volá) a odpovědi na POST/PATCH,
// kde se tělo čte **až po** ručním `if (!res.ok)` — tam je čtení chybového
// těla záměr, ne opomenutí.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['app', 'components', 'lib'];
const ALLOW = ['lib/api.ts'];

// `r => r.json()` jako argument `.then()` — ta jedna podoba, co obchází
// kontrolu stavu. `res.json()` po `if (!res.ok)` tenhle tvar nemá.
const BAD = /\.then\(\s*\(?\s*(?:r|res|resp|response)\s*\)?\s*=>\s*\1?\s*\w*\.json\(\)\s*\)/;
const BAD_TERNARY = /\.then\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*\(?\s*\1\.ok\s*\?/;

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
      if (BAD.test(line) || BAD_TERNARY.test(line)) {
        hits.push(`${rel}:${i + 1}  ${line.trim().slice(0, 96)}`);
      }
    });
  }
}

if (hits.length) {
  console.error(`\nNačítání, které nepozná odmítnutí serveru: ${hits.length} míst.`);
  console.error("Použij `.then(okJson)` z lib/api — vyhodí chybu i se zprávou ze serveru.\n");
  for (const h of hits) console.error('  ' + h);
  console.error('');
  process.exit(1);
}
console.log('check-fetch-ok: v pořádku — každé načtení pozná, když server odmítne.');
