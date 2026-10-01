#!/usr/bin/env node
// Řádek s pevnými šířkami, který se nevejde ani do nejužšího telefonu.
//
// Nejčastější příčina „občas se to na mobilu uřízne": řádek (`flex`, bez zalamování) složený z prvků
// s pevnou šířkou (`w-16 shrink-0`, tlačítka `w-9`, pole `w-14`), jejichž součet je větší než šířka
// obsahu na telefonu 320 px. Na monitoru i na 390 px to vypadá dobře; na 320 se poslední sloupec
// (mezisoučet u bankovek v uzávěrce) uřízne o rodiče s `overflow-hidden`, nebo přeteče přes kartu.
//
// Kontrola spočítá DOLNÍ ODHAD šířky každého řádku z toho, co je ve zdrojáku jisté:
//   • prvek s `w-N` / `w-[Npx]` a `shrink-0` (nebo tlačítko / pole, které se pod zadanou šířku nesmrští),
//   • mezery `gap-N`, vnitřní okraje `px-N` / `pl-N` / `pr-N`, vnější `ml-N` / `mr-N`,
//   • vnořený řádek se počítá součtem svých dětí, blok maximem; text se počítá nulou (neví se, kolik zabere).
// Když i takhle optimisticky spočítaný řádek přesáhne šířku obsahu na 320 px (320 − 2 × 16 = 288),
// nevejde se určitě. Řádek s `flex-wrap`, `overflow-x-auto`, s `hidden` bez breakpointu a třídy
// s prefixem breakpointu (`sm:w-20`) se na telefonu nepočítají.
//
// Oprava: zúžit pevné prvky, nebo pod `sm:` přeskládat (mezisoučet pod popisek, tlačítka do dalšího řádku).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const KOREN = process.env.PEVNE_SIRKY_KOREN ? process.env.PEVNE_SIRKY_KOREN.split(',') : ['components', 'app']; // env jen pro test kontroly
const MAX = 288; // šířka obsahu při oknu 320 px a bočním okraji 16 px
const PX = (n) => Number(n) * 4; // jednotka Tailwindu = 0,25 rem = 4 px

function* soubory(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== 'node_modules' && f !== '.next') yield* soubory(p); }
    else if (f.endsWith('.tsx')) yield p;
  }
}

/** Třídy bez variant (`sm:`, `dark:`, `hover:` …), tedy to, co platí na telefonu. */
function zaklad(trida) {
  return trida.split(/\s+/).filter(t => t && !t.includes(':') && !t.startsWith('!') || /^!w-/.test(t)).map(t => t.replace(/^!/, ''));
}

function sirkaTridy(t) {
  let m;
  if ((m = t.match(/^(?:w|size)-(\d+(?:\.\d+)?)$/))) return PX(m[1]);
  if ((m = t.match(/^w-\[(\d+(?:\.\d+)?)px\]$/))) return Number(m[1]);
  if ((m = t.match(/^w-\[(\d+(?:\.\d+)?)rem\]$/))) return Number(m[1]) * 16;
  if ((m = t.match(/^min-w-(\d+(?:\.\d+)?)$/))) return PX(m[1]);
  if ((m = t.match(/^min-w-\[(\d+(?:\.\d+)?)px\]$/))) return Number(m[1]);
  return null;
}

