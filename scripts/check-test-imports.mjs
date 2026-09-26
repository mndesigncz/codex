#!/usr/bin/env node
// Co si načítá `npm test`, nesmí používat alias `@/`.
//
// Testy běží `node scripts/test-units.ts` přímo, bez bundleru. Node zná
// jen relativní cesty a balíčky — alias `@/lib/…` z tsconfigu mu nic
// neříká a celý běh spadne na ERR_MODULE_NOT_FOUND. V editoru i v `tsc`
// přitom všechno svítí zeleně, takže se to pozná až v CI.
//
// Stalo se to přesně takhle: do `lib/productionPlan.ts` přibyl
// `import { czCount } from '@/lib/czech'` a testy přestaly jít spustit.
//
// Kontrola projde graf importů od `scripts/test-units.ts` (a od každého
// souboru ve `scripts/testy/`) a hlídá jen soubory, kterých se testy opravdu
// dotknou — zbytek repa alias používat může. Import se hledá na jednom řádku:
// víceřádkový `import {…} from` kontrola nevidí, proto ho v testovaném kódu
// nepiš.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';

const ENTRY = 'scripts/test-units.ts';
// Od kola 68 si test-units.ts načítá i scripts/testy/*.ts — dynamicky, podle
// obsahu složky, takže je graf importů nevidí. Prochází se proto zvlášť.
const TESTY = 'scripts/testy';
const ENTRIES = [ENTRY, ...(existsSync(TESTY) ? readdirSync(TESTY).filter(f => f.endsWith('.ts')).sort().map(f => `${TESTY}/${f}`) : [])];

/** Relativní import na skutečný soubor; zkusí i doplnit příponu. */
function resolveLocal(from, spec) {
  const base = resolve(dirname(from), spec);
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
    if (existsSync(cand)) return cand;
  }
  return null;
}

const IMPORT = /(?:^|\n)\s*(?:import|export)[^'"\n]*from\s*['"]([^'"]+)['"]/g;

const seen = new Set();
const hits = [];

function walk(file) {
  const abs = resolve(file);
  if (seen.has(abs) || !existsSync(abs)) return;
  seen.add(abs);
  const src = readFileSync(abs, 'utf8');
  const rel = relative('.', abs);
  let m;
  IMPORT.lastIndex = 0;
  while ((m = IMPORT.exec(src))) {
    const spec = m[1];
    if (spec.startsWith('@/')) {
      const line = src.slice(0, m.index).split('\n').length + 1;
      hits.push(`${rel}:${line}  ${spec}`);
      continue;
    }
    if (!spec.startsWith('.')) continue; // balíček z node_modules
    const next = resolveLocal(abs, spec);
    if (next) walk(next);
  }
}

for (const e of ENTRIES) walk(e);

if (hits.length) {
  console.error(`\nSoubory, které si načítá \`npm test\`, nesmí importovat přes alias \`@/\`.`);
  console.error('Node si testy pouští přímo a alias z tsconfigu nezná — použij relativní cestu.\n');
  for (const h of hits) console.error('  ' + h);
  console.error(`\n${hits.length} ${hits.length === 1 ? 'import' : 'importů'} k opravě.\n`);
  process.exit(1);
}
console.log(`check-test-imports: v pořádku — ${seen.size} souborů v testech, žádný alias.`);
