// Sklad a výroba — čisté výpočty pro widgety a nástroj stránky Sklad (kolo 69, balík B3).
//
// Čistý modul bez Reactu a bez `@/` importů: bere ho oblast widgetů
// (components/widgety/oblasti/sklad.tsx), nástroj Skladu (Inventory.tsx)
// i testy (`npm test` pouští .ts přímo v Node). Dřív si každé místo
// počítalo „co dochází", „co koupit" a „kolik leží na regálech" samo a čísla
// se rozjela (N7, N8) — proto jeden výpočet tady.

// ---------------------------------------------------------------------------
// Předávání mezi widgetem a nástrojem
// ---------------------------------------------------------------------------

/**
 * Widget žádá nástroj Skladu o akci (otevřít nákupní seznam, upravit
 * položku). Na stránce Sklad ho nástroj slyší hned (událost), z jiné stránky
 * (Přehled) si žádost počká v sessionStorage, než se nástroj po přechodu
 * připojí — layout předává pohledu jen jméno kategorie, ne akci.
 */
export const UDALOST_NAKUP = 'managero:sklad-nakup';
export const KLIC_NAKUP = 'managero-sklad-nakup';
export const UDALOST_UPRAVIT = 'managero:sklad-upravit';
export const KLIC_UPRAVIT = 'managero-sklad-upravit';
/**
 * Widget změnil sklad (schválil návrh, přijal objednávku, zapsal novou věc).
 * Nástroj drží položky ve vlastním stavu (kroky se ukládají optimisticky),
 * takže mezipaměť widgetů mu nestačí — na tuhle událost si sklad načte znovu.
 */
export const UDALOST_ZMENA = 'managero:sklad-zmena';

// ---------------------------------------------------------------------------
// Položky
// ---------------------------------------------------------------------------

/** Položka skladu, jak ji vrací GET /api/inventory (jen pole, která tu potřebujeme). */
export interface PolozkaSkladu {
  id: number;
  name: string;
  category?: string | null;
  categoryId?: number | null;
  quantity: number;
  minQuantity?: number;
  criticalQuantity?: number;
  maxQuantity?: number;
  unit?: string;
  supplier?: string | null;
  unitCost?: number | null;
  packageSize?: number | null;
  openAmount?: number | null;
  archived?: boolean;
  approved?: boolean | null;
  madeInHouse?: boolean;
  status?: 'ok' | 'low' | 'critical' | string;
  buyFor?: { itemId: number; name: string; amount: number | null }[];
  submittedByName?: string | null;
  description?: string | null;
  photoUrl?: string | null;
}

export type StavZasoby = 'ok' | 'low' | 'critical';

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/**
 * N7: do zásob patří jen aktivní položky — archivované (zaparkované) ani
 * neschválené návrhy od týmu ne. Dřív to Přehled počítal jinak než Sklad.
 */
export const jeAktivni = (p: Pick<PolozkaSkladu, 'archived' | 'approved'>) => p.archived !== true && p.approved !== false;

/**
 * Stav zásoby. Počítá ho server (balení a prahy kategorie, /api/inventory);
 * náhradní výpočet jen pro odpověď bez něj, ať widget nehlásí „v pořádku"
 * z neznalosti.
 */
export function stavZasoby(p: PolozkaSkladu): StavZasoby {
  if (p.status === 'ok' || p.status === 'low' || p.status === 'critical') return p.status;
  const q = num(p.quantity);
  if (q <= num(p.criticalQuantity)) return 'critical';
  if (q <= num(p.minQuantity)) return 'low';
  return 'ok';
}

const PORADI: Record<StavZasoby, number> = { critical: 0, low: 1, ok: 2 };
const abecedne = (a: string, b: string) => a.localeCompare(b, 'cs');

// ---------------------------------------------------------------------------
// Nákupní seznam
// ---------------------------------------------------------------------------

