// Historie receptur a návrhy úprav (kolo 8, R8-5) — čistá část bez Reactu a databáze.
//
// Uložení receptury dřív smazalo a znovu vložilo řádky pos_product_map a do auditu
// šlo jen „Latte: 4 ingrediencí". Když se marže propadla, nešlo zjistit, že někdo
// změnil 18 g kávy na 22 g. Teď každé uložení zapíše verzi (pos_recipe_versions,
// snímek surovin i s názvy a jednotkami) a tenhle modul umí dvě verze porovnat —
// pro okno Historie, pro audit („Káva 18 g → 22 g") i pro návrh ke schválení
// (pos_recipe_proposals: zaměstnanec s receptury.navrhnout navrhne, vedení vidí
// rozdíl a dopad na cenu porce a schválí nebo vrátí s poznámkou).
//
// Čte ho RecipesView, widget Receptury (oblasti/receptury.tsx), obě routy pos/recipe-*
// a test scripts/testy/k84-uzaverky.ts — relativní importy s příponou, bez @/.

import { JEDNOTKY_RODIN, rodinaJednotky, faktorJednotky } from './jednotky.ts';
import { LOCALE_PRO_JAZYK } from './i18n/config.ts';

/** Výchozí národní prostředí pro text bez jazyka uživatele (audit na serveru). */
const CESKY = LOCALE_PRO_JAZYK.cs;

/** Surovina ve snímku verze: množství v jednotce položky (jako v pos_product_map) + jméno a jednotka z doby uložení. */
export interface SurovinaVerze { itemId: number; itemName: string | null; amount: number; unit: string | null }

export interface VerzeReceptury {
  id: number;
  productId: string;
  productName: string | null;
  ingredients: SurovinaVerze[];
  /** Náklad surovin na porci v okamžiku uložení (snímek z editoru); null = nešlo spočítat. */
  costPerPortion: number | null;
  changedBy: { id: number; name: string; avatar: string | null } | null;
  changedAt: string;
  /** „Vráceno na verzi z 3. 10.", „Schválen návrh Petry" — odkud změna přišla. */
  note: string | null;
}

export type StavNavrhu = 'ceka' | 'schvaleno' | 'vraceno';
export const STAVY_NAVRHU: readonly StavNavrhu[] = ['ceka', 'schvaleno', 'vraceno'];
export const jeStavNavrhu = (x: unknown): x is StavNavrhu => typeof x === 'string' && (STAVY_NAVRHU as readonly string[]).includes(x);

export interface NavrhReceptury {
  id: number;
  productId: string;
  productName: string | null;
  ingredients: SurovinaVerze[];
  /** Co platilo, když návrh vznikl — rozdíl se ukazuje proti tomu. */
  puvodni: SurovinaVerze[];
  reason: string;
  status: StavNavrhu;
  author: { id: number; name: string; avatar: string | null } | null;
  reviewer: { id: number; name: string } | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  costPerPortion: number | null;
  /** Náklad porce původní receptury (snímek) — dopad návrhu je rozdíl. */
  puvodniCost: number | null;
  /** Napsal ho ten, kdo se dívá (server už rozhodl). */
  muj: boolean;
}

/** Nejdelší důvod návrhu a poznámka vedení. */
export const MAX_DELKA_DUVODU = 500;

const cislo = (x: unknown): number => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
const pole = (x: unknown): any[] => (Array.isArray(x) ? x : []);

/** Suroviny ze syrového JSON (snímek verze, tělo návrhu); neplatné řádky se vynechají. */
export function normalizujSuroviny(raw: unknown, strop = 12): SurovinaVerze[] {
  const out: SurovinaVerze[] = [];
  for (const i of pole(raw).slice(0, strop)) {
    const itemId = Math.round(cislo(i?.itemId));
    const amount = cislo(i?.amount);
    if (!Number.isFinite(itemId) || itemId <= 0 || amount <= 0) continue;
    out.push({
      itemId,
      itemName: i?.itemName == null ? null : String(i.itemName).slice(0, 160),
      amount: Math.round(amount * 1e6) / 1e6,
      unit: i?.unit == null ? null : String(i.unit).slice(0, 12),
    });
  }
  return out;
}

const osoba = (raw: any): { id: number; name: string; avatar: string | null } | null =>
  raw && raw.id != null ? { id: Number(raw.id), name: String(raw.name ?? ''), avatar: raw.avatar == null ? null : String(raw.avatar) } : null;

