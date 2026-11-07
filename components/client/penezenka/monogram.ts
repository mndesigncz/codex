// Tvář podniku ve směru A „Peněženka“ bez barvy značky: monogram na krému a krémová textura
// na inkoustu. Obojí se odvozuje deterministicky (stejný podnik = vždy stejná tvář), takže ji host
// pozná v balíčku, na obálce i na lístku. Barvu značky podniku aplikace hosta nepoužívá nikde.

export type TvarPodniku = 'kruhy' | 'koleje' | 'tecky';
const TVARY: readonly TvarPodniku[] = ['kruhy', 'koleje', 'tecky'];

/** Obecná slova na začátku názvu, která se do monogramu nepočítají („Kavárna U Lípy“ → „UL“). */
const OBECNA = new Set([
  'kavárna', 'kavarna', 'café', 'cafe', 'caffe', 'caffè', 'coffee', 'bistro', 'restaurace', 'restaurant', 'restaurace,',
  'čajovna', 'cajovna', 'bar', 'pub', 'pivnice', 'hospoda', 'hostinec', 'pizzeria', 'pekárna', 'pekarna', // generic-ok: druhy podniků se do monogramu nepočítají
  'cukrárna', 'cukrarna', 'vinárna', 'vinarna', 'jídelna', 'jidelna', 'kantýna', 'bufet', 'the',
]);

/** Dvě písmena monogramu: iniciály prvních dvou slov (bez obecného prvního slova), u jednoho slova „Pa“. */
export function monogram(nazev: string): string {
  const slova = String(nazev ?? '').trim().split(/[\s\-–—·&+/]+/).map(s => s.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
  if (!slova.length) return '·';
  const bez = slova.length > 2 && OBECNA.has(slova[0].toLocaleLowerCase('cs')) ? slova.slice(1) : slova;
  if (bez.length >= 2) return (Array.from(bez[0])[0] + Array.from(bez[1])[0]).toLocaleUpperCase('cs');
  const p = Array.from(bez[0]);
  return p.length > 1 ? p[0].toLocaleUpperCase('cs') + p[1].toLocaleLowerCase('cs') : p[0].toLocaleUpperCase('cs');
}

/** Textura a styl monogramu podle klíče podniku (slug, jinak název). */
export function tvarPodniku(klic: string): TvarPodniku {
  let h = 2166136261;
  for (const ch of String(klic ?? '')) { h ^= ch.codePointAt(0) ?? 0; h = Math.imul(h, 16777619); }
  return TVARY[Math.abs(h) % TVARY.length];
}