/**
 * Kolik objednat: doplnit do maxima; bez maxima na dvojnásobek minima. Surovina
 * chybějící na výrobu aspoň tolik, kolik na dávky chybí. Vždy aspoň 1.
 * (Stejný vzorec jako dřív v Inventory.tsx, teď jediný.)
 */
export function navrhMnozstvi(i: PolozkaSkladu): number {
  const q = num(i.quantity);
  const max = num(i.maxQuantity);
  const base = max > 0 ? max - q : num(i.minQuantity) * 2 - q;
  const naVyrobu = (i.buyFor ?? []).reduce((s, f) => s + num(f.amount), 0);
  return Math.max(1, Math.max(0, base), Math.ceil(naVyrobu));
}

export interface RadekNakupu {
  id: number;
  nazev: string;
  mnozstvi: number;
  jednotka: string;
  kriticke: boolean;
  dodavatel: string | null;
  /** Odhad ceny (množství × nákupní cena); null bez ceny (nebo bez sklad.ceny). */
  cena: number | null;
  /** Pro které vlastní výrobky surovina chybí (prázdné = je pod limitem). */
  naVyrobu: string[];
}

/**
 * Co koupit: pod limitem (kritické první) a suroviny chybějící na výrobu.
 * Vlastní výroba do nákupu nepatří — ta dostává úkol „vyrobit".
 */
export function nakupniSeznam(items: readonly PolozkaSkladu[], volby: { dodavatel?: string | null; jenKriticke?: boolean } = {}): RadekNakupu[] {
  return items
    .filter(jeAktivni)
    .filter(i => !i.madeInHouse && (stavZasoby(i) !== 'ok' || (i.buyFor?.length ?? 0) > 0))
    .filter(i => !volby.jenKriticke || stavZasoby(i) === 'critical')
    .filter(i => !volby.dodavatel || (i.supplier ?? '').trim() === volby.dodavatel)
    .sort((a, b) => PORADI[stavZasoby(a)] - PORADI[stavZasoby(b)] || abecedne(a.name, b.name))
    .map(i => {
      const mnozstvi = navrhMnozstvi(i);
      const cena = i.unitCost != null && num(i.unitCost) > 0 ? Math.round(mnozstvi * num(i.unitCost)) : null;
      return {
        id: i.id,
        nazev: i.name,
        mnozstvi,
        jednotka: i.unit ?? '',
        kriticke: stavZasoby(i) === 'critical',
        dodavatel: (i.supplier ?? '').trim() || null,
        cena,
        naVyrobu: (i.buyFor ?? []).map(f => f.name),
      };
    });
}

/** Seskupení podle dodavatele; „bez dodavatele" na konec. */
export function poDodavatelich<T extends { dodavatel: string | null }>(radky: readonly T[]): { dodavatel: string | null; radky: T[] }[] {
  const skupiny = new Map<string, T[]>();
  for (const r of radky) {
    const k = r.dodavatel ?? '';
    skupiny.set(k, [...(skupiny.get(k) ?? []), r]);
  }
  return [...skupiny.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : abecedne(a, b)))
    .map(([k, r]) => ({ dodavatel: k || null, radky: r }));
}

// ---------------------------------------------------------------------------
// Hodnota zásob (N8)
// ---------------------------------------------------------------------------

export interface HodnotaZasob { hodnota: number; top: { nazev: string; hodnota: number }[]; bezCeny: number }

/**
 * N8: kolik peněz leží na regálech — stejně jako /api/finance (summary.stockValue):
 * bez archivovaných, s podílem načatého balení (zbytek v otevřené lahvi je
 * pořád majetek), každá položka zaokrouhlená zvlášť. Sklad dřív počítal
 * i archivované a bez načatých balení, takže Sklad a Finance ukazovaly za
 * totéž dvě čísla. `bezCeny` = aktivní položky, u kterých cena chybí
 * (hodnota je pak jen dolní odhad).
 */