/** Odpověď GET /api/pos/recipe-history?productId= → verze od nejnovější. Jiný tvar je chyba, ne prázdno. */
export function vyberHistorii(raw: unknown): VerzeReceptury[] {
  const r = raw as any;
  if (!r || typeof r !== 'object' || !Array.isArray(r.versions)) throw new Error('Historie receptury přišla v nečekaném tvaru.'); // i18n-ok
  return r.versions.filter((v: any) => v && v.id != null).map((v: any): VerzeReceptury => ({
    id: Number(v.id),
    productId: String(v.productId ?? ''),
    productName: v.productName == null ? null : String(v.productName),
    ingredients: normalizujSuroviny(v.ingredients, 60),
    costPerPortion: v.costPerPortion == null || !Number.isFinite(Number(v.costPerPortion)) ? null : Number(v.costPerPortion),
    changedBy: osoba(v.changedBy),
    changedAt: String(v.changedAt ?? ''),
    note: v.note == null ? null : String(v.note),
  }));
}

/** Odpověď GET /api/pos/recipe-proposals → návrhy od nejnovějšího. */
export function vyberNavrhy(raw: unknown): NavrhReceptury[] {
  const r = raw as any;
  if (!r || typeof r !== 'object' || !Array.isArray(r.proposals)) throw new Error('Návrhy receptur přišly v nečekaném tvaru.'); // i18n-ok
  return r.proposals.filter((n: any) => n && n.id != null).map((n: any): NavrhReceptury => ({
    id: Number(n.id),
    productId: String(n.productId ?? ''),
    productName: n.productName == null ? null : String(n.productName),
    ingredients: normalizujSuroviny(n.ingredients, 60),
    puvodni: normalizujSuroviny(n.puvodni, 60),
    reason: String(n.reason ?? ''),
    status: jeStavNavrhu(n.status) ? n.status : 'ceka',
    author: osoba(n.author),
    reviewer: n.reviewer && n.reviewer.id != null ? { id: Number(n.reviewer.id), name: String(n.reviewer.name ?? '') } : null,
    reviewedAt: n.reviewedAt == null ? null : String(n.reviewedAt),
    reviewNote: n.reviewNote == null ? null : String(n.reviewNote),
    createdAt: String(n.createdAt ?? ''),
    costPerPortion: n.costPerPortion == null || !Number.isFinite(Number(n.costPerPortion)) ? null : Number(n.costPerPortion),
    puvodniCost: n.puvodniCost == null || !Number.isFinite(Number(n.puvodniCost)) ? null : Number(n.puvodniCost),
    muj: n.muj === true,
  }));
}

// ---------------------------------------------------------------------------
// Rozdíl dvou verzí
// ---------------------------------------------------------------------------

export interface ZmenaSuroviny { itemId: number; itemName: string | null; unit: string | null; pred: number; po: number }
export interface RozdilVerzi { pridano: SurovinaVerze[]; odebrano: SurovinaVerze[]; zmeneno: ZmenaSuroviny[] }

/** Co se mezi dvěma snímky změnilo: přidané, odebrané a jiné množství (podle itemId). */
export function rozdilVerzi(stare: SurovinaVerze[], nove: SurovinaVerze[]): RozdilVerzi {
  const pred = new Map(stare.map(s => [s.itemId, s]));
  const po = new Map(nove.map(s => [s.itemId, s]));
  const pridano = nove.filter(s => !pred.has(s.itemId));
  const odebrano = stare.filter(s => !po.has(s.itemId));
  const zmeneno: ZmenaSuroviny[] = [];
  for (const n of nove) {
    const s = pred.get(n.itemId);
    if (!s || Math.abs(s.amount - n.amount) < 1e-9) continue;
    zmeneno.push({ itemId: n.itemId, itemName: n.itemName ?? s.itemName, unit: n.unit ?? s.unit, pred: s.amount, po: n.amount });
  }
  return { pridano, odebrano, zmeneno };
}

export const jeBezeZmeny = (r: RozdilVerzi): boolean => r.pridano.length === 0 && r.odebrano.length === 0 && r.zmeneno.length === 0;

/**
 * Množství v jednotce položky jako čitelný text: 0,018 kg → „18 g", 0,2 l → „2 dl", 2 ks → „2 ks".
 * Stejná volba jednotky jako v editoru (největší, ve které není samá nula).
 */
