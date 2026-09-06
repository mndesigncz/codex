#!/usr/bin/env node
// Dvě šířkové třídy v jednom className.
//
// Konstanty jako `inputClass` začínají `w-full`. Když se v místě použití
// dopíše `w-20`, vyhraje `w-full` — Tailwind vysází .w-20 dřív, takže .w-full
// je v kaskádě později. Pole se pak roztáhne přes celý řádek a s `shrink-0`
// přeteče do vedlejšího sloupce; v editoru skladu z toho byla dvě pole
// naskládaná přes sebe.
//
// Řešení je vykřičník: `!w-20` vynutí šířku bez ohledu na pořadí v CSS.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['app', 'components'];
const WIDTH = /(?<![-\w])w-(?:full|screen|auto|\d+|\d+\/\d+|\[[^\]]+\])/g;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules' && name !== '.next') yield* walk(p); }
    else if (/\.tsx?$/.test(name)) yield p;
  }
}

const hits = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/className=\{`([^`]*)`\}/g)) {
      const body = m.group ? m.group(1) : m[1];
      if (!body.includes('${')) continue;
      const own = [...body.matchAll(WIDTH)].map(x => x[0]).filter(w => !body.includes('!' + w));
      if (!own.length) continue;
      for (const cm of body.matchAll(/\$\{(\w+)\}/g)) {
        const decl = src.match(new RegExp(`const ${cm[1]} = ['\`"]([^'\`"]*)['\`"]`));
        if (!decl) continue;
        const constW = [...decl[1].matchAll(WIDTH)].map(x => x[0]);
        if (constW.length) {
          const line = src.slice(0, m.index).split('\n').length;
          hits.push(`${relative('.', file)}:${line}  \${${cm[1]}} nese ${constW.join(' ')} — a tady se přidává ${own.join(' ')}`);
        }
      }
    }
  }
}

if (hits.length) {
  console.error('\nDvě šířkové třídy v jednom className — ta z konstanty přebije tu zamýšlenou.');
  console.error('Napiš šířku s vykřičníkem (!w-20), aby vyhrála bez ohledu na pořadí v CSS.\n');
  for (const h of hits) console.error('  ' + h);
  console.error(`\n${hits.length} ${hits.length === 1 ? 'místo' : 'míst'} k opravě.\n`);
  process.exit(1);
}
console.log('check-width-clash: v pořádku — žádné soupeřící šířky.');
