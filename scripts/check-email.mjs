#!/usr/bin/env node
// E-mail, o kterém se jen předpokládá, že odešel.
//
// `resend.emails.send()` **nevyhazuje výjimku**. Chybu vrací v odpovědi
// jako `{ data, error }`. Kód, který píše
//
//     await resend.emails.send({ ... });
//     emailed = true;
//
// tedy hlásí úspěch i tehdy, když odesílací služba e-mail odmítla.
// U objednávky to znamená, že vedoucí čeká na zboží, které nikdo
// neobjednal; u pozvánky, že nový člověk nikdy nedostane heslo.
//
// Odesílá se proto jedním místem — `lib/email` —, které `error` čte
// a vrací `{ sent, error }`. Tahle kontrola hlídá, aby se `emails.send`
// nevolalo nikde jinde, a aby `EMAIL_FROM` zůstalo jediným zdrojem
// odesílací adresy.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['app', 'components', 'lib'];
const ALLOW = ['lib/email.ts', 'scripts/check-email.mjs'];

const SEND = /\.emails\s*\.\s*send\s*\(/;
// Zkušební adresa Resendu nedoručí komukoli a nejde na ni odpovědět.
const SANDBOX = /onboarding@resend\.dev/;

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
      if (SEND.test(line)) hits.push(`${rel}:${i + 1}  odesílá mimo lib/email: ${line.trim().slice(0, 80)}`);
      if (SANDBOX.test(line)) hits.push(`${rel}:${i + 1}  zkušební adresa natvrdo: ${line.trim().slice(0, 80)}`);
    });
  }
}

if (hits.length) {
  console.error(`\nE-mail se odesílá mimo lib/email na ${hits.length} místech.`);
  console.error('`emails.send()` nevyhazuje výjimku — bez čtení `error` se odmítnutí tváří jako úspěch.\n');
  for (const h of hits) console.error('  ' + h);
  console.error('');
  process.exit(1);
}
console.log('check-email: v pořádku — odesílá se jedním místem, které pozná odmítnutí.');