export function hodnotaZasob(items: readonly PolozkaSkladu[]): HodnotaZasob {
  const oceneno: { nazev: string; hodnota: number }[] = [];
  let bezCeny = 0;
  for (const i of items) {
    if (i.archived === true) continue;
    if (i.unitCost == null) { if (i.approved !== false) bezCeny++; continue; }
    const baleni = num(i.packageSize);
    const podil = baleni > 0 ? Math.max(0, num(i.openAmount)) / baleni : 0;
    const hodnota = Math.round((Math.max(0, num(i.quantity)) + podil) * num(i.unitCost));
    if (hodnota > 0) oceneno.push({ nazev: i.name, hodnota });
  }
  oceneno.sort((a, b) => b.hodnota - a.hodnota);
  return { hodnota: oceneno.reduce((s, x) => s + x.hodnota, 0), top: oceneno.slice(0, 5), bezCeny };
}

// ---------------------------------------------------------------------------
// Suroviny bez ceny nebo balení (N4)
// ---------------------------------------------------------------------------

export type ChybiUdaj = 'cena i balení' | 'cena' | 'velikost balení';
export interface RadekChybi { id: number; nazev: string; chybi: ChybiUdaj; produktu: number }

/**
 * Suroviny, které kasa používá v recepturách, ale chybí jim cena nebo
 * velikost balení. N4: bez `sklad.ceny` je unitCost maskovaný null a každá
 * surovina by vypadala bez ceny — widget proto sklad.ceny vyžaduje
 * (katalog) a tady se na to nespoléhá nic dalšího.
 */
export function chybiUdaje(items: readonly PolozkaSkladu[], usage: Record<string, unknown[]> | null | undefined): RadekChybi[] {
  if (!usage) return [];
  return items
    .filter(jeAktivni)
    .map(i => ({ i, produktu: Array.isArray(usage[String(i.id)]) ? usage[String(i.id)].length : 0 }))
    .filter(({ produktu }) => produktu > 0)
    .map(({ i, produktu }) => {
      const cena = num(i.unitCost) > 0;
      const baleni = num(i.packageSize) > 0;
      return { id: i.id, nazev: i.name, produktu, chybi: (!cena && !baleni ? 'cena i balení' : !cena ? 'cena' : 'velikost balení') as ChybiUdaj, ok: cena && baleni };
    })
    .filter(r => !r.ok)
    .map(({ ok: _ok, ...r }) => r)
    .sort((a, b) => abecedne(a.nazev, b.nazev));
}

// ---------------------------------------------------------------------------
// Kategorie
// ---------------------------------------------------------------------------

export interface KategorieSkladu { id: number; nazev: string; rodic: number | null }

export function vyberKategorie(raw: unknown): KategorieSkladu[] {
  return (Array.isArray(raw) ? raw : []).map((k: any) => ({
    id: Number(k.id),
    nazev: String(k.name ?? ''),
    rodic: k.parentId != null ? Number(k.parentId) : null,
  }));
}

/** Kategorie a všechny její podkategorie — „Sirupy" zahrnuje i „Sirupy / Ovocné". */
export function podstrom(kategorie: readonly KategorieSkladu[], koren: number): Set<number> {
  const ids = new Set<number>([koren]);
  // Pár průchodů místo rekurze: hloubka stromu je malá a cyklus v datech
  // (rodič sám sobě) tu nemůže zacyklit vykreslení.
  for (let i = 0; i < 6; i++) {
    let pribylo = false;
    for (const k of kategorie) if (k.rodic != null && ids.has(k.rodic) && !ids.has(k.id)) { ids.add(k.id); pribylo = true; }
    if (!pribylo) break;
  }
  return ids;
}

export interface SouhrnKategorie {
  polozek: number;
  kriticke: number;
  dochazi: number;
  /** Docházející položky kategorie (kriticky málo první). */
  nizke: { id: number; nazev: string; mnozstvi: number; jednotka: string; kriticke: boolean }[];
}

