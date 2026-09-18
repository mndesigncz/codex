#!/usr/bin/env node
// Aplikace něco udělá a nezkontroluje, jestli se to povedlo.
//
//     await fetch(`/api/guides/${id}`, { method: 'DELETE' });
//     setReader(null);
//     await loadGuides();
//
// Výsledek nikdo nečte. Když smazání selže, čtenář se zavře, seznam se
// načte znovu — a návod v něm pořád je. Nic se nezlomí, ale člověk nemá
// jak zjistit, proč se nestalo to, co chtěl. U zrušení PINu k venkovnímu
// menu je to navíc rozdíl v bezpečí, ne kosmetika: člověk si myslí, že
// od stánku už nikdo označovat nemůže, a přitom může.
//
// Mutace tedy musí být buď v `try` s kontrolou `res.ok`, nebo mít vlastní
// `.catch()`. Načtení (GET) sem nepatří — to hlídá `check-fetch-ok`.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['app', 'components'];

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
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      // `await fetch(` na začátku příkazu — výsledek se nikam neukládá.
      if (!/^\s*await fetch\(/.test(line)) return;
      const blok = lines.slice(i, i + 8).join('\n');
      // Uvozovky obojí: `method: 'DELETE'` i `method: "DELETE"`. Když
      // kontrola uměla jen jedny, prošla jí sabotáž s těmi druhými.
      if (!/method:\s*['"`](POST|PATCH|PUT|DELETE)['"`]/.test(blok)) return;
      if (blok.includes('.catch(')) return;
      // Uvnitř `try`, které se ještě nezavřelo?
      const okno = lines.slice(Math.max(0, i - 25), i).join('\n');
      const j = okno.lastIndexOf('try {');
      if (j >= 0 && !okno.slice(j).includes('catch')) return;
      hits.push(`${relative('.', file)}:${i + 1}  ${line.trim().slice(0, 74)}`);
    });
  }
}

if (hits.length) {
  console.error(`\n${hits.length} mutací, jejichž výsledek nikdo nečte.`);
  console.error('Dej je do `try` s kontrolou `res.ok`, nebo jim přidej `.catch()`.\n');
  for (const h of hits) console.error('  ' + h);
  console.error('');
  process.exit(1);
}
console.log('check-silent-mutation: v pořádku — každá změna se kontroluje.');
