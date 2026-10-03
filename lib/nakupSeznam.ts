// Chytrý nákupní seznam: filtr kategorií, hledání, seskupení, řazení, součty
// a odškrtávání v obchodě. Čistá logika bez Reactu a bez prohlížeče, aby šla
// celá otestovat (scripts/testy/nakup-seznam.ts) a aby okno seznamu v Inventory
// jen zobrazovalo to, co tady vyjde.
//
// Proč se ukládají VYNECHANÉ kategorie, ne vybrané: kdo jednou řekne „Drogerie
// a Nádobí na seznam nechci“, chce to tak mít i příště, a nová kategorie, kterou
// podnik založí, se má na seznamu objevit sama. Seznam vybraných by ji tiše
// schoval a položky by chyběly v objednávce.
//
// Kategorie se filtrují podle kořene stromu (Nápoje, Suroviny…): podkategorie
// jdou s nadřazenou. Seznam v obchodě má pár velkých skupin, ne třicet větviček.

import { obsahujeNekde, proHledani } from './hledani.ts';

export type StavZasobyNakup = 'ok' | 'low' | 'critical';
/** Co seznam ukazuje: vše, nebo jen jeden druh naléhavosti. */
export type Nalehavost = 'vse' | 'critical' | 'low' | 'vyroba' | 'jine';
export type Seskupit = 'dodavatel' | 'kategorie' | 'nalehavost' | 'zadne';
export type Razeni = 'nalehavost' | 'abeceda' | 'cena';

export const SESKUPIT: readonly Seskupit[] = ['dodavatel', 'kategorie', 'nalehavost', 'zadne'];
export const RAZENI: readonly Razeni[] = ['nalehavost', 'abeceda', 'cena'];
export const NALEHAVOSTI: readonly Nalehavost[] = ['vse', 'critical', 'low', 'vyroba', 'jine'];

/** Klíč skupiny „bez kategorie“ / „bez dodavatele“ (nepřekládá se, popisek až při výpisu). */
export const BEZ = '_bez';

export interface PolozkaNakupu {
  id: number;
  name: string;
  /** Název kategorie z položky (starší položky nemusí mít categoryId). */
  category?: string | null;
  categoryId?: number | null;
  supplier?: string | null;
  unit?: string | null;
  unitCost?: number | null;
  stav: StavZasobyNakup;
  /** Chybí na výrobu vlastních produktů (i když je zásoba nad limitem). */
  naVyrobu: boolean;
  /** Návrh množství k objednání. */
  navrh: number;
}

export interface KategorieStrom {
  id: number;
  name: string;
  parentId?: number | null;
  position?: number;
}

export interface Kontext {
  /** Kořen stromu pro každé id kategorie. */
  koreny: Map<number, { id: number; nazev: string }>;
  /** Pro položky bez categoryId: kategorie podle jména (malá písmena, bez diakritiky). */
  poJmenu: Map<string, { id: number; nazev: string }>;
  /** Pořadí kořenových kategorií, jak je má podnik seřazené. */
  poradi: Map<string, number>;
}

/** Kategorie jako kořen stromu; chrání se i proti zacyklenému rodiči. */
export function sestavKontext(kategorie: readonly KategorieStrom[]): Kontext {
  const byId = new Map(kategorie.map(c => [c.id, c]));
  const koreny = new Map<number, { id: number; nazev: string }>();
  const poJmenu = new Map<string, { id: number; nazev: string }>();
  const poradi = new Map<string, number>();
  const korenOd = (id: number): KategorieStrom | null => {
    let cur = byId.get(id) ?? null;
    const videno = new Set<number>();
    while (cur && cur.parentId != null && byId.has(cur.parentId) && !videno.has(cur.id)) {
      videno.add(cur.id);
      cur = byId.get(cur.parentId)!;
    }
    return cur;
  };
  for (const c of kategorie) {
    const koren = korenOd(c.id);
    if (!koren) continue;
    koreny.set(c.id, { id: koren.id, nazev: koren.name });
    const j = proHledani(c.name);
    if (j && !poJmenu.has(j)) poJmenu.set(j, { id: koren.id, nazev: koren.name });
  }
  const kor = kategorie.filter(c => c.parentId == null || !byId.has(c.parentId));
  kor.sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name, 'cs'))
    .forEach((c, i) => poradi.set(klicKategorie(c.id), i));
  return { koreny, poJmenu, poradi };
}