/** Jedna kategorie skladu jako widget: kolik položek a co v ní dochází (i v podkategoriích). */
export function souhrnKategorie(items: readonly PolozkaSkladu[], kategorie: readonly KategorieSkladu[], katId: number): SouhrnKategorie {
  const ids = podstrom(kategorie, katId);
  const v = items.filter(jeAktivni).filter(i => i.categoryId != null && ids.has(Number(i.categoryId)));
  const nizke = v
    .filter(i => stavZasoby(i) !== 'ok')
    .sort((a, b) => PORADI[stavZasoby(a)] - PORADI[stavZasoby(b)] || abecedne(a.name, b.name))
    .map(i => ({ id: i.id, nazev: i.name, mnozstvi: num(i.quantity), jednotka: i.unit ?? '', kriticke: stavZasoby(i) === 'critical' }));
  const kriticke = nizke.filter(n => n.kriticke).length;
  return { polozek: v.length, kriticke, dochazi: nizke.length - kriticke, nizke };
}

// ---------------------------------------------------------------------------
// Inventura
// ---------------------------------------------------------------------------

export interface StavInventury {
  bezi: boolean;
  spocitano: number;
  celkem: number;
  /** ISO — kdy běžící inventura začala. */
  zahajena: string | null;
  /** ISO — kdy skončila poslední dokončená. */
  posledni: string | null;
}

/** Z GET /api/stocktake → { open{data[],createdAt}, history[{completedAt}] }. */
export function stavInventury(raw: any): StavInventury {
  const open = raw?.open ?? null;
  const data: any[] = Array.isArray(open?.data) ? open.data : [];
  const historie: any[] = Array.isArray(raw?.history) ? raw.history : [];
  return {
    bezi: !!open,
    celkem: data.length,
    // Stejně jako okno inventury (Stocktake): spočítaná je i položka, u které
    // se napočítal jen zbytek v načatém balení. Jinak widget hlásil „0 z 40",
    // zatímco okno ukazovalo 10/40, a obsluha mohla začít počítat znovu.
    spocitano: data.filter(r => r?.counted != null || r?.countedOpen != null).length,
    zahajena: open?.createdAt ?? null,
    posledni: historie[0]?.completedAt ?? null,
  };
}

// ---------------------------------------------------------------------------
// Hlášení, objednávky, pohyby
// ---------------------------------------------------------------------------

export interface Hlaseni { id: number; autor: string; avatar: string | null; polozky: string[]; poznamka: string | null; nove: boolean; kdy: string | null }

/** GET /api/inventory/reports → reports[]; `items` je JSON řetězec [{id,name}] (nebo pole). */
export function vyberHlaseni(raw: any): Hlaseni[] {
  const rows: any[] = Array.isArray(raw?.reports) ? raw.reports : [];
  return rows.map(r => {
    let polozky: any[] = [];
    try { polozky = typeof r.items === 'string' ? JSON.parse(r.items) : Array.isArray(r.items) ? r.items : []; } catch { polozky = []; }
    return {
      id: Number(r.id),
      autor: String(r.author_name ?? 'Někdo z týmu'),
      avatar: r.author_avatar ?? null,
      polozky: (Array.isArray(polozky) ? polozky : []).map(p => String(p?.name ?? p ?? '')).filter(Boolean),
      poznamka: r.note ? String(r.note) : null,
      nove: r.status !== 'done',
      kdy: r.created_at ?? null,
    };
  });
}

export interface Objednavka {
  id: number;
  dodavatel: string | null;
  polozky: { nazev: string; mnozstvi: number; jednotka: string }[];
  cena: number | null;
  stav: 'ordered' | 'received' | 'cancelled' | string;
  vytvoreno: string | null;
  /** ISO — kdy zboží přišlo (jen přijaté). */
  prijata: string | null;
  autor: string | null;
}

