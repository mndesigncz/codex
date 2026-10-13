// Poznámky k věcem v aplikaci (úkol, návod, postup, receptura z kasy, položka
// skladu, směna, podnět) — čistá část bez Reactu a bez databáze, aby šla otestovat
// v `npm test` a aby API i komponenta rozhodovaly podle téhož.
//
// Proč jedna sdílená funkce a ne „poznámka k úkolu", „komentář k návodu" zvlášť:
// lidé píšou totéž („pozor, dodavatel změnil balení", „tenhle krok se dá
// přeskočit v neděli") k pěti různým věcem. Jedna tabulka a jedna komponenta
// znamená jedno chování — kdo smí mazat, jak se počítá „před 2 h", jak dlouhý
// text projde — všude stejně.

/** Typy věcí, ke kterým jde psát. Server i klient berou seznam odsud. */
export const TYPY_POZNAMEK = ['task', 'guide', 'procedure', 'recipe', 'inventory_item', 'shift', 'suggestion'] as const;
export type TypPoznamky = (typeof TYPY_POZNAMEK)[number];

export const jeTypPoznamky = (x: unknown): x is TypPoznamky => typeof x === 'string' && (TYPY_POZNAMEK as readonly string[]).includes(x);

/** Nejdelší poznámka. Delší text je už návod, ne poznámka — a ten má vlastní editor. */
export const MAX_DELKA_POZNAMKY = 2000;

/**
 * Oprávnění, které kromě autora dovolí poznámku smazat: kdo spravuje danou
 * oblast, uklízí i poznámky pod ní (nevhodná, zastaralá, omylem k jiné věci).
 * Klíče jsou z lib/opravneniKatalog.ts.
 */
export const OPRAVNENI_SPRAVY_POZNAMEK: Record<TypPoznamky, string> = {
  task: 'ukoly.mazat',
  guide: 'navody.upravit',
  procedure: 'postupy.upravit',
  recipe: 'receptury.upravit',
  inventory_item: 'sklad.upravit',
  shift: 'rozvrh.upravit',
  // Kolo 7: vlákno pod podnětem (Nápady) — uklízí ten, kdo podněty spravuje.
  suggestion: 'napady.spravovat',
};

/**
 * Klíč entity, jak se ukládá do `entity_notes.entity_id` (TEXT).
 *
 * Proč text a ne číslo: receptura z kasy nemá vlastní číselný řádek — identita
 * je `product_id` pokladny (řetězec jako „p-4f2a"), a produkt bez zrcadla v
 * `pos_products` žádné číslo ani nikdy nedostane. Ostatní typy ukládají číslo
 * jako text; index (team_id, entity_type, entity_id) tím nic neztrácí.
 *
 * Vrací null, když klíč není platný: u číselných typů musí být kladné celé
 * číslo, u receptury neprázdný řetězec rozumné délky bez řídicích znaků.
 */
export function klicEntity(typ: TypPoznamky, id: unknown): string | null {
  const s = String(id ?? '').trim();
  if (!s) return null;
  if (typ === 'recipe') {
    if (s.length > 120) return null;
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f]/.test(s)) return null;
    return s;
  }
  if (!/^\d{1,12}$/.test(s)) return null;
  const n = Number(s);
  return n > 0 ? String(n) : null;
}

/**
 * Text poznámky k uložení: bez okrajových mezer, s jednotnými konci řádků.
 * Prázdný nebo příliš dlouhý text vrací null — volající řekne proč.
 */
export function normalizujTextPoznamky(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.replace(/\r\n?/g, '\n').trim();
  if (!t) return null;
  if (t.length > MAX_DELKA_POZNAMKY) return null;
  return t;
}

/** Autor může upravit text své poznámky; nikdo jiný (správce ji smí jen smazat). */
export const smiUpravitPoznamku = (autorId: number, meId: number): boolean => Number.isFinite(meId) && autorId === meId;

/**
 * Smazat smí autor, nebo kdo spravuje danou oblast (viz OPRAVNENI_SPRAVY_POZNAMEK).
 * Vlastník podniku má v `opr` celý katalog, takže projde taky.
 */
export function smiSmazatPoznamku(o: { typ: TypPoznamky; autorId: number; meId: number; opr: ReadonlySet<string> }): boolean {
  if (smiUpravitPoznamku(o.autorId, o.meId)) return true;
  return o.opr.has(OPRAVNENI_SPRAVY_POZNAMEK[o.typ]);
}

/** Popis času poznámky bez překladu — komponenta ho teprve přeloží. */
export type RelativniCas =
  | { druh: 'ted' }
  | { druh: 'min'; n: number }
  | { druh: 'h'; n: number }
  | { druh: 'den'; n: number }
  /** Starší než týden: ukáže se datum, ne „před 23 dny". */
  | { druh: 'datum' };

/**
 * „právě teď", „před 5 min", „před 2 h", „před 3 dny", po týdnu datum.
 * Čas v budoucnosti (hodiny serveru napřed) je „právě teď", ne „před -1 min".
 */
