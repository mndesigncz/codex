// Podklady pro účetní — čistá logika (bez databáze, bez sítě).
//
// Martin: „export účtenek a dalších podobných věcí pro účetní, aby to bylo co
// nejjednodušší, i přímo těch fotek." Z řádků, které načte lib/ucetniExportDb.ts,
// tady vznikne:
//  - listy (účtenky, příjemky, uzávěrky, pokladní pohyby, tržby a DPH z pokladny,
//    výplaty — ty jen se svolením `finance.mzdy`) a souhrn za období;
//  - plán fotek v ZIPu: `fotky/uctenky/2026-10-03_Makro_1234,50Kc_ab12.jpg`
//    (datum, dodavatel bez diakritiky, částka, krátké id, přípona podle typu) —
//    unikátní, v tabulce sloupec „Soubor" s relativní cestou;
//  - CSV pro české programy: středník, UTF-8 s BOM, desetinná čárka, data ISO;
//  - PRECTI-ME.txt a název ZIPu.
// Obsah souborů je česky záměrně (jde účetní v ČR), proto řádky s `// i18n-ok`.
// Jména lidí jsou jen ve výplatách (a u výplat z kasy), a to jen se svolením mezd.
//
// Testy: scripts/testy/ucetni-export.ts.

import { cashDifference, normalizeMovements, normalizePhotos, type FotoDokladu, type Movement } from './closing.ts';
import { POPISKY_KATEGORII_CS, jeKategorieUctenky } from './financeWidgety.ts';
import type { ListXlsx, SloupecXlsx, BunkaXlsx } from './xlsx.ts';

// ---------------------------------------------------------------------------
// Období

const RE_DEN = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_MESIC = /^(\d{4})-(\d{2})$/;
/** Nejdelší období jednoho exportu (dny včetně krajních). */
export const MAX_DNI_OBDOBI = 366;

function platnyDen(d: string): boolean {
  const m = RE_DEN.exec(d);
  if (!m) return false;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return dt.getUTCFullYear() === +m[1] && dt.getUTCMonth() === +m[2] - 1 && dt.getUTCDate() === +m[3];
}

const dnyMezi = (od: string, doD: string) => Math.round((Date.parse(`${doD}T00:00:00Z`) - Date.parse(`${od}T00:00:00Z`)) / 86400000);

export type OvereniObdobi = { ok: true; od: string; do: string } | { ok: false; chyba: string };

/** Období exportu: dvě platná data RRRR-MM-DD, od ≤ do, nejvýš rok. */
export function overObdobi(od: unknown, doD: unknown): OvereniObdobi {
  if (typeof od !== 'string' || typeof doD !== 'string' || !platnyDen(od) || !platnyDen(doD)) {
    return { ok: false, chyba: 'Období musí být dvě data ve tvaru RRRR-MM-DD.' };
  }
  if (doD < od) return { ok: false, chyba: 'Konec období je před jeho začátkem.' };
  if (dnyMezi(od, doD) + 1 > MAX_DNI_OBDOBI) return { ok: false, chyba: 'Období může být nejvýš jeden rok.' };
  return { ok: true, od, do: doD };
}

/** Celý měsíc „RRRR-MM" → první a poslední den. */
export function obdobiMesice(mesic: string): { od: string; do: string } | null {
  const m = RE_MESIC.exec(mesic);
  if (!m || +m[2] < 1 || +m[2] > 12) return null;
  const posledni = new Date(Date.UTC(+m[1], +m[2], 0)).getUTCDate();
  return { od: `${mesic}-01`, do: `${mesic}-${String(posledni).padStart(2, '0')}` };
}

/** Předchozí měsíc k pražskému dni „RRRR-MM-DD" → „RRRR-MM". */
export function minulyMesic(dnes: string): string {
  const [r, m] = dnes.split('-').map(Number);
  return m === 1 ? `${r - 1}-12` : `${r}-${String(m - 1).padStart(2, '0')}`;
}

/** Je období přesně jeden celý měsíc? Vrátí ho („RRRR-MM"), jinak null. */
export function celyMesic(od: string, doD: string): string | null {
  const mesic = od.slice(0, 7);
  const o = obdobiMesice(mesic);
  return o && o.od === od && o.do === doD ? mesic : null;
}

/** Den v měsíci, kdy chodí automatický e-mail účetní (cron běží ráno toho dne). */
export const DEN_AUTOMATU = 3;

/**
 * Měsíc, za který má automat právě teď poslat podklady, nebo null.
 * Posílá se od 3. dne v měsíci za minulý měsíc, jednou (idempotence přes `accountant_last_sent`):
 * opakovaný běh cronu ve stejném měsíci ani ruční spuštění nic nepošle podruhé.
 */
export function mesicProAutomat(dnes: string, posledniOdeslany: string | null | undefined): string | null {
  if (!platnyDen(dnes)) return null;
  if (Number(dnes.slice(8, 10)) < DEN_AUTOMATU) return null;
  const mesic = minulyMesic(dnes);
  if (posledniOdeslany && RE_MESIC.test(posledniOdeslany) && posledniOdeslany >= mesic) return null;
  return mesic;
}