const objednavka = (o: any): Objednavka => ({
  id: Number(o.id),
  dodavatel: o.supplier ? String(o.supplier) : null,
  polozky: (Array.isArray(o.items) ? o.items : []).map((x: any) => ({ nazev: String(x?.name ?? ''), mnozstvi: num(x?.qty), jednotka: String(x?.unit ?? '') })),
  cena: o.totalCost != null ? num(o.totalCost) : null,
  stav: o.status,
  vytvoreno: o.createdAt ?? null,
  prijata: o.receivedAt ?? null,
  autor: o.createdByName ?? null,
});

const radkyObjednavek = (raw: any): any[] => (Array.isArray(raw?.orders) ? raw.orders : []).filter((o: any) => o && o.id != null);

/** GET /api/orders → orders[]; čekající na příjem (nejstarší první — ty hoří). */
export function cekajiciObjednavky(raw: any): Objednavka[] {
  return radkyObjednavek(raw)
    .filter(o => o.status === 'ordered')
    .map(objednavka)
    .sort((a, b) => String(a.vytvoreno ?? '').localeCompare(String(b.vytvoreno ?? '')));
}

/** Přijaté a zrušené objednávky, nejnovější první (podle příjmu, jinak vytvoření). */
export function historieObjednavek(raw: any): Objednavka[] {
  const kdy = (o: Objednavka) => String(o.prijata ?? o.vytvoreno ?? '');
  return radkyObjednavek(raw)
    .filter(o => o.status !== 'ordered')
    .map(objednavka)
    .sort((a, b) => kdy(b).localeCompare(kdy(a)));
}

/**
 * Útrata za zboží v kalendářním měsíci `ted` (podle data příjmu). Počítá jen
 * přijaté objednávky se zapsanou cenou — stejně jako dřív panel Objednávky
 * na Skladu. Bez `sklad.ceny` server cenu maskuje (null), útrata je pak 0.
 */
export function utrataZaMesic(historie: Objednavka[], ted: Date = new Date()): number {
  return historie
    .filter(o => o.stav === 'received' && o.cena != null && o.cena > 0 && o.prijata)
    .filter(o => {
      const d = new Date(o.prijata as string);
      return !Number.isNaN(d.getTime()) && d.getFullYear() === ted.getFullYear() && d.getMonth() === ted.getMonth();
    })
    .reduce((s, o) => s + (o.cena as number), 0);
}

export type DruhPohybu = 'vse' | 'rucni' | 'prodej_z_kasy';
export interface Pohyb {
  id: number;
  polozka: string;
  zmena: number;
  zmenaNacate: number | null;
  jednotka: string;
  kdo: string | null;
  poznamka: string | null;
  kdy: string | null;
  zKasy: boolean;
}

/** Odpis z kasy zapisuje synchronizace s poznámkou „Prodej (…)" (lib/posSync.ts). */
export const jeZKasy = (poznamka: string | null | undefined) => /^prodej\b/i.test(String(poznamka ?? '').trim());

/** GET /api/inventory/log → [{itemName,oldQuantity,newQuantity,oldOpen,newOpen,note,userName,createdAt}]. */
export function vyberPohyby(raw: unknown, druh: DruhPohybu = 'vse'): Pohyb[] {
  return (Array.isArray(raw) ? raw : [])
    .map((r: any) => {
      const zmenaNacate = r.oldOpen != null && r.newOpen != null ? num(r.newOpen) - num(r.oldOpen) : null;
      return {
        id: Number(r.id),
        polozka: String(r.itemName ?? ''),
        zmena: num(r.newQuantity) - num(r.oldQuantity),
        zmenaNacate: zmenaNacate != null && Math.abs(zmenaNacate) > 1e-9 ? zmenaNacate : null,
        jednotka: String(r.unit ?? ''),
        kdo: r.userName ? String(r.userName) : null,
        poznamka: r.note ? String(r.note) : null,
        kdy: r.createdAt ?? null,
        zKasy: jeZKasy(r.note),
      };
    })
    .filter(p => druh === 'vse' || (druh === 'prodej_z_kasy' ? p.zKasy : !p.zKasy));
}
