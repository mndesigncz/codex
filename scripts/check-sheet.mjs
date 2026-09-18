#!/usr/bin/env node
// Okno, které si kreslí vlastní překryv a nepřihlásí se k listu.
//
// Na telefonu mají všechna okna vyjet zdola a dosednout na spodní hranu.
// Nedělá to komponenta, dělají to dvě třídy v globals.css: `.modal-overlay`
// na ztmavení a `.modal-sheet` na panel. Kdo si napíše vlastní překryv
// a tyhle třídy nepoužije, dostane okno, které na telefonu visí uprostřed —
// mezi čtrnácti ostatními, která vyjíždějí zdola.
//
// Hlídá se soubor, ne jednotlivý element: překryv a panel bývají o pár
// řádků od sebe a na obou je vidět jen z běhu. Když soubor kreslí přes
// celou obrazovku něco, co zakrývá obsah, musí v něm obě třídy být.
//
// Průhledný `fixed inset-0` bez výplně je záchyt kliknutí pod rozbalovacím
// menu, ne okno — ten se netýká. Rozlišuje se podle toho, jestli překryv
// vůbec něco kreslí.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const KOREN = ['components', 'app'];
const souboryTsx = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? souboryTsx(p) : (f.endsWith('.tsx') ? [p] : []);
});

// Překryv = přes celou obrazovku, nad obsahem a s viditelnou plochou.
const PREKRYV = /fixed inset-0[^"'`]*\bz-(?:\[|\d)/;
const KRESLI = /fixed inset-0[^"'`]*(?:\bbg-|backdrop-blur|modal-overlay|discard-guard)|(?:\bbg-|backdrop-blur|modal-overlay|discard-guard)[^"'`]*fixed inset-0/;

const nalezy = [];
for (const soubor of KOREN.flatMap(souboryTsx)) {
  const txt = readFileSync(soubor, 'utf8');
  if (!PREKRYV.test(txt) || !KRESLI.test(txt)) continue;
  const chybi = [];
  if (!txt.includes('modal-overlay')) chybi.push('modal-overlay');
  if (!txt.includes('modal-sheet')) chybi.push('modal-sheet');
  if (chybi.length) nalezy.push(`${soubor} — chybí ${chibiText(chybi)}`);
}

function chibiText(ch) { return ch.map(c => '`' + c + '`').join(' a '); }

if (nalezy.length) {
  console.error('Vlastní překryv bez tříd listu (na telefonu nevyjede zdola):\n');
  for (const n of nalezy) console.error('  ' + n);
  console.error('\nPřekryv dostane `modal-overlay`, panel `modal-sheet`.');
  console.error('Nebo rovnou použij <Modal> z components/ui — umí to samo.');
  process.exit(1);
}
console.log('Okna na telefonu vyjíždějí zdola — každý vlastní překryv má třídy listu.');