// ---------------------------------------------------------------------------
// Vstupní data (řádky z databáze, už jen tohoto podniku)

export interface UctenkaVstup { id: number; datum: string; dodavatel: string | null; castka: number | null; kategorie: string | null; poznamka: string | null; foto: string | null }
export interface PrijemkaVstup { id: number; datum: string; dodavatel: string | null; castka: number | null; cisloDokladu: string | null; fotky: string[]; polozek: number }
export interface UzaverkaVstup {
  id: number; den: string; popis: string | null; createdBy: number;
  opening_cash: number; cash_revenue: number; card_revenue: number; tips: number; tips_card: number | null;
  expenses: number; cash_removed: number; self_payout: number; final_removal: number | null; closing_cash: number;
  payout_from_register?: boolean | null; tips_in_drawer?: boolean | null;
  approved: boolean | null; movements: unknown; photos: unknown;
}
export interface PosUctenkaVstup {
  /** Kolik účtenek řádek nese (databáze je sčítá po dnech); bez něj 1. */
  pocet?: number;
  den: string; finalPrice: number; withoutTax: number | null; tips: number; cash: number; card: number; other: number;
  refunded: boolean; deleted: boolean; taxSummaries: Record<string, number> | null;
}
export interface VyplataVstup { datum: string; jmeno: string; od: string; do: string; castka: number; zpusob: string | null; poznamka: string | null }
export interface PodnikVstup { nazev: string; ico: string | null; dic: string | null; adresa: string | null; mena: string }

export interface DataExportu {
  podnik: PodnikVstup;
  od: string; do: string;
  uctenky: UctenkaVstup[];
  prijemky: PrijemkaVstup[];
  uzaverky: UzaverkaVstup[];
  pos: PosUctenkaVstup[];
  /** null = bez svolení `finance.mzdy` (list výplat ani jména v pohybech nejsou). */
  vyplaty: VyplataVstup[] | null;
  /** Jména autorů uzávěrek (výplata z kasy bez rozpisu patří autorovi) — jen se svolením mezd. */
  jmenaAutoru?: Record<number, string>;
  /** Nahrané soubory podle adresy `/api/upload/<id>` (jen tohoto podniku). Co tu chybí, ve ZIPu nebude. */
  soubory: Record<string, { mime: string | null }>;
}

// ---------------------------------------------------------------------------
// Názvy souborů

/** Text do názvu souboru: bez diakritiky a zakázaných znaků, mezery na pomlčky, zkrácený. */
export function bezpecnyText(s: string | null | undefined, max = 24): string {
  const t = String(s ?? '')
    .normalize('NFD').replace(/\p{M}+/gu, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
  return t;
}

/** Měna do názvu souboru (ASCII): koruna jako „Kc", jinak kód měny. */
export function menaVNazvu(mena: string): string {
  const k = String(mena || 'CZK').toUpperCase();
  return k === 'CZK' ? 'Kc' : bezpecnyText(k, 4) || 'CZK';
}

/** Částka s desetinnou čárkou a dvěma místy (1234,5 → „1234,50"). */
export function castkaCs(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');
}

/** Číslo s desetinnou čárkou (bez pevných míst). */
export function cisloCs(n: number): string {
  return String(Math.round(n * 1000) / 1000).replace('.', ',');
}

/** Krátké stabilní id z adresy fotky (4 znaky) — FNV-1a, ať se jméno při dalším exportu nemění. */
export function kratkeId(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return (h >>> 0).toString(36).padStart(4, '0').slice(-4);
}

const PRIPONY: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'image/heic': 'heic', 'image/heif': 'heif', 'image/avif': 'avif', 'application/pdf': 'pdf',
};
/** Přípona podle typu souboru; neznámý typ = „bin" (nic se nespustí po rozbalení). */
export function priponaZTypu(mime: string | null | undefined): string {
  return PRIPONY[String(mime ?? '').toLowerCase().split(';')[0].trim()] ?? 'bin';
}

/** Id nahraného souboru z adresy `/api/upload/<id>` (jinak null). */
export function idUploadu(url: string | null | undefined): number | null {
  const m = /^\/api\/upload\/(\d{1,12})$/.exec(String(url ?? ''));
  return m ? Number(m[1]) : null;
}

export interface FotkaVZipu { url: string; uploadId: number; cesta: string; mime: string | null }
export interface PlanFotek { fotky: FotkaVZipu[]; podleUrl: Map<string, string>; chybiZaznam: string[] }

/**
 * Kam ve ZIPu jde která fotka. Každá adresa jednou (stejná fotka u dvou dokladů = jeden soubor),
 * cesty unikátní bez ohledu na velikost písmen (Windows a macOS je nerozliší).
 * Adresa, kterou podnik v nahraných souborech nemá, se nenaplánuje (`chybiZaznam`).
 */