export const klicKategorie = (id: number): string => `k${id}`;

/** Do které skupiny kategorií položka patří: kořen jejího stromu, nebo „bez kategorie“. */
export function kategoriePolozky(p: PolozkaNakupu, ctx: Kontext): { klic: string; nazev: string | null } {
  if (p.categoryId != null) {
    const k = ctx.koreny.get(p.categoryId);
    if (k) return { klic: klicKategorie(k.id), nazev: k.nazev };
  }
  const jmeno = proHledani(p.category);
  if (jmeno) {
    const k = ctx.poJmenu.get(jmeno);
    if (k) return { klic: klicKategorie(k.id), nazev: k.nazev };
    // Kategorie, kterou podnik už nemá (smazaná, přejmenovaná): drží se podle jména.
    return { klic: `j:${jmeno}`, nazev: String(p.category).trim() };
  }
  return { klic: BEZ, nazev: null };
}

export interface FiltrNakupu {
  hledani: string;
  /** Klíče kategorií, které se na seznamu NEMAJÍ ukázat. */
  vynechane: readonly string[];
  nalehavost: Nalehavost;
  /** Jen jeden dodavatel (z widgetu); BEZ = položky bez dodavatele. */
  dodavatel: string | null;
}

export const PRAZDNY_FILTR: FiltrNakupu = { hledani: '', vynechane: [], nalehavost: 'vse', dodavatel: null };

const supplierOf = (p: PolozkaNakupu) => (p.supplier ?? '').trim();

export function odpovidaNalehavosti(p: PolozkaNakupu, n: Nalehavost): boolean {
  if (n === 'vse') return true;
  if (n === 'critical') return p.stav === 'critical';
  if (n === 'low') return p.stav === 'low';
  // „Na výrobu“: jen to, co chybí kvůli výrobě a samo pod limitem není.
  if (n === 'vyroba') return p.naVyrobu && p.stav === 'ok';
  // „Jiné“: nad limitem a nechybí na výrobu — přidané ručně nebo nahlášené týmem.
  return p.stav === 'ok' && !p.naVyrobu;
}

export function filtruj(polozky: readonly PolozkaNakupu[], f: FiltrNakupu, ctx: Kontext): PolozkaNakupu[] {
  const vynechane = new Set(f.vynechane);
  return polozky.filter(p => {
    if (vynechane.size && vynechane.has(kategoriePolozky(p, ctx).klic)) return false;
    if (!odpovidaNalehavosti(p, f.nalehavost)) return false;
    if (f.dodavatel != null && (f.dodavatel === BEZ ? supplierOf(p) !== '' : supplierOf(p) !== f.dodavatel)) return false;
    if (f.hledani.trim() && !obsahujeNekde(f.hledani, p.name, p.category, p.supplier)) return false;
    return true;
  });
}

const PORADI_STAVU: Record<StavZasobyNakup, number> = { critical: 0, low: 1, ok: 2 };
const abc = (a: string, b: string) => a.localeCompare(b, 'cs');

/** Cena řádku bez zaokrouhlování (nákupní cena smí mít haléře); null bez ceny. */
export function cenaRadku(p: PolozkaNakupu): number | null {
  const c = Number(p.unitCost);
  return Number.isFinite(c) && c > 0 ? p.navrh * c : null;
}

export function seradit(polozky: readonly PolozkaNakupu[], jak: Razeni): PolozkaNakupu[] {
  const kopie = [...polozky];
  if (jak === 'abeceda') return kopie.sort((a, b) => abc(a.name, b.name));
  if (jak === 'cena') {
    // Nejdražší první; bez ceny na konec (ať se neplete mezi levné).
    return kopie.sort((a, b) => {
      const ca = cenaRadku(a), cb = cenaRadku(b);
      if (ca == null && cb == null) return abc(a.name, b.name);
      if (ca == null) return 1;
      if (cb == null) return -1;
      return cb - ca || abc(a.name, b.name);
    });
  }
  return kopie.sort((a, b) => PORADI_STAVU[a.stav] - PORADI_STAVU[b.stav] || abc(a.name, b.name));
}

export interface Skupina {
  klic: string;
  /** null = „Bez dodavatele“ / „Bez kategorie“ (popisek doplní okno, ať se přeloží). */
  nazev: string | null;
  polozky: PolozkaNakupu[];
}

