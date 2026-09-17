#!/usr/bin/env node
// Načítání, které umí selhat, ale neumí to přiznat.
//
// Vzorec, co v aplikaci třikrát způsobil obrazovku zaseknutou na skeletonu:
//
//   const [d, setD] = useState(null);
//   fetch(url).then(r => r.json()).then(setD).catch(() => {});   // ← tichý pád
//   if (!d) return <Skeleton />;                                  // ← navždy
//
// Když načtení selže, `d` zůstane null a člověk kouká na pulzující obdélník,
// dokud stránku neobnoví. Vypadá to jako rozbitá aplikace i u vteřinového
// výpadku sítě. Soubor, který má obojí — prázdný catch i bránu na skeletonu —
// musí mít i chybovou větev: ErrorState, useLoad nebo vlastní `error` stav.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SILENT = /\.catch\(\(\)\s*=>\s*\{\s*\}\)/;
const SKELETON_GATE = /(===\s*null\s*\?\s*<\s*(?:Page)?Skel|if\s*\(!\w+(?:\s*\|\|\s*!\w+)*\)\s*return\s*<[^>]*Skel)/;
const HAS_ERROR_PATH = /ErrorState|useLoad|setError\(|\berror\s*\?/;

const hits = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue;
    const file = join(dir, name);
    if (statSync(file).isDirectory()) { walk(file); continue; }
    if (!file.endsWith('.tsx')) continue;
    const src = readFileSync(file, 'utf8');
    if (SILENT.test(src) && SKELETON_GATE.test(src) && !HAS_ERROR_PATH.test(src)) {
      const line = src.slice(0, src.search(SKELETON_GATE)).split('\n').length;
      hits.push(`${relative('.', file)}:${line}  brána na skeletonu + tichý catch, ale žádná chybová větev`);
    }
  }
};
walk('components');

if (hits.length) {
  console.error('\nObrazovka, která se po chybě nikdy nedonačte.');
  console.error('Doplň chybový stav: useLoad z components/ui, nebo vlastní `error` + <ErrorState onRetry={…} />.\n');
  for (const h of hits) console.error('  ' + h);
  console.error(`\n${hits.length} ${hits.length === 1 ? 'místo' : 'míst'} k opravě.\n`);
  process.exit(1);
}
console.log('check-silent-load: v pořádku — každé načítání umí přiznat chybu.');