export function mnozstviText(amount: number, unit: string | null, locale: string = CESKY): string {
  const rodina = rodinaJednotky(unit ?? 'ks');
  const opts = JEDNOTKY_RODIN[rodina];
  const base = amount * faktorJednotky(unit ?? 'ks');
  const pick = [...opts].reverse().find(o => base / o.toBase >= 1) ?? opts[0];
  const n = base / pick.toBase;
  return `${Number(n.toFixed(3)).toLocaleString(locale, { maximumFractionDigits: 3 })} ${pick.label}`;
}

/** Věta rozdílu pro audit a řádek historie: „Káva 18 g → 22 g · + Sirup 10 ml · − Mléko". Prázdný rozdíl = „beze změny". */
export function popisRozdilu(r: RozdilVerzi, locale: string = CESKY): string {
  const kusy: string[] = [];
  const jmeno = (s: { itemName: string | null; itemId: number }) => s.itemName ?? `#${s.itemId}`;
  for (const z of r.zmeneno) kusy.push(`${jmeno(z)} ${mnozstviText(z.pred, z.unit, locale)} → ${mnozstviText(z.po, z.unit, locale)}`);
  for (const p of r.pridano) kusy.push(`+ ${jmeno(p)} ${mnozstviText(p.amount, p.unit, locale)}`);
  for (const o of r.odebrano) kusy.push(`− ${jmeno(o)}`);
  return kusy.length ? kusy.join(' · ') : 'beze změny'; // i18n-ok (audit)
}

/** Dopad na cenu porce: rozdíl nákladů, když jsou oba známé. */
export function dopadNaPorci(pred: number | null, po: number | null): number | null {
  if (pred == null || po == null) return null;
  return Math.round((po - pred) * 100) / 100;
}

/** Marže v % z ceny v kase a nákladu porce (celé procento, bez ceny null). */
export function marzeProcenta(cena: number | null | undefined, naklad: number | null): number | null {
  if (cena == null || !(cena > 0) || naklad == null) return null;
  return Math.round(((cena - naklad) / cena) * 100);
}

// ---------------------------------------------------------------------------
// Souhrny pro widget Receptury
// ---------------------------------------------------------------------------

/** Kolik různých receptur se změnilo v posledních `dni` dnech (verze podle changedAt). */
export function recepturZmenenychZaDni(verze: Pick<VerzeReceptury, 'productId' | 'changedAt'>[], ted: number, dni = 7): number {
  const od = ted - dni * 86_400_000;
  const ids = new Set<string>();
  for (const v of verze) {
    const t = new Date(v.changedAt).getTime();
    if (Number.isFinite(t) && t >= od && t <= ted + 60_000) ids.add(v.productId);
  }
  return ids.size;
}

/** Návrhy, které čekají na rozhodnutí, nejstarší první (fronta ke schválení). */
export function cekajiciNavrhy(navrhy: NavrhReceptury[]): NavrhReceptury[] {
  return navrhy.filter(n => n.status === 'ceka').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Poslední návrh toho, kdo se dívá, k dané receptuře — Chip stavu v editoru („Čeká", „Schváleno", „Vráceno"). */
export function mujPosledniNavrh(navrhy: NavrhReceptury[], productId: string): NavrhReceptury | null {
  return navrhy.filter(n => n.muj && n.productId === productId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

/**
 * Kdo s recepturou co smí (klíče z lib/opravneniKatalog.ts):
 *  - upravit  → ukládá rovnou (a schvaluje návrhy)
 *  - navrhnout bez upravit → editor je živý, ale místo „Uložit" je „Navrhnout změnu" + „Proč"
 *  - jen zobrazit → čte
 */
export type RezimEditoru = 'upravit' | 'navrhnout' | 'cist';
export function rezimEditoru(ma: (klic: string) => boolean): RezimEditoru {
  if (ma('receptury.upravit')) return 'upravit';
  if (ma('receptury.navrhnout')) return 'navrhnout';
  return 'cist';
}

// ---------------------------------------------------------------------------
// Odkaz na návod z editoru receptury
// ---------------------------------------------------------------------------

/**
 * Kam vede „Návod: …" v editoru receptury, když stránka nemá navigaci v ruce.
 * Dřív mířil natvrdo na /employer/overview — zaměstnance (receptury vidí od kola 5)
 * to přesměrovalo na /employee/shifts a návod se ztratil.
 */
export function odkazNaNavodZEditoru(stranka: 'vedeni.receptury' | 'zamestnanec.receptury', guideId: number): string {
  return stranka === 'zamestnanec.receptury'
    ? `/employee/shifts?view=guides&guide=${guideId}`
    : `/employer/overview?view=guides&guide=${guideId}`;
}