export type DruhNalehavosti = 'critical' | 'low' | 'vyroba' | 'jine';
export const druhNalehavosti = (p: PolozkaNakupu): DruhNalehavosti =>
  p.stav === 'critical' ? 'critical' : p.stav === 'low' ? 'low' : p.naVyrobu ? 'vyroba' : 'jine';

export function seskup(polozky: readonly PolozkaNakupu[], jak: Seskupit, ctx: Kontext): Skupina[] {
  if (jak === 'zadne') return polozky.length ? [{ klic: 'vse', nazev: null, polozky: [...polozky] }] : [];
  const mapa = new Map<string, Skupina>();
  const zarad = (klic: string, nazev: string | null, p: PolozkaNakupu) => {
    const s = mapa.get(klic);
    if (s) s.polozky.push(p); else mapa.set(klic, { klic, nazev, polozky: [p] });
  };
  for (const p of polozky) {
    if (jak === 'dodavatel') {
      const d = supplierOf(p);
      zarad(d || BEZ, d || null, p);
    } else if (jak === 'kategorie') {
      const k = kategoriePolozky(p, ctx);
      zarad(k.klic, k.nazev, p);
    } else {
      zarad(druhNalehavosti(p), druhNalehavosti(p), p);
    }
  }
  const out = Array.from(mapa.values());
  if (jak === 'nalehavost') {
    const poradi: Record<string, number> = { critical: 0, low: 1, vyroba: 2, jine: 3 };
    return out.sort((a, b) => poradi[a.klic] - poradi[b.klic]);
  }
  if (jak === 'kategorie') {
    // Pořadí, které si podnik nastavil u kategorií; neznámé podle abecedy, „bez“ nakonec.
    return out.sort((a, b) => {
      if (a.klic === BEZ) return 1;
      if (b.klic === BEZ) return -1;
      const pa = ctx.poradi.get(a.klic), pb = ctx.poradi.get(b.klic);
      if (pa != null && pb != null) return pa - pb;
      if (pa != null) return -1;
      if (pb != null) return 1;
      return abc(a.nazev ?? '', b.nazev ?? '');
    });
  }
  return out.sort((a, b) => (a.klic === BEZ ? 1 : b.klic === BEZ ? -1 : abc(a.nazev ?? '', b.nazev ?? '')));
}

export interface Souhrn {
  pocet: number;
  kriticke: number;
  dochazi: number;
  naVyrobu: number;
  /** Přidané ručně nebo nahlášené týmem (zásoba je v pořádku). */
  jine: number;
  /** Odhad ceny jen z položek, které cenu mají. */
  odhadCeny: number;
  /** Kolik položek cenu nemá (odhad je tedy dolní mez). */
  bezCeny: number;
}

export function souhrn(polozky: readonly PolozkaNakupu[]): Souhrn {
  const s: Souhrn = { pocet: polozky.length, kriticke: 0, dochazi: 0, naVyrobu: 0, jine: 0, odhadCeny: 0, bezCeny: 0 };
  for (const p of polozky) {
    const d = druhNalehavosti(p);
    if (d === 'critical') s.kriticke++; else if (d === 'low') s.dochazi++; else if (d === 'vyroba') s.naVyrobu++; else s.jine++;
    const c = cenaRadku(p);
    if (c == null) s.bezCeny++; else s.odhadCeny += c;
  }
  return s;
}

/**
 * Nabídka kategorií pro filtr: všechny kořenové skupiny, ve kterých na seznamu
 * něco je (s počtem), a také ty, které jsou právě vynechané (ať jdou zase vrátit,
 * i když v nich zrovna nic nechybí).
 */