export function relativniCas(iso: string | number | Date, ted: number = Date.now()): RelativniCas {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return { druh: 'datum' };
  const min = Math.round((ted - ms) / 60000);
  if (min < 1) return { druh: 'ted' };
  if (min < 60) return { druh: 'min', n: min };
  const h = Math.round(min / 60);
  if (h < 24) return { druh: 'h', n: h };
  const dny = Math.round(h / 24);
  if (dny <= 7) return { druh: 'den', n: dny };
  return { druh: 'datum' };
}

/** Jedna poznámka, jak ji vrací /api/notes. */
export interface Poznamka {
  id: number;
  text: string;
  createdAt: string;
  updatedAt: string | null;
  autor: { id: number; name: string; avatar: string | null };
  /** Napsal ji ten, kdo se dívá (na tabletu vybraný člověk). */
  moje: boolean;
  /** Server už rozhodl: autor, nebo správce oblasti. UI tlačítko jen schová. */
  muzuSmazat: boolean;
}

/** Adresa seznamu — klíč sdílené mezipaměti (useDataWidgetu). Tablet ji nese i za koho. */
export function urlPoznamek(typ: TypPoznamky, id: string | number, actingAs?: number | null): string {
  const q = new URLSearchParams({ typ, id: String(id) });
  if (actingAs != null && Number.isFinite(actingAs)) q.set('actingAs', String(actingAs));
  return `/api/notes?${q.toString()}`;
}

/** Odpověď API do pole poznámek; cokoli jiného je chyba tvaru (ne prázdno). */
export function vyberPoznamky(raw: unknown): Poznamka[] {
  if (!Array.isArray(raw)) throw new Error('Poznámky přišly v nečekaném tvaru.'); // i18n-ok
  return raw
    .filter(p => p && typeof p === 'object' && p.id != null && typeof p.text === 'string')
    .map(p => ({
      id: Number(p.id),
      text: String(p.text),
      createdAt: String(p.createdAt ?? ''),
      updatedAt: p.updatedAt == null ? null : String(p.updatedAt),
      autor: {
        id: Number(p.autor?.id ?? 0),
        name: String(p.autor?.name ?? ''),
        avatar: p.autor?.avatar == null ? null : String(p.autor.avatar),
      },
      moje: p.moje === true,
      muzuSmazat: p.muzuSmazat === true,
    }));
}

// ---------------------------------------------------------------------------
// Podněty (Nápady): důvod zamítnutí a počty poznámek v seznamu (kolo 7)
// ---------------------------------------------------------------------------

/** Nejdelší důvod zamítnutí podnětu — jedna dvě věty, ne esej. */
export const MAX_DELKA_DUVODU = 300;

/**
 * Důvod zamítnutí k uložení: oříznutý, jednotné konce řádků, nejvýš 300 znaků.
 * Prázdný nebo chybějící = null (důvod je nepovinný); delší = false (odmítnout, ne tiše uříznout).
 */
export function normalizujDuvod(raw: unknown): string | null | false {
  if (raw == null) return null;
  if (typeof raw !== 'string') return false;
  const t = raw.replace(/\r\n?/g, '\n').trim();
  if (!t) return null;
  if (t.length > MAX_DELKA_DUVODU) return false;
  return t;
}

/** Tělo oznámení autorovi podnětu: stav, a když je, důvod za pomlčkou. */
export function teloOznameniPodnetu(stav: string, duvod: string | null): string {
  return duvod ? `${stav} — ${duvod}` : stav;
}

/** Nejvíc podnětů, pro které se v jednom dotazu vrátí počet poznámek. */
export const MAX_POCTU_NAJEDNOU = 200;

/** Adresa počtů poznámek pro seznam podnětů (`/api/notes?typ=suggestion&pocty=1,2,3`); bez id null. */
export function urlPoctuPoznamek(typ: 'suggestion', ids: readonly number[]): string | null {
  const cista = [...new Set(ids.filter(n => Number.isInteger(n) && n > 0))].sort((a, b) => a - b).slice(0, MAX_POCTU_NAJEDNOU);
  if (cista.length === 0) return null;
  return `/api/notes?${new URLSearchParams({ typ, pocty: cista.join(',') }).toString()}`;
}

/** Seznam id z parametru `pocty` (čárkou oddělená kladná celá čísla, nejvýš 200); nic platného = []. */
export function idsZPoctu(raw: string | null | undefined): number[] {
  if (!raw) return [];
  const out = new Set<number>();
  for (const kus of raw.split(',')) {
    const k = klicEntity('suggestion', kus);
    if (k) out.add(Number(k));
    if (out.size >= MAX_POCTU_NAJEDNOU) break;
  }
  return [...out];
}

/** Odpověď počtů do mapy id → počet; cokoli jiného je chyba tvaru. */
export function vyberPoctyPoznamek(raw: unknown): Record<number, number> {
  const p = (raw as { pocty?: unknown } | null)?.pocty;
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('Počty poznámek přišly v nečekaném tvaru.'); // i18n-ok
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
    const id = Number(k);
    const n = Number(v);
    if (Number.isInteger(id) && id > 0 && Number.isFinite(n) && n >= 0) out[id] = Math.floor(n);
  }
  return out;
}