export function naplanujFotky(d: DataExportu): PlanFotek {
  const fotky: FotkaVZipu[] = [];
  const podleUrl = new Map<string, string>();
  const chybiZaznam: string[] = [];
  const pouzite = new Set<string>();
  const mena = menaVNazvu(d.podnik.mena);
  const pridej = (url: string | null | undefined, slozka: string, casti: (string | null)[]) => {
    if (!url || podleUrl.has(url) || chybiZaznam.includes(url)) return;
    const id = idUploadu(url);
    const zaznam = d.soubory[url];
    if (id == null || !zaznam) { chybiZaznam.push(url); return; }
    const zaklad = [...casti.filter((c): c is string => !!c), kratkeId(url)].join('_');
    const ext = priponaZTypu(zaznam.mime);
    let cesta = `fotky/${slozka}/${zaklad}.${ext}`;
    for (let k = 2; pouzite.has(cesta.toLowerCase()); k++) cesta = `fotky/${slozka}/${zaklad}-${k}.${ext}`;
    pouzite.add(cesta.toLowerCase());
    podleUrl.set(url, cesta);
    fotky.push({ url, uploadId: id, cesta, mime: zaznam.mime });
  };
  const castka = (n: number | null) => (n != null && n > 0 ? `${castkaCs(n)}${mena}` : null);
  for (const u of d.uctenky) pridej(u.foto, 'uctenky', [u.datum, bezpecnyText(u.dodavatel) || 'uctenka', castka(u.castka)]);
  for (const p of d.prijemky) for (const f of p.fotky) pridej(f, 'prijemky', [p.datum, bezpecnyText(p.dodavatel) || 'dodavatel', bezpecnyText(p.cisloDokladu, 20) || null, castka(p.castka)]);
  for (const z of d.uzaverky) for (const f of normalizePhotos(z.photos)) pridej(f.url, 'uzaverky', [z.den, DRUH_FOTKY_SOUBOR[f.druh]]);
  return { fotky, podleUrl, chybiZaznam };
}

const DRUH_FOTKY_SOUBOR: Record<FotoDokladu['druh'], string> = { terminal: 'terminal', zreport: 'z-report', vydaj: 'vydaj' };
const DRUH_FOTKY_CS: Record<FotoDokladu['druh'], string> = { terminal: 'výpis z terminálu', zreport: 'Z-report', vydaj: 'účtenka výdaje' }; // i18n-ok (obsah pro účetní)

// ---------------------------------------------------------------------------
// Souhrn

export type KodVarovani = 'uctenky_bez_fotky' | 'uctenky_bez_castky' | 'prijemky_bez_ceny' | 'prijemky_bez_dokladu' | 'uzaverky_neschvalene' | 'fotky_chybi';
export interface Varovani { kod: KodVarovani; pocet: number }
export interface DphSazby { sazba: number; zaklad: number; dph: number }

