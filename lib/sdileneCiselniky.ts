// Sdílené číselníky — čistá logika (kolo 60). Databázová část je vedle
// v lib/sdileneCiselnikyDb.ts, stejná dvojice jako navody.ts / navodyDb.ts.
//
// Sdílení je jen ve čtení. Tohle jsou pomocníci pro dvě chvíle, kdy se
// řádky opravdu hýbou: VYPNUTÍ sdílení (podnik dostane kopie toho, co ze
// zdroje používal, ať mu položky nezůstanou s ukazatelem do prázdna)
// a řazení sjednocených seznamů (vlastní řádky první, ať lokální „Ranní"
// vyhraje nad zdrojovým všude, kde se páruje podle jména).

import { MAX_DEPTH } from './categoryTree.ts';

/** Syrový řádek kategorie z databáze (snake_case) — kopie pracuje s ním, ne s CategoryNode z UI. */
export interface RadekKategorie { id: number; parent_id: number | null }

/** Řádek se svým podnikem — společný tvar všech pěti číselníků. */
export interface RadekPodniku { id: number; team_id: number; position?: number | null }

/** Vlastní řádky před cizími; uvnitř skupiny podle position, pak id. Nemění vstup. */
export function seradVlastniPrvni<T extends RadekPodniku>(rows: T[], teamId: number): T[] {
  return [...rows].sort((a, b) => {
    const va = Number(a.team_id) === teamId ? 0 : 1;
    const vb = Number(b.team_id) === teamId ? 0 : 1;
    if (va !== vb) return va - vb;
    const pa = a.position ?? 0; const pb = b.position ?? 0;
    if (pa !== pb) return pa - pb;
    return a.id - b.id;
  });
}

/**
 * Které kategorie zdroje se musí zkopírovat podniku, který používá `pouziteIds`:
 * použité a všechny jejich předky (balení i předvyplnění se dědí po řetězci
 * předků, lib/categoryTree.ts packagingSourceOf, lib/itemDefaults.ts
 * mergeDefaults — bez rodiče by kopie ztratila, co po něm dědila).
 * Pořadí je rodič před dítětem, aby se parent_id dal přemapovat v jednom
 * průchodu. Id mimo strom se ignoruje; cyklus v parent_id neskončí smyčkou.
 */
export function kategorieKeKopirovani<T extends RadekKategorie>(strom: T[], pouziteIds: number[]): T[] {
  const byId = new Map<number, T>(strom.map(c => [c.id, c]));
  const vybrane = new Set<number>();
  for (const id of pouziteIds) {
    let cur = byId.get(id);
    let depth = 0;
    while (cur && !vybrane.has(cur.id) && depth < MAX_DEPTH) {
      vybrane.add(cur.id);
      cur = cur.parent_id == null ? undefined : byId.get(cur.parent_id);
      depth++;
    }
  }
  // Rodič před dítětem: opakovaně vybírej řádky, jejichž rodič už je venku
  // (nebo je kořen / rodič mimo výběr). Cyklus se nikdy nevydá celý — zbytek
  // se dopíše jako kořeny, ať kopírování nikdy neuvízne.
  const zbyva = new Set(vybrane);
  const out: T[] = [];
  const hotovo = new Set<number>();
  let pohyb = true;
  while (zbyva.size && pohyb) {
    pohyb = false;
    for (const id of [...zbyva]) {
      const c = byId.get(id)!;
      const rodicVenku = c.parent_id == null || !vybrane.has(c.parent_id) || hotovo.has(c.parent_id);
      if (rodicVenku) { out.push(c); hotovo.add(id); zbyva.delete(id); pohyb = true; }
    }
  }
  for (const id of zbyva) out.push(byId.get(id)!);
  return out;
}

/** Nový parent_id kopie: přes mapu původní→nové id; rodič mimo kopie = kořen. */
export function premapujRodice(parentId: number | null, mapa: Map<number, number>): number | null {
  if (parentId == null) return null;
  return mapa.get(parentId) ?? null;
}
