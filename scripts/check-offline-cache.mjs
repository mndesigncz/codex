#!/usr/bin/env node
// Offline stránka se předcachuje — a cache se mění jen se svým názvem.
//
// `sw.js` si `offline.html` uloží při instalaci workeru. Když se text
// stránky změní, ale název cache zůstane, zařízení, která ji už mají,
// ukazují starý text napořád. Chyba se neprojeví u toho, kdo ji udělal
// (čistý prohlížeč si stáhne nové), ale u tabletu, který běží za barem
// půl roku — tedy přesně tam, kde na té stránce záleží.
//
// Proto je v názvu cache otisk obsahu. Tahle kontrola ověřuje, že sedí;
// spoléhat na to, že si někdo vzpomene zvednout verzi, je horší.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const STRANKA = 'public/offline.html';
const WORKER = 'public/sw.js';

const otisk = createHash('sha256').update(readFileSync(STRANKA)).digest('hex').slice(0, 8);
const sw = readFileSync(WORKER, 'utf8');
const m = sw.match(/PREDPONA \+ '([^']+)'/);

if (!m) {
  console.error(`V ${WORKER} není název cache ve tvaru \`PREDPONA + '…'\`.`);
  process.exit(1);
}
if (m[1] !== otisk) {
  console.error(`Offline stránka se změnila, ale název cache ne.\n`);
  console.error(`  ${STRANKA} má otisk  ${otisk}`);
  console.error(`  ${WORKER} má v cache  ${m[1]}\n`);
  console.error(`Přepiš v ${WORKER} název cache na '${otisk}'.`);
  console.error(`Jinak tablet, který stránku už má uloženou, bude ukazovat starý text.`);
  process.exit(1);
}
console.log(`check-offline-cache: v pořádku — název cache '${otisk}' sedí s obsahem offline stránky.`);