export interface Souhrn {
  uctenky: { pocet: number; soucet: number; bezFotky: number; bezCastky: number };
  prijemky: { pocet: number; soucet: number; bezCeny: number; bezDokladu: number };
  uzaverky: {
    pocet: number; neschvalene: number; hotove: number; kartou: number; celkem: number;
    spropitneHotove: number; spropitneKartou: number; vydaje: number; odvody: number; vyplatyZKasy: number; vklady: number; rozdily: number;
  };
  /** null = podnik nemá v období data z pokladny. */
  pokladna: null | { dni: number; uctenek: number; celkem: number; hotove: number; kartou: number; jinak: number; spropitne: number; bezDph: number | null; dph: DphSazby[] };
  /** null = bez svolení `finance.mzdy`. */
  vyplaty: null | { pocet: number; soucet: number };
  fotky: { celkem: number; chybi: number };
  varovani: Varovani[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const cislo = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

interface PosDen { den: string; uctenek: number; celkem: number; hotove: number; kartou: number; jinak: number; spropitne: number; bezDph: number | null; dph: Map<number, number> }

/** Účtenky z pokladny po dnech: smazané a refundované se nepočítají (stejně jako denní souhrn pokladny). */
export function posPoDnech(pos: readonly PosUctenkaVstup[]): PosDen[] {
  const dny = new Map<string, PosDen>();
  for (const b of pos) {
    if (b.deleted || b.refunded) continue;
    const d = dny.get(b.den) ?? { den: b.den, uctenek: 0, celkem: 0, hotove: 0, kartou: 0, jinak: 0, spropitne: 0, bezDph: 0, dph: new Map() };
    d.uctenek += b.pocet ?? 1; d.celkem += cislo(b.finalPrice); d.hotove += cislo(b.cash); d.kartou += cislo(b.card); d.jinak += cislo(b.other); d.spropitne += cislo(b.tips);
    d.bezDph = d.bezDph != null && b.withoutTax != null ? d.bezDph + cislo(b.withoutTax) : null;
    // tax_summaries z pokladny: sazba v % → částka DPH v té sazbě.
    for (const [k, v] of Object.entries(b.taxSummaries ?? {})) {
      const sazba = Number(String(k).replace(',', '.'));
      if (!Number.isFinite(sazba) || sazba < 0 || sazba > 100) continue;
      d.dph.set(sazba, (d.dph.get(sazba) ?? 0) + cislo(v));
    }
    dny.set(b.den, d);
  }
  return [...dny.values()].sort((a, b) => (a.den < b.den ? -1 : 1));
}

/** Základ daně z částky DPH a sazby (0 % základ nemá jak dopočítat). */
const zakladZDph = (dph: number, sazba: number) => (sazba > 0 ? r2((dph * 100) / sazba) : 0);

/** Odvod jedné uzávěrky: během směny + po přepočtu na konci. */
const odvodUzaverky = (z: UzaverkaVstup) => cislo(z.cash_removed) + cislo(z.final_removal);

export function spocitejSouhrn(d: DataExportu, plan: PlanFotek, chybiVUlozisti: readonly string[] = []): Souhrn {
  const u = { pocet: d.uctenky.length, soucet: 0, bezFotky: 0, bezCastky: 0 };
  for (const x of d.uctenky) {
    u.soucet += cislo(x.castka);
    if (!x.foto) u.bezFotky++;
    if (x.castka == null || !(x.castka > 0)) u.bezCastky++;
  }
  const p = { pocet: d.prijemky.length, soucet: 0, bezCeny: 0, bezDokladu: 0 };
  for (const x of d.prijemky) {
    p.soucet += cislo(x.castka);
    if (x.castka == null || !(x.castka > 0)) p.bezCeny++;
    if (!x.cisloDokladu && x.fotky.length === 0) p.bezDokladu++;
  }
  const z = { pocet: d.uzaverky.length, neschvalene: 0, hotove: 0, kartou: 0, celkem: 0, spropitneHotove: 0, spropitneKartou: 0, vydaje: 0, odvody: 0, vyplatyZKasy: 0, vklady: 0, rozdily: 0 };
  for (const x of d.uzaverky) {
    if (x.approved === false) z.neschvalene++;
    z.hotove += cislo(x.cash_revenue); z.kartou += cislo(x.card_revenue);
    const sprKarta = cislo(x.tips_card);
    z.spropitneKartou += sprKarta; z.spropitneHotove += Math.max(0, cislo(x.tips) - sprKarta);
    z.vydaje += cislo(x.expenses); z.odvody += odvodUzaverky(x); z.vyplatyZKasy += cislo(x.self_payout);
    z.vklady += normalizeMovements(x.movements).filter(m => m.kind === 'deposit').reduce((s, m) => s + m.amount, 0);
    z.rozdily += rozdilUzaverky(x);
  }
  z.celkem = z.hotove + z.kartou;
  const dny = posPoDnech(d.pos);
  let pokladna: Souhrn['pokladna'] = null;
  if (dny.length) {
    const dph = new Map<number, number>();
    let bezDph: number | null = 0;
    const s = { uctenek: 0, celkem: 0, hotove: 0, kartou: 0, jinak: 0, spropitne: 0 };
    for (const den of dny) {
      s.uctenek += den.uctenek; s.celkem += den.celkem; s.hotove += den.hotove; s.kartou += den.kartou; s.jinak += den.jinak; s.spropitne += den.spropitne;
      bezDph = bezDph != null && den.bezDph != null ? bezDph + den.bezDph : null;
      for (const [k, v] of den.dph) dph.set(k, (dph.get(k) ?? 0) + v);
    }
    pokladna = {
      dni: dny.length, uctenek: s.uctenek, celkem: r2(s.celkem), hotove: r2(s.hotove), kartou: r2(s.kartou), jinak: r2(s.jinak), spropitne: r2(s.spropitne),
      bezDph: bezDph == null ? null : r2(bezDph),
      dph: [...dph.entries()].sort((a, b) => b[0] - a[0]).map(([sazba, v]) => ({ sazba, zaklad: zakladZDph(v, sazba), dph: r2(v) })),
    };
  }
  const vyplaty = d.vyplaty ? { pocet: d.vyplaty.length, soucet: r2(d.vyplaty.reduce((s, v) => s + cislo(v.castka), 0)) } : null;
  const chybi = plan.chybiZaznam.length + chybiVUlozisti.length;
  const varovani: Varovani[] = [];
  const v = (kod: KodVarovani, pocet: number) => { if (pocet > 0) varovani.push({ kod, pocet }); };
  v('uctenky_bez_fotky', u.bezFotky);
  v('uctenky_bez_castky', u.bezCastky);
  v('prijemky_bez_ceny', p.bezCeny);
  v('prijemky_bez_dokladu', p.bezDokladu);
  v('uzaverky_neschvalene', z.neschvalene);
  v('fotky_chybi', chybi);
  return {
    uctenky: { ...u, soucet: r2(u.soucet) }, prijemky: { ...p, soucet: r2(p.soucet) },
    uzaverky: Object.fromEntries(Object.entries(z).map(([k, n]) => [k, r2(n)])) as Souhrn['uzaverky'],
    pokladna, vyplaty, fotky: { celkem: Math.max(0, plan.fotky.length - chybiVUlozisti.length), chybi }, varovani,
  };
}

function rozdilUzaverky(x: UzaverkaVstup): number {
  return cashDifference({
    opening_cash: cislo(x.opening_cash), cash_revenue: cislo(x.cash_revenue), tips: cislo(x.tips), tips_card: x.tips_card,
    expenses: cislo(x.expenses), cash_removed: cislo(x.cash_removed), self_payout: cislo(x.self_payout),
    payout_from_register: x.payout_from_register ?? null, tips_in_drawer: x.tips_in_drawer ?? null, closing_cash: cislo(x.closing_cash),
  } as Parameters<typeof cashDifference>[0]);
}

/** Varování česky (souhrn.csv, PRECTI-ME, e-mail). Obrazovka je překládá sama podle kódu. */
export function textVarovani(v: Varovani): string {
  switch (v.kod) {
    case 'uctenky_bez_fotky': return `Účtenky bez fotky: ${v.pocet}`; // i18n-ok (obsah pro účetní)
    case 'uctenky_bez_castky': return `Účtenky bez částky: ${v.pocet}`; // i18n-ok
    case 'prijemky_bez_ceny': return `Příjemky bez ceny: ${v.pocet}`; // i18n-ok
    case 'prijemky_bez_dokladu': return `Příjemky bez čísla dokladu i fotky: ${v.pocet}`; // i18n-ok
    case 'uzaverky_neschvalene': return `Neschválené uzávěrky: ${v.pocet}`; // i18n-ok
    case 'fotky_chybi': return `Fotky, které se nepodařilo přiložit: ${v.pocet}`; // i18n-ok
  }
}

// ---------------------------------------------------------------------------
// Listy (tabulky) — stejné pro CSV i XLSX

export interface ListExportu extends ListXlsx { id: string; soubor: string }

const DRUH_POHYBU_CS: Record<Movement['kind'], string> = { expense: 'Výdaj z kasy', removal: 'Odvod (odloženo ven)', payout: 'Výplata z kasy', deposit: 'Vklad do kasy' }; // i18n-ok

export interface VolbyListu { chybiVUlozisti?: readonly string[] }

export function sestavListy(d: DataExportu, plan: PlanFotek, souhrn: Souhrn, volby: VolbyListu = {}): ListExportu[] {
  const sym = menaVNazvu(d.podnik.mena) === 'Kc' ? 'Kč' : d.podnik.mena.toUpperCase(); // i18n-ok (hlavička sloupce pro účetní)
  const chybi = new Set(volby.chybiVUlozisti ?? []);
  const soubor = (url: string | null | undefined) => {
    if (!url) return '';
    const c = plan.podleUrl.get(url);
    return c && !chybi.has(url) ? c : 'chybí'; // i18n-ok
  };
  const castka = (n: string): SloupecXlsx => ({ nazev: `${n} (${sym})`, typ: 'castka' });
  const listy: ListExportu[] = [];

  listy.push({ id: 'souhrn', soubor: 'souhrn.csv', nazev: 'Souhrn', ...listSouhrnu(d, souhrn, sym) });

  listy.push({
    id: 'uctenky', soubor: 'uctenky.csv', nazev: 'Účtenky', // i18n-ok
    sloupce: [{ nazev: 'Datum' }, { nazev: 'Dodavatel' }, { nazev: 'Kategorie' }, castka('Částka'), { nazev: 'Poznámka' }, { nazev: 'Soubor' }, { nazev: 'ID', typ: 'cislo' }], // i18n-ok
    radky: [...d.uctenky].sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : a.id - b.id)).map(x => [
      x.datum, x.dodavatel ?? '', jeKategorieUctenky(x.kategorie) ? POPISKY_KATEGORII_CS[x.kategorie] : '', x.castka, x.poznamka ?? '', x.foto ? soubor(x.foto) : 'bez fotky', x.id, // i18n-ok
    ]),
  });

