#!/usr/bin/env node
// Stavová barva, kterou si obrazovka namíchala sama.
//
// Paleta měla u každého stavu jen podklad (`-bg`) a text (`-ink`). Plný
// odstín ani střední alfa v ní nebyly, takže si je každé místo vymyslelo
// z Tailwindu. Naměřeno napříč aplikací: dvanáct různých červených a deset
// jantarových pro dva významy — „Zamítnuto" bylo na jedné obrazovce
// #DC2626, na druhé #EF4444 a na třetí #B91C1C.
//
// Od kola 36 vedou stavové tóny přes tokeny (`bg-bad`, `text-wait-ink`,
// `border-info/40`), které navíc umí tmavý režim samy od sebe. Tahle
// kontrola hlídá, aby se syrové tailwindové odstíny nevracely.
//
// Kategorie (`.cat-1..6`) sem nepatří — ty mají vlastní řadu a řeší se
// v globals.css, ne třídami v komponentách.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Rodiny, které nesou význam stavu. Šedé stupně (`black/NN`) a limetka
// značky sem nepatří: ty vlastní tokeny mají.
const RODINY = 'red|amber|yellow|orange|blue|sky|indigo|emerald|green|teal|cyan|violet|purple|pink|rose|lime';
const UTILITY = 'bg|text|border|ring|divide|fill|stroke|outline|placeholder|caret|accent|shadow|from|to|via';
const VZOR = new RegExp(`\\b(?:${UTILITY})-(?:${RODINY})-\\d{2,3}\\b`, 'g');

// Barvy palety. Značka je inkoust, krém a limetka plus pět stavových tónů;
// cokoli dalšího barevného je odhad.
const PALETA = new Set([
  '16181a', 'c8f542', '5b7a08', '3e5406', '0a84ff', '0a5cc0', 'd8ff6b',
  // řada kategorií (cat-1..6) — vlastní systém, ne stav
  '8b5cf6', 'f59e0b', '14b8a6', 'ec4899', '6d3fc4', '92600a', '0e6e63', 'a4246c',
]);

// Nebarevné plochy (skoro bílá, skoro černá, šedá) sem nepatří — ty nesou
// povrch, ne význam. Poznáme je po sytosti, ne podle seznamu.
function chromaticka(hex) {
  const n = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex.slice(0, 6);
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return false;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx === 0) return false;
  const l = (mx + mn) / 510;
  const s = (mx - mn) / 255 / (1 - Math.abs(2 * l - 1) || 1);
  return s > 0.25 && l > 0.05 && l < 0.96;
}

// Ráčna na barevné hexy mimo paletu. Naměřeno šest zelených (#5B7A08,
// #3E5406, #4F6A07, #8FB811, #5B9E00, #89AC16) a tři modré pro tytéž
// významy. Sjednotit je znamená rozhodnout, který odstín je ten pravý —
// to je vlastní kolo. Do té doby smí počet jen klesat.
const BASELINE_HEXY = 110;

const nalezy = [];
const hexy = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue;
    const file = join(dir, name);
    if (statSync(file).isDirectory()) { walk(file); continue; }
    if (!/\.tsx$/.test(file)) continue;
    const s = readFileSync(file, 'utf8');
    s.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(VZOR)) {
        nalezy.push({ kde: `${relative('.', file)}:${i + 1}`, co: m[0], proc: 'syrový tailwindový odstín' });
      }
      // Hex zápis barvy v třídě: `bg-[#FFD60A]`, `text-[#8A6D00]`.
      for (const m of line.matchAll(/-\[#([0-9a-fA-F]{3,8})\]/g)) {
        const hex = m[1].toLowerCase();
        if (PALETA.has(hex) || PALETA.has(hex.slice(0, 6))) continue;
        if (!chromaticka(hex)) continue;
        hexy.push({ kde: `${relative('.', file)}:${i + 1}`, co: `#${m[1]}` });
      }
    });
  }
};
walk('components');

if (hexy.length > BASELINE_HEXY) {
  console.error(`\nPřibyla barva mimo paletu: ${hexy.length} (povoleno ${BASELINE_HEXY}).`);
  console.error('Značka je inkoust, krém a limetka plus pět stavových tónů. Nový odstín');
  console.error('pro tentýž význam znamená, že si ho někdo odhadl.\n');
  for (const h of hexy.slice(0, 20)) console.error(`  ${h.kde}  ${h.co}`);
  process.exit(1);
}
if (hexy.length < BASELINE_HEXY) {
  console.error(`\nBarev mimo paletu ubylo: ${hexy.length} místo ${BASELINE_HEXY}.`);
  console.error('Sniž BASELINE_HEXY v scripts/check-status-colors.mjs, ať ráčna drží.\n');
  process.exit(1);
}
if (nalezy.length) {
  console.error(`\nStavová barva mimo paletu: ${nalezy.length}.`);
  console.error('Stav se sděluje tokenem, ne odhadnutým odstínem — `bg-bad`, `text-wait-ink`,');
  console.error('`border-info/40`. Tokeny navíc umí tmavý režim samy; tailwindový odstín ne.\n');
  for (const n of nalezy.slice(0, 40)) console.error(`  ${n.kde}  ${n.co}  (${n.proc})`);
  if (nalezy.length > 40) console.error(`  … a ${nalezy.length - 40} dalších`);
  process.exit(1);
}
console.log(`check-status-colors: stavy vedou přes tokeny palety; barev mimo paletu ${hexy.length} (ráčna).`);
