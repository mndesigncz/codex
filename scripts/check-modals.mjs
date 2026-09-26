#!/usr/bin/env node
// Ručně psaná okna — ráčna, která smí jen klesat.
//
// V aplikaci bylo 41 oken a každé si samo skládalo překryv, panel, nadpis
// i zavírání. Lišila se v šesti šířkách a dvou rádiusech, takže „potvrdit
// smazání" bylo jednou úzké okno uprostřed a jindy široký list zdola.
//
// Přepsat je všechny naráz by byla velká riziková změna, tak se převádějí
// postupně. Tenhle strážce hlídá jen jedno: aby jich nepřibývalo. Kdo
// píše nové okno, použije <Modal> z components/ui. Kdo převede staré,
// sníží BASELINE.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const BASELINE = 22; // kolo 69 (B3): Sklad — položka, hlášení, hromadná úprava, nákup, kategorie, dodavatelé, inventura, K výrobě → <Modal>

const hits = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue;
    const file = join(dir, name);
    if (statSync(file).isDirectory()) { walk(file); continue; }
    if (!/\.tsx$/.test(file)) continue;
    // Sdílená mechanika oken, ne jednotlivá okna. `DiscardGuard` se schválně
    // kreslí nad otevřeným oknem — jako <Modal> by si s ním přetahoval fokus.
    if (file.endsWith(`ui${'/'}Modal.tsx`)) continue;
    if (file.endsWith(`ui${'/'}DiscardGuard.tsx`)) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (line.includes('modal-sheet')) hits.push(`${relative('.', file)}:${i + 1}`);
    });
  }
};
walk('components');

if (hits.length > BASELINE) {
  console.error(`\nPřibylo ručně psané okno: ${hits.length} (povoleno ${BASELINE}).`);
  console.error('Nové okno se staví komponentou <Modal> z components/ui — nese jednu šířku, jeden rádius a zavírání.\n');
  for (const h of hits) console.error('  ' + h);
  process.exit(1);
}
if (hits.length < BASELINE) {
  console.error(`\nRučních oken ubylo: ${hits.length} místo ${BASELINE}. Sniž BASELINE v scripts/check-modals.mjs, ať ráčna drží.\n`);
  process.exit(1);
}
console.log(`check-modals: v pořádku — ${hits.length} ručních oken, nepřibývá.`);