  listy.push({
    id: 'prijemky', soubor: 'prijemky.csv', nazev: 'Příjemky', // i18n-ok
    sloupce: [{ nazev: 'Datum příjmu' }, { nazev: 'Dodavatel' }, { nazev: 'Číslo dokladu' }, castka('Částka'), { nazev: 'Položek', typ: 'cislo' }, { nazev: 'Soubory' }, { nazev: 'ID objednávky', typ: 'cislo' }], // i18n-ok
    radky: [...d.prijemky].sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : a.id - b.id)).map(x => [
      x.datum, x.dodavatel ?? '', x.cisloDokladu ?? '', x.castka, x.polozek, x.fotky.map(soubor).join(' | '), x.id,
    ]),
  });

  const uzaverky = [...d.uzaverky].sort((a, b) => (a.den < b.den ? -1 : a.den > b.den ? 1 : a.id - b.id));
  listy.push({
    id: 'uzaverky', soubor: 'uzaverky.csv', nazev: 'Uzávěrky', // i18n-ok
    sloupce: [{ nazev: 'Den' }, { nazev: 'Směna / akce' }, castka('Tržba hotově'), castka('Tržba kartou'), castka('Tržba celkem'), castka('Spropitné hotově'), castka('Spropitné kartou'), // i18n-ok
      castka('Výdaje z kasy'), castka('Odvod'), castka('Výplaty z kasy'), castka('Rozdíl v kase'), { nazev: 'Schváleno' }, { nazev: 'Soubory' }, { nazev: 'ID', typ: 'cislo' }], // i18n-ok
    radky: uzaverky.map(x => {
      const sprKarta = cislo(x.tips_card);
      return [x.den, x.popis ?? '', cislo(x.cash_revenue), cislo(x.card_revenue), cislo(x.cash_revenue) + cislo(x.card_revenue),
        Math.max(0, cislo(x.tips) - sprKarta), sprKarta, cislo(x.expenses), odvodUzaverky(x), cislo(x.self_payout), rozdilUzaverky(x),
        x.approved === false ? 'ne' : 'ano', normalizePhotos(x.photos).map(f => `${soubor(f.url)} (${DRUH_FOTKY_CS[f.druh]})`).join(' | '), x.id]; // i18n-ok
    }),
  });

  // Pokladní pohyby: rozpis výdajů, odvodů, výplat a vkladů z uzávěrek. Uzávěrka bez rozpisu dá jeden řádek za každý součet.
  const sJmeny = d.vyplaty != null;
  const pohyby: BunkaXlsx[][] = [];
  for (const x of uzaverky) {
    const m = normalizeMovements(x.movements);
    const radek = (druh: Movement['kind'], c: number, pozn: string, komu: string) => pohyby.push([x.den, DRUH_POHYBU_CS[druh], c, pozn, ...(sJmeny ? [komu] : []), x.id]);
    const dle = (k: Movement['kind']) => m.filter(p => p.kind === k);
    for (const k of ['expense', 'removal', 'payout', 'deposit'] as const) {
      const rozpis = dle(k);
      const agregat = k === 'expense' ? cislo(x.expenses) : k === 'removal' ? cislo(x.cash_removed) : k === 'payout' ? cislo(x.self_payout) : 0;
      if (rozpis.length) for (const p of rozpis) radek(k, p.amount, p.note ?? '', k === 'payout' ? (p.userName ?? d.jmenaAutoru?.[x.createdBy] ?? '') : '');
      else if (agregat > 0) radek(k, agregat, 'bez rozpisu', k === 'payout' ? (d.jmenaAutoru?.[x.createdBy] ?? '') : ''); // i18n-ok
    }
    if (cislo(x.final_removal) > 0) radek('removal', cislo(x.final_removal), 'odvod po přepočtu kasy', ''); // i18n-ok
  }
  listy.push({
    id: 'pohyby', soubor: 'pokladni-pohyby.csv', nazev: 'Pokladní pohyby', // i18n-ok
    sloupce: [{ nazev: 'Den' }, { nazev: 'Druh' }, castka('Částka'), { nazev: 'Poznámka' }, ...(sJmeny ? [{ nazev: 'Komu' }] : []), { nazev: 'ID uzávěrky', typ: 'cislo' as const }], // i18n-ok
    radky: pohyby,
  });

  const dny = posPoDnech(d.pos);
  if (dny.length) {
    const sazby = [...new Set(dny.flatMap(x => [...x.dph.keys()]))].sort((a, b) => b - a);
    listy.push({
      id: 'trzby', soubor: 'trzby-dph.csv', nazev: 'Tržby a DPH', // i18n-ok
      sloupce: [{ nazev: 'Den' }, { nazev: 'Účtenek', typ: 'cislo' }, castka('Tržba celkem'), castka('Hotově'), castka('Kartou'), castka('Jinak'), castka('Spropitné'), castka('Bez DPH'), // i18n-ok
        ...sazby.flatMap(s => [castka(`Základ ${cisloCs(s)} %`), castka(`DPH ${cisloCs(s)} %`)])], // i18n-ok
      radky: dny.map(x => [x.den, x.uctenek, r2(x.celkem), r2(x.hotove), r2(x.kartou), r2(x.jinak), r2(x.spropitne), x.bezDph == null ? null : r2(x.bezDph),
        ...sazby.flatMap(s => { const v = x.dph.get(s); return v == null ? [null, null] : [zakladZDph(v, s), r2(v)]; })]),
    });
  }

  if (d.vyplaty) {
    // Výplaty: zapsané platby (převodem i hotově) a výplaty z kasy po lidech z uzávěrek.
    const radky: BunkaXlsx[][] = [...d.vyplaty].sort((a, b) => (a.datum < b.datum ? -1 : 1)).map(v => [v.datum, v.jmeno, 'zapsaná výplata', v.od, v.do, v.castka, v.zpusob ?? '', v.poznamka ?? '']); // i18n-ok
    for (const x of uzaverky) {
      const m = normalizeMovements(x.movements).filter(p => p.kind === 'payout');
      if (m.length) for (const p of m) radky.push([x.den, p.userName ?? d.jmenaAutoru?.[x.createdBy] ?? '', 'z kasy', x.den, x.den, p.amount, 'hotově', p.note ?? '']); // i18n-ok
      else if (cislo(x.self_payout) > 0) radky.push([x.den, d.jmenaAutoru?.[x.createdBy] ?? '', 'z kasy', x.den, x.den, cislo(x.self_payout), 'hotově', '']); // i18n-ok
    }
    radky.sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0));
    listy.push({
      id: 'vyplaty', soubor: 'vyplaty.csv', nazev: 'Výplaty', // i18n-ok
      sloupce: [{ nazev: 'Datum' }, { nazev: 'Jméno' }, { nazev: 'Zdroj' }, { nazev: 'Období od' }, { nazev: 'Období do' }, castka('Částka'), { nazev: 'Způsob' }, { nazev: 'Poznámka' }], // i18n-ok
      radky,
    });
  }
  return listy;
}

