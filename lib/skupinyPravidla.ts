// Kombinace segmentů pro publikum zpráv — čistá logika bez databáze (testy: scripts/testy/k81-skupiny.ts).
//
// Publikum zprávy může být jedna podmínka (segment, úroveň, skupina), nebo kombinace zapsaná jako
// `mix:<režim>|část|část`. Režim je `and` (musí platit všechno) nebo `or` (stačí cokoli). V režimu
// `and` smí část začínat `!` — „kromě těch, kdo…“.
// Příklad: `mix:and|quiet:60|!tier:gold` = nepřišli dva měsíce a nejsou zlatí.
// Dynamické skupiny (pravidla s dny, útratou a narozeninami) žijí v lib/clenoveFiltr.ts.

import { jeSegment, stitekPublika } from './segmenty.ts';

export const MAX_CASTI_KOMBINACE = 5;

// ---- Kombinace ----------------------------------------------------------------------

export type RezimKombinace = 'and' | 'or';

export interface Kombinace { rezim: RezimKombinace; casti: string[] }

const TIERY = ['tier:silver', 'tier:gold', 'tier:platinum'];

/** Smí být část kombinace? Segment, úroveň, a (jen když to dovolíš) ruční skupina. */
export function platnaCast(c: string, volby: { skupiny?: boolean } = {}): boolean {
  const s = c.startsWith('!') ? c.slice(1) : c;
  if (jeSegment(s) || TIERY.includes(s)) return true;
  return !!volby.skupiny && /^group:\d{1,9}$/.test(s);
}

function jeKombinace(s: unknown): boolean {
  return typeof s === 'string' && s.startsWith('mix:');
}

export function zapisKombinaci(rezim: RezimKombinace, casti: string[]): string {
  return `mix:${rezim}|${casti.join('|')}`;
}

/** Přečte zápis kombinace; neplatný (neznámá část, málo částí, `!` v režimu `or`) dává null. */
export function ctiKombinaci(s: unknown, volby: { skupiny?: boolean } = {}): Kombinace | null {
  if (!jeKombinace(s)) return null;
  const [hlava, ...casti] = String(s).split('|');
  const rezim = hlava.slice(4);
  if (rezim !== 'and' && rezim !== 'or') return null;
  if (casti.length < 2 || casti.length > MAX_CASTI_KOMBINACE) return null;
  if (new Set(casti).size !== casti.length) return null;
  if (!casti.every(c => platnaCast(c, volby))) return null;
  if (rezim === 'or' && casti.some(c => c.startsWith('!'))) return null;
  if (rezim === 'and' && casti.every(c => c.startsWith('!'))) return null;
  return { rezim, casti };
}

/**
 * Spojí množiny členů podle režimu. `and`: průnik kladných částí bez členů ze záporných (`!`);
 * `or`: sjednocení. Pořadí výsledku je pořadí prvního výskytu; duplicity nevznikají.
 */
export function sloucMnoziny(rezim: RezimKombinace, casti: { cast: string; ids: number[] }[]): number[] {
  if (rezim === 'or') {
    const out = new Set<number>();
    for (const c of casti) for (const id of c.ids) out.add(id);
    return Array.from(out);
  }
  const kladne = casti.filter(c => !c.cast.startsWith('!'));
  const zaporne = casti.filter(c => c.cast.startsWith('!'));
  if (!kladne.length) return [];
  const zakaz = new Set<number>();
  for (const z of zaporne) for (const id of z.ids) zakaz.add(id);
  let cur = Array.from(new Set(kladne[0].ids));
  for (const k of kladne.slice(1)) {
    const s = new Set(k.ids);
    cur = cur.filter(id => s.has(id));
  }
  return cur.filter(id => !zakaz.has(id));
}

/** Popis jedné části lidsky („nepřišli dva měsíce a déle“, „ne zlatí hosté“). */
export function stitekCasti(c: string, nazvySkupin: Record<number, string> = {}): string {
  const zaporna = c.startsWith('!');
  const s = zaporna ? c.slice(1) : c;
  const gid = /^group:(\d+)$/.exec(s);
  const t = (gid ? stitekPublika(s, nazvySkupin[Number(gid[1])]) : stitekPublika(s)) ?? s;
  return zaporna ? `ne ${t}` : t;
}

/** Věta o kombinaci: „nepřišli měsíc a déle a zlatí hosté“, „… nebo …“. */
export function stitekKombinace(k: Kombinace, nazvySkupin: Record<number, string> = {}): string {
  const spojka = k.rezim === 'and' ? ' a zároveň ' : ' nebo ';
  return k.casti.map(c => stitekCasti(c, nazvySkupin)).join(spojka);
}
