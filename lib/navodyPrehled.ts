// Návody — čistá logika pro widgety a nástroj stránky Návody (kolo 69, balík B6b).
//
// Bez Reactu, ať ji hlídají testy (scripts/testy/k69-b6b.ts). Čtečka, uzávěrka
// i widgety se tak shodnou na tom, co je „povinné a nepřečtené", „připnuté
// k uzávěrce" nebo „nově upravené" — dřív to každé místo filtrovalo po svém
// (uzávěrka hledala forClosing sama a návrh by jí klidně prošel).

/** Návod z GET /api/guides (jen pole, která tu potřebujeme). */
export interface NavodApi {
  id: number;
  title: string;
  categoryId?: number | null;
  updatedAt?: string | null;
  approved?: boolean;
  submittedBy?: number | null;
  requireRead?: boolean;
  readCount?: number;
  myRead?: boolean;
  excerpt?: string;
  hasChecklist?: boolean;
  forClosing?: boolean;
}

/** Řádek GET /api/guides/ctenari (povinné čtení po návodech; jen navody.povinne_cteni). */
export interface CtenariNavodu {
  id: number;
  title: string;
  precetlo: number;
  celkem: number;
  neprecetli: { id: number; name: string; avatar: string | null }[];
}

export const URL_NAVODY = '/api/guides';
export const URL_CTENARI = '/api/guides/ctenari';
/** Událost, kterou widget požádá nástroj stránky Návody o otevření čtečky (bez navigace). */
export const UDALOST_OTEVRIT_NAVOD = 'navody:otevrit';

export function vyberNavody(raw: any): NavodApi[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.guides)) throw new Error('Návody přišly v nečekaném tvaru.');
  return raw.guides.filter((g: any) => g && Number.isFinite(Number(g.id))).map((g: any) => ({ ...g, id: Number(g.id), title: String(g.title ?? '') }));
}

export function vyberCtenare(raw: any): CtenariNavodu[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.guides)) throw new Error('Čtenáři návodů přišli v nečekaném tvaru.');
  return raw.guides.map((g: any) => ({
    id: Number(g.id), title: String(g.title ?? ''),
    precetlo: Math.max(0, Number(g.precetlo) || 0), celkem: Math.max(0, Number(g.celkem) || 0),
    neprecetli: Array.isArray(g.neprecetli) ? g.neprecetli.map((p: any) => ({ id: Number(p.id), name: String(p.name ?? ''), avatar: p.avatar ?? null })) : [],
  }));
}

const schvaleny = (g: NavodApi) => g.approved !== false;
const cas = (g: NavodApi) => String(g.updatedAt ?? '');

/** Povinné čtení, které divák ještě nepotvrdil (jen schválené návody). */
export function povinneNeprectene(navody: readonly NavodApi[]): NavodApi[] {
  return navody.filter(g => schvaleny(g) && g.requireRead === true && g.myRead !== true)
    .sort((a, b) => cas(b).localeCompare(cas(a)));
}

/** Nově upravené schválené návody, nejnovější nahoře. */
export function noveUpravene(navody: readonly NavodApi[], pocet: number): NavodApi[] {
  return navody.filter(schvaleny).sort((a, b) => cas(b).localeCompare(cas(a))).slice(0, Math.max(0, pocet));
}

/** Návrhy ke schválení. API je bez navody.schvalovat vrací jen autorovi — proto je widget za oprávněním. */
export function navrhyNavodu(navody: readonly NavodApi[]): NavodApi[] {
  return navody.filter(g => g.approved === false).sort((a, b) => cas(b).localeCompare(cas(a)));
}

/** Návod připnutý k uzávěrce (schválený; při víc připnutých ten naposledy upravený). */
export function navodKUzaverce(navody: readonly NavodApi[]): NavodApi | null {
  return navody.filter(g => schvaleny(g) && g.forClosing === true).sort((a, b) => cas(b).localeCompare(cas(a)))[0] ?? null;
}

/**
 * Povinné čtení po návodech: nejvíc chybějících nahoře, hotové („přečetli všichni")
 * na konec. Návod bez lidí (celkem 0) nemá co vymáhat a vypadne.
 */
export function kdoNecetl(radky: readonly CtenariNavodu[]): CtenariNavodu[] {
  return radky.filter(r => r.celkem > 0)
    .sort((a, b) => (b.celkem - b.precetlo) - (a.celkem - a.precetlo) || a.title.localeCompare(b.title, 'cs'));
}

/** Kolik návodů v každé kategorii (klíč -1 = bez kategorie, 'vse' = všechny). */
export function poctyKategorii(navody: readonly NavodApi[]): Map<number | 'vse', number> {
  const m = new Map<number | 'vse', number>([['vse', navody.length]]);
  for (const g of navody) {
    const k = g.categoryId ?? -1;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

/** Datum úpravy řádkem: dnes, včera, jinak „12. 3." (a rok, když není letošní). */
export function kdyUpraveno(iso: string | null | undefined, dnes: Date = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const den = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: 'Europe/Prague' });
  if (den(d) === den(dnes)) return 'dnes';
  const vcera = new Date(dnes.getTime() - 86_400_000);
  if (den(d) === den(vcera)) return 'včera';
  const letos = d.toLocaleDateString('en-CA', { timeZone: 'Europe/Prague', year: 'numeric' }) === dnes.toLocaleDateString('en-CA', { timeZone: 'Europe/Prague', year: 'numeric' });
  return d.toLocaleDateString('cs-CZ', { timeZone: 'Europe/Prague', day: 'numeric', month: 'numeric', ...(letos ? {} : { year: 'numeric' }) });
}