function listSouhrnu(d: DataExportu, s: Souhrn, sym: string): { sloupce: SloupecXlsx[]; radky: BunkaXlsx[][] } {
  const r: BunkaXlsx[][] = [];
  const t = (a: string, b: BunkaXlsx = '') => r.push([a, b, null]);
  const c = (a: string, n: number | null) => r.push([a, null, n]);
  // i18n-ok (celý souhrn je obsah pro účetní, česky)
  t('Podnik', d.podnik.nazev); // i18n-ok
  if (d.podnik.ico) t('IČO', d.podnik.ico); // i18n-ok
  if (d.podnik.dic) t('DIČ', d.podnik.dic); // i18n-ok
  t('Období', `${d.od} – ${d.do}`); // i18n-ok
  t('Měna', d.podnik.mena.toUpperCase()); // i18n-ok
  t('');
  t('Tržby podle uzávěrek'); // i18n-ok
  c('Tržba hotově', s.uzaverky.hotove); // i18n-ok
  c('Tržba kartou', s.uzaverky.kartou); // i18n-ok
  c('Tržba celkem', s.uzaverky.celkem); // i18n-ok
  c('Spropitné hotově', s.uzaverky.spropitneHotove); // i18n-ok
  c('Spropitné kartou', s.uzaverky.spropitneKartou); // i18n-ok
  c('Výdaje z kasy', s.uzaverky.vydaje); // i18n-ok
  c('Odvody z kasy', s.uzaverky.odvody); // i18n-ok
  c('Výplaty z kasy', s.uzaverky.vyplatyZKasy); // i18n-ok
  c('Vklady do kasy', s.uzaverky.vklady); // i18n-ok
  c('Rozdíly v kase (+ přebytek, − manko)', s.uzaverky.rozdily); // i18n-ok
  t('Počet uzávěrek', s.uzaverky.pocet); // i18n-ok
  if (s.pokladna) {
    t('');
    t('Tržby z pokladny (POS)'); // i18n-ok
    t('Dní s tržbou', s.pokladna.dni); // i18n-ok
    t('Účtenek', s.pokladna.uctenek); // i18n-ok
    c('Tržba celkem', s.pokladna.celkem); // i18n-ok
    c('Hotově', s.pokladna.hotove); // i18n-ok
    c('Kartou', s.pokladna.kartou); // i18n-ok
    c('Jinak', s.pokladna.jinak); // i18n-ok
    c('Spropitné', s.pokladna.spropitne); // i18n-ok
    c('Bez DPH', s.pokladna.bezDph); // i18n-ok
    for (const x of s.pokladna.dph) { c(`Základ ${cisloCs(x.sazba)} %`, x.zaklad); c(`DPH ${cisloCs(x.sazba)} %`, x.dph); } // i18n-ok
  }
  t('');
  t('Nákupy'); // i18n-ok
  t('Účtenek', s.uctenky.pocet); // i18n-ok
  c('Účtenky celkem', s.uctenky.soucet); // i18n-ok
  t('Příjemek', s.prijemky.pocet); // i18n-ok
  c('Příjemky celkem', s.prijemky.soucet); // i18n-ok
  if (s.vyplaty) {
    t('');
    t('Výplaty'); // i18n-ok
    t('Zapsaných výplat', s.vyplaty.pocet); // i18n-ok
    c('Zapsané výplaty celkem', s.vyplaty.soucet); // i18n-ok
    c('Výplaty z kasy', s.uzaverky.vyplatyZKasy); // i18n-ok
  }
  t('');
  t('Fotky dokladů', s.fotky.celkem); // i18n-ok
  if (s.varovani.length) {
    t('');
    t('K dořešení'); // i18n-ok
    for (const v of s.varovani) t(textVarovani(v));
  }
  return { sloupce: [{ nazev: 'Položka', sirka: 40 }, { nazev: 'Hodnota', sirka: 28 }, { nazev: `Částka (${sym})`, typ: 'castka' }], radky: r }; // i18n-ok
}

