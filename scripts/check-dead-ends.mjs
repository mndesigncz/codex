#!/usr/bin/env node
// Slepé uličky, které mluví cizím jazykem.
//
// Next.js má pro nenalezenou stránku i pro chybu za běhu vlastní obrazovku.
// Je anglická („404 This page could not be found."), neřekne, co se stalo,
// a nenabídne kam jít. Dokud v `app/` nebyl `not-found.tsx`, dostal ji
// zákazník, který otevřel starý sdílený odkaz na nabídku — QR na letáku
// nebo záložku v telefonu. Tedy ten nejveřejnější povrch, jaký produkt má,
// a zároveň jediné místo, kde se ukázal anglicky.
//
// Tahle kontrola hlídá, že ty stránky existují a jsou česky.

import { existsSync, readFileSync } from 'node:fs';

const POTREBA = [
  ['app/not-found.tsx', 'stránka pro nenalezenou adresu'],
  ['app/error.tsx', 'stránka pro chybu za běhu'],
  ['app/global-error.tsx', 'záchytná stránka pro chybu v kořenovém rozvržení'],
];

// Jedno české slovo s diakritikou stačí: anglická šablona žádné nemá.
const CESKY = /[ěščřžýáíéúůťďňĚŠČŘŽÝÁÍÉÚŮŤĎŇ]/;

const potize = [];
for (const [cesta, popis] of POTREBA) {
  if (!existsSync(cesta)) { potize.push(`chybí ${cesta} — ${popis}`); continue; }
  const src = readFileSync(cesta, 'utf8');
  // Komentáře jsou taky česky, takže by kontrolu prošly samy; zajímá nás
  // text, který uvidí člověk.
  const text = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  if (!CESKY.test(text)) potize.push(`${cesta} nemá český text — ${popis}`);
}

if (potize.length) {
  console.error('\nSlepá ulička by ukázala anglickou obrazovku Next.js.\n');
  for (const p of potize) console.error('  ' + p);
  console.error('');
  process.exit(1);
}
console.log('check-dead-ends: v pořádku — nenalezeno i chyba mluví česky.');
