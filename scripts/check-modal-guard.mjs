#!/usr/bin/env node
// Okno, které zavřením zahodí rozepsaný text.
//
// Escape a klik vedle okna zavíraly okamžitě a bez ptaní. U okna, kde je
// napsaná směrnice na půl stránky nebo oznámení pro celý tým, to znamenalo
// hodinu práce pryč jedním omylem. `useModal` to hlídá a <DiscardGuard>
// se ptá — ale jen v oknech, která ho vykreslují.
//
// Tahle kontrola říká: každý panel okna (`modal-sheet` s `ref={X.ref}`)
// musí uvnitř mít <DiscardGuard guard={X.guard} />. Nové okno se staví
// komponentou <Modal> z components/ui, kde to je zabudované; kdo si panel
// skládá ručně, dopíše jeden řádek.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const chybi = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue;
    const file = join(dir, name);
    if (statSync(file).isDirectory()) { walk(file); continue; }
    if (!/\.tsx$/.test(file)) continue;
    if (file.endsWith(`ui${sep}Modal.tsx`)) continue;
    const s = readFileSync(file, 'utf8');
    if (!s.includes('modal-sheet')) continue;

    // Ke každému panelu najdi hook, na kterém visí, a ověř, že se pro něj
    // někde v souboru vykresluje pojistka.
    const strazeno = new Set([...s.matchAll(/<DiscardGuard\s+guard=\{(\w+)\.guard\}/g)].map(m => m[1]));
    for (const m of s.matchAll(/className=(?:"|\{`|\{")modal-sheet/g)) {
      const start = s.lastIndexOf('<', m.index);
      const end = s.indexOf('>', m.index);
      const tag = s.slice(start, end);
      const ref = tag.match(/ref=\{(\w+)\.ref\}/);
      if (!ref) continue;               // panel bez hooku řeší check-modals
      if (strazeno.has(ref[1])) continue;
      const radek = s.slice(0, start).split('\n').length;
      chybi.push(`${relative('.', file)}:${radek}  (okno na ${ref[1]})`);
    }
  }
};
walk('components');

if (chybi.length) {
  console.error(`\nOkno, které zavřením tiše zahodí rozepsaný text: ${chybi.length}.`);
  console.error('Dovnitř panelu patří <DiscardGuard guard={hook.guard} /> z components/ui —');
  console.error('jinak Escape nebo klik vedle okna vezme s sebou, co do něj někdo napsal.\n');
  for (const c of chybi) console.error('  ' + c);
  process.exit(1);
}
console.log(`Okna: každý ručně skládaný panel má pojistku proti zahození rozepsaného textu.`);