/** Jednoduchý rozbor JSX: jen značky a jejich `className`, text se ignoruje. */
function strom(txt) {
  const koren = { tag: '#', tridy: [], deti: [], radek: 0 };
  const zasobnik = [koren];
  const re = /<(\/?)([A-Za-z][\w.]*)((?:[^<>{}]|\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\})*?)(\/?)>/g;
  for (const m of txt.matchAll(re)) {
    const [, zaviraci, tag, atributy, samozavirac] = m;
    if (zaviraci) { if (zasobnik.length > 1) zasobnik.pop(); continue; }
    let tridy = '';
    const lit = atributy.match(/className=(?:"([^"]*)"|'([^']*)')/);
    if (lit) tridy = lit[1] ?? lit[2];
    else {
      const sab = atributy.match(/className=\{`((?:[^`\\]|\\.)*)`\}/);
      if (sab) tridy = sab[1].replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, ' ');
    }
    const uzel = { tag, tridy: zaklad(tridy), deti: [], radek: txt.slice(0, m.index).split('\n').length };
    zasobnik[zasobnik.length - 1].deti.push(uzel);
    if (!samozavirac) zasobnik.push(uzel);
  }
  return koren;
}

const jeRadek = (u) => u.tridy.some(t => t === 'flex' || t === 'inline-flex') && !u.tridy.includes('flex-col') && !u.tridy.includes('flex-wrap')
  && !u.tridy.some(t => /^(overflow-x-(auto|scroll)|overflow-auto)$/.test(t)) && !u.tridy.includes('hidden');
const nesmrstitelny = (u) => u.tridy.some(t => t === 'shrink-0' || t === 'flex-none') || ['button', 'input', 'select', 'textarea'].includes(u.tag);

/** Dolní odhad šířky obsahu prvku (vnitřek včetně vnitřních okrajů). */
function obsah(u) {
  let vnitrni = 0;
  for (const t of u.tridy) {
    let m;
    if ((m = t.match(/^p[xlr]?-(\d+(?:\.\d+)?)$/))) vnitrni += PX(m[1]) * (t.startsWith('px') || t === `p-${m[1]}` ? 2 : 1);
  }
  const deti = u.deti.map(vnejsi);
  // Blok bez pevné šířky se nepočítá do hloubky: rozbor JSX je zjednodušený a špatně spárovaná značka by
  // jinak přičetla sourozence. Do hloubky se jde jen přes vnořené řádky (skupina tlačítek vedle pole).
  if (!jeRadek(u)) return vnitrni;
  let mezera = 0;
  for (const t of u.tridy) { const m = t.match(/^gap(?:-x)?-(\d+(?:\.\d+)?)$/); if (m) mezera = PX(m[1]); }
  const videne = deti.filter(d => d > 0).length;
  return vnitrni + deti.reduce((a, b) => a + b, 0) + mezera * Math.max(0, deti.length - 1) * (videne ? 1 : 0);
}

/** Dolní odhad šířky, kterou prvek zabere v rodičovském řádku (včetně vnějších okrajů). */
function vnejsi(u) {
  if (u.tridy.includes('hidden')) return 0;
  let okraj = 0;
  for (const t of u.tridy) {
    const m = t.match(/^m([xlr])-(\d+(?:\.\d+)?)$/);
    if (m) okraj += PX(m[2]) * (m[1] === 'x' ? 2 : 1);
  }
  let vlastni = 0;
  for (const t of u.tridy) { const w = sirkaTridy(t); if (w !== null && (nesmrstitelny(u) || t.startsWith('min-w'))) vlastni = Math.max(vlastni, w); }
  return Math.max(vlastni, obsah(u)) + okraj;
}

const nalezy = [];

for (const soubor of KOREN.flatMap(d => [...soubory(d)])) {
  const korenStromu = strom(readFileSync(soubor, 'utf8'));
  (function projdi(u) {
    if (u.tag !== '#' && jeRadek(u)) {
      const celkem = obsah(u);
      // jen nejhlubší příčina: žádné dítě samo není přes limit
      if (celkem > MAX && !u.deti.some(d => obsah(d) > MAX)) {
        nalezy.push(`${relative('.', soubor)}:${u.radek}  <${u.tag}> řádek s pevnými šířkami ≥ ${Math.round(celkem)} px (na 320 px je k dispozici ${MAX})`);
      }
    }
    u.deti.forEach(projdi);
  })(korenStromu);
}

if (nalezy.length) {
  console.error('Řádek s pevnými šířkami se nevejde na telefon 320 px:\n');
  for (const n of nalezy) console.error('  ' + n);
  console.error('\nZúžit pevné prvky, nebo pod `sm:` přeskládat (mezisoučet pod popisek, tlačítka na další řádek).');
  process.exit(1);
}
console.log('Pevné šířky v řádcích se vejdou na telefon 320 px.');