export interface MoznostKategorie { klic: string; nazev: string | null; pocet: number }
export function moznostiKategorii(polozky: readonly PolozkaNakupu[], vynechane: readonly string[], ctx: Kontext): MoznostKategorie[] {
  const mapa = new Map<string, MoznostKategorie>();
  for (const p of polozky) {
    const k = kategoriePolozky(p, ctx);
    const m = mapa.get(k.klic);
    if (m) m.pocet++; else mapa.set(k.klic, { klic: k.klic, nazev: k.nazev, pocet: 1 });
  }
  for (const klic of vynechane) {
    if (mapa.has(klic) || klic === BEZ) continue;
    const koren = Array.from(ctx.koreny.values()).find(k => klicKategorie(k.id) === klic);
    mapa.set(klic, { klic, nazev: koren?.nazev ?? (klic.startsWith('j:') ? klic.slice(2) : null), pocet: 0 });
  }
  if (vynechane.includes(BEZ) && !mapa.has(BEZ)) mapa.set(BEZ, { klic: BEZ, nazev: null, pocet: 0 });
  return Array.from(mapa.values()).sort((a, b) => {
    if (a.klic === BEZ) return 1;
    if (b.klic === BEZ) return -1;
    const pa = ctx.poradi.get(a.klic), pb = ctx.poradi.get(b.klic);
    if (pa != null && pb != null) return pa - pb;
    if (pa != null) return -1;
    if (pb != null) return 1;
    return abc(a.nazev ?? '', b.nazev ?? '');
  });
}

// ---------------------------------------------------------------------------
// Zapamatovaný stav (localStorage, jen v tomhle prohlížeči)
// ---------------------------------------------------------------------------

export interface UlozenyStav {
  vynechane: string[];
  nalehavost: Nalehavost;
  seskupit: Seskupit;
  razeni: Razeni;
  /** Sbalené skupiny (klíče). */
  sbalene: string[];
}

export const VYCHOZI_STAV: UlozenyStav = { vynechane: [], nalehavost: 'vse', seskupit: 'dodavatel', razeni: 'nalehavost', sbalene: [] };

const jeText = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 120;
const pole = (x: unknown): string[] => (Array.isArray(x) ? Array.from(new Set(x.filter(jeText))).slice(0, 200) : []);

/** Přečte uložený stav a nevěří mu: cokoli, co nesedí, se nahradí výchozí hodnotou. */
export function nactiStav(raw: unknown): UlozenyStav {
  let o: any = raw;
  if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch { o = null; } }
  if (!o || typeof o !== 'object') return { ...VYCHOZI_STAV };
  return {
    vynechane: pole(o.vynechane),
    nalehavost: NALEHAVOSTI.includes(o.nalehavost) ? o.nalehavost : VYCHOZI_STAV.nalehavost,
    seskupit: SESKUPIT.includes(o.seskupit) ? o.seskupit : VYCHOZI_STAV.seskupit,
    razeni: RAZENI.includes(o.razeni) ? o.razeni : VYCHOZI_STAV.razeni,
    sbalene: pole(o.sbalene),
  };
}

/** Odškrtnuté položky platí jen ten den, kdy se v obchodě odškrtávaly. */
export function nactiOdskrtnute(raw: unknown, dnes: string): Set<number> {
  let o: any = raw;
  if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch { o = null; } }
  if (!o || typeof o !== 'object' || o.den !== dnes || !Array.isArray(o.ids)) return new Set();
  return new Set(o.ids.filter((n: unknown) => Number.isInteger(n) && (n as number) > 0).slice(0, 2000) as number[]);
}

export const serializujOdskrtnute = (ids: Iterable<number>, dnes: string): string =>
  JSON.stringify({ den: dnes, ids: Array.from(ids) });

/** Kolik z viditelných položek je odškrtnutých (odškrtnutá položka mimo filtr se nepočítá). */
export function postup(viditelne: readonly PolozkaNakupu[], odskrtnute: ReadonlySet<number>): { hotovo: number; celkem: number } {
  let hotovo = 0;
  for (const p of viditelne) if (odskrtnute.has(p.id)) hotovo++;
  return { hotovo, celkem: viditelne.length };
}

/** Odškrtnuté dolů na konec skupiny; jinak pořadí zůstane. */
export function odskrtnuteDolu<T extends { id: number }>(polozky: readonly T[], odskrtnute: ReadonlySet<number>): T[] {
  return [...polozky.filter(p => !odskrtnute.has(p.id)), ...polozky.filter(p => odskrtnute.has(p.id))];
}

/** Počet aktivních filtrů (pro odznak „Filtry (2)“ a tlačítko Zrušit filtry). */
export function pocetFiltru(f: FiltrNakupu): number {
  return (f.vynechane.length ? 1 : 0) + (f.nalehavost !== 'vse' ? 1 : 0) + (f.hledani.trim() ? 1 : 0);
}
