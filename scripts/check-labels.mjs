#!/usr/bin/env node
// Popisek, který vypadá jako popisek, ale odečítač obrazovky ho nepřečte.
//
//     <label className="field-label">Kasa na začátku</label>
//     <input type="number" … />
//
// Vizuálně je to popisek nad polem. Programově to není nic: `<label>` bez
// `htmlFor` a `<input>` bez `id` spolu nejsou svázané. Odečítač přečte
// „číselné pole, prázdné" a člověk neví, co má vyplnit — a do těchhle
// konkrétních polí se píšou peníze v kase.
//
// Správně jsou dvě možnosti a obě jsou krátké:
//
//     <label htmlFor="x">Popis</label> <input id="x" …/>
//     <label><span className="field-label">Popis</span> <input …/></label>
//
// Druhá je odolnější: svázání nemůže rozpadnout přejmenování `id`.
//
// Tohle je ráčna: počet nesmí růst. Když klesne, sníží se i BASELINE —
// ať je vidět, že se to opravdu uklízí, a ne že se jen přestalo přidávat.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['app', 'components'];
const BASELINE = 112;

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
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/g)) {
      const [, attrs, inner] = m;
      if (/htmlFor/.test(attrs)) continue;                 // svázané přes id
      if (/<(input|select|textarea)\b/.test(inner)) continue; // pole je uvnitř
      const line = src.slice(0, m.index).split('\n').length;
      hits.push(`${relative('.', file)}:${line}`);
    }
  }
}

const n = hits.length;
if (n > BASELINE) {
  console.error(`\nNesvázaných popisků přibylo: ${n}, dovoleno ${BASELINE}.`);
  console.error('Použij `<label htmlFor>` + `id`, nebo pole vlož dovnitř `<label>`.\n');
  for (const h of hits.slice(-10)) console.error('  ' + h);
  console.error('');
  process.exit(1);
}
if (n < BASELINE) {
  console.error(`\nNesvázaných popisků ubylo: ${n} místo ${BASELINE}. Sniž BASELINE`);
  console.error('v scripts/check-labels.mjs, ať ráčna drží nový stav.\n');
  process.exit(1);
}
console.log(`check-labels: v pořádku — ${n} nesvázaných popisků, nepřibývá.`);