// ---------------------------------------------------------------------------
// CSV

const BOM = '﻿';

function bunkaCsv(v: BunkaXlsx, typ: SloupecXlsx['typ']): string {
  if (v == null) return '';
  if (typeof v === 'number') return typ === 'castka' ? castkaCs(v) : cisloCs(v);
  const s = String(v);
  // Uvozovky jen tam, kde jsou potřeba; vzorec na začátku (=, +, -, @) se zneškodní apostrofem,
  // ať Excel neotevře buňku jako vzorec (CSV injection).
  const bezpecny = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return /[;"\r\n]/.test(bezpecny) ? `"${bezpecny.replace(/"/g, '""')}"` : bezpecny;
}

/** CSV pro české programy: středník, UTF-8 s BOM, desetinná čárka, řádky CRLF. */
export function csvListu(l: Pick<ListXlsx, 'sloupce' | 'radky'>): string {
  const radky = [l.sloupce.map(s => bunkaCsv(s.nazev, 'text')).join(';')];
  for (const r of l.radky) radky.push(l.sloupce.map((s, i) => bunkaCsv(r[i], s.typ)).join(';'));
  return BOM + radky.join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------------------
// ZIP: název a PRECTI-ME

/** `ucetni-podklady_<podnik>_2026-10.zip` (celý měsíc), jinak `…_<od>_<do>.zip`. */
export function nazevZipu(podnik: string, od: string, doD: string): string {
  const mesic = celyMesic(od, doD);
  return `ucetni-podklady_${bezpecnyText(podnik, 40) || 'podnik'}_${mesic ?? `${od}_${doD}`}.zip`;
}

export function precteMe(d: DataExportu, s: Souhrn, listy: readonly ListExportu[], o: { vygenerovano: string; chybejici: readonly string[] }): string {
  const radky: string[] = [];
  const p = (x = '') => radky.push(x);
  // i18n-ok (celý soubor je pro účetní, česky)
  p('PODKLADY PRO ÚČETNÍ'); // i18n-ok
  p('===================');
  p();
  p(`Podnik: ${d.podnik.nazev}`); // i18n-ok
  if (d.podnik.ico) p(`IČO: ${d.podnik.ico}`); // i18n-ok
  if (d.podnik.dic) p(`DIČ: ${d.podnik.dic}`); // i18n-ok
  if (d.podnik.adresa) p(`Adresa: ${d.podnik.adresa}`); // i18n-ok
  p(`Období: ${d.od} – ${d.do}`); // i18n-ok
  p(`Měna: ${d.podnik.mena.toUpperCase()}`); // i18n-ok
  p(`Vytvořeno: ${o.vygenerovano} (aplikace Managero)`); // i18n-ok
  p();
  p('CO JE KDE'); // i18n-ok
  p('---------');
  p('podklady.xlsx        — všechny tabulky v jednom sešitu (každá na vlastním listu) + Souhrn'); // i18n-ok
  const popisy: Record<string, string> = {
    souhrn: 'součty za období a co je potřeba dořešit', // i18n-ok
    uctenky: 'účtenky z nákupů (datum nákupu, dodavatel, částka, kategorie, fotka)', // i18n-ok
    prijemky: 'přijaté objednávky od dodavatelů (číslo dodacího listu / faktury, cena, fotky)', // i18n-ok
    uzaverky: 'denní uzávěrky kasy (tržby hotově a kartou, spropitné, výdaje, odvody, rozdíly)', // i18n-ok
    pohyby: 'rozpis pohybů v kase (výdaje, odvody, výplaty, vklady)', // i18n-ok
    trzby: 'tržby z pokladny po dnech a sazbách DPH (podle údajů pokladního systému)', // i18n-ok
    vyplaty: 'výplaty zaměstnancům (zapsané výplaty a výplaty z kasy)', // i18n-ok
  };
  for (const l of listy) p(`${l.soubor.padEnd(20)} — ${popisy[l.id] ?? l.nazev} (${l.id === 'souhrn' ? 'souhrn' : `${l.radky.length} ř.`})`); // i18n-ok
  if (s.fotky.celkem > 0) {
    p('fotky/uctenky/       — fotky účtenek; název: datum_dodavatel_částka_id'); // i18n-ok
    p('fotky/prijemky/      — fotky dodacích listů a faktur k příjemkám'); // i18n-ok
    p('fotky/uzaverky/      — výpisy z terminálu, Z-reporty a účtenky výdajů k uzávěrkám'); // i18n-ok
    p('Sloupec „Soubor" v tabulkách ukazuje cestu k fotce uvnitř tohoto ZIPu.'); // i18n-ok
  }
  p();
  p('FORMÁT'); // i18n-ok
  p('------');
  p('CSV: oddělovač středník, kódování UTF-8 (s BOM), desetinná čárka, data RRRR-MM-DD.'); // i18n-ok
  p('Částky jsou v měně podniku. Tržby z pokladny jsou údaje pokladního systému; DPH podle sazeb tak, jak ho pokladna vykázala.'); // i18n-ok
  if (!d.vyplaty) p('Výplaty zaměstnanců nejsou součástí (export bez oprávnění ke mzdám).'); // i18n-ok
  else p('Výpočet hrubých mezd (hodiny × sazba) je v aplikaci v Docházce → Výplatní listina → CSV.'); // i18n-ok
  if (s.varovani.length || o.chybejici.length) {
    p();
    p('K DOŘEŠENÍ'); // i18n-ok
    p('----------');
    for (const v of s.varovani) p(`- ${textVarovani(v)}`);
    for (const c of o.chybejici) p(`- fotka ${c} se nepodařila načíst z úložiště`); // i18n-ok
  }
  p();
  return radky.join('\r\n');
}
