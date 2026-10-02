// Skupiny členů v plné síle a kombinace segmentů — čistá logika bez databáze
// (testy: scripts/testy/k81-skupiny.ts).
//
//  * Skupina má název, popis, barvu a archiv; může být ruční (členy přidává
//    člověk), nebo dynamická (členy počítá pravidlo z chování hostů).
//  * Pravidlo i publikum zprávy sdílí jeden zápis: `mix:<režim>|část|část`.
//    Režim je `and` (musí platit všechno) nebo `or` (stačí cokoli). V režimu
//    `and` smí část začínat `!` — „kromě těch, kdo…“.
//    Příklad: `mix:and|quiet:60|!tier:gold` = nepřišli dva měsíce a nejsou zlatí.
//  * Dynamická skupina nesmí odkazovat na jinou skupinu (žádné smyčky);
//    publikum zprávy na skupinu odkazovat smí.

import { jeSegment, stitekPublika } from './segmenty.ts';
import { czCount } from './czech.ts';

export const MAX_NAZEV_SKUPINY = 60;
export const MAX_POPIS_SKUPINY = 200;
export const MAX_CASTI_KOMBINACE = 5;

/** Barva skupiny je číslo 1 až 6 (řada .cat-N v globals.css — rozlišuje, nic neznamená). */
export const BARVY_SKUPIN: { id: string; nazev: string }[] = [
  { id: '1', nazev: 'Limetková' }, { id: '2', nazev: 'Modrá' }, { id: '3', nazev: 'Fialová' },
  { id: '4', nazev: 'Jantarová' }, { id: '5', nazev: 'Tyrkysová' }, { id: '6', nazev: 'Růžová' },
];

export function jeBarvaSkupiny(v: unknown): v is string {
  return BARVY_SKUPIN.some(b => b.id === String(v));
}

export interface MetaSkupiny { name: string; description: string | null; color: string | null }

/**
 * Název, popis a barva z těla požadavku. Pole, které požadavek neposílá, se bere z `cur`
 * (PATCH nesmí přepsat popis prázdným, když se mění jen název).
 */
export function overMetaSkupiny(b: any, cur?: Partial<MetaSkupiny> | null): { ok: true; meta: MetaSkupiny } | { ok: false; error: string } {
  const name = b?.name !== undefined ? String(b.name).trim().replace(/\s+/g, ' ').slice(0, MAX_NAZEV_SKUPINY) : String(cur?.name ?? '');
  if (!name) return { ok: false, error: 'Zadej název skupiny.' };
  const popisRaw = b?.description !== undefined ? String(b.description ?? '').trim().slice(0, MAX_POPIS_SKUPINY) : (cur?.description ?? '');
  let color: string | null = cur?.color ?? null;
  if (b?.color !== undefined) {
    if (b.color === null || b.color === '') color = null;
    else if (jeBarvaSkupiny(b.color)) color = String(b.color);
    else return { ok: false, error: 'Neznámá barva skupiny.' };
  }
  return { ok: true, meta: { name, description: popisRaw || null, color } };
}

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

export function jeKombinace(s: unknown): boolean {
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

/** Věta pro publikum zprávy nebo pravidlo skupiny, ať je zapsané jakkoli. */
export function stitekPublikaVcetneKombinace(a: string, nazvySkupin: Record<number, string> = {}): string | null {
  const k = ctiKombinaci(a, { skupiny: true });
  if (k) return stitekKombinace(k, nazvySkupin);
  return null;
}

/** Shrnutí dynamické skupiny do řádku seznamu. */
export function popisPravidlaSkupiny(rule: string | null | undefined): string | null {
  if (!rule) return null;
  if (jeSegment(rule) || TIERY.includes(rule)) return `Dynamická: ${stitekPublika(rule) ?? rule}`;
  const k = ctiKombinaci(rule);
  return k ? `Dynamická: ${stitekKombinace(k)}` : null;
}

/** Pravidlo dynamické skupiny z těla požadavku: jedna část, nebo kombinace; bez odkazu na skupiny. */
export function overPravidloSkupiny(v: unknown): { ok: true; rule: string | null } | { ok: false; error: string } {
  if (v === null || v === undefined || v === '') return { ok: true, rule: null };
  const s = String(v);
  if (platnaCast(s) && !s.startsWith('!')) return { ok: true, rule: s };
  if (ctiKombinaci(s)) return { ok: true, rule: s };
  return { ok: false, error: 'Pravidlo skupiny není platné. Vyber jednu nebo víc podmínek, nejvýš pět.' };
}

/** „12 členů“ s přívlastkem dynamická / ruční pro meta řádek. */
export function popisPoctuSkupiny(members: number, dynamicka: boolean): string {
  const n = czCount(members, { one: 'člen', few: 'členové', many: 'členů' });
  return dynamicka ? `${n} (počítá se samo)` : n;
}

/** Skupiny, které jde vybrat jako cíl ručního přidání: nearchivované a ruční. */
export function jeRucniAktivni(g: { rule?: string | null; archived?: boolean | null }): boolean {
  return !g.rule && !g.archived;
}
