// Balení zděděné z kategorie — pro serverové cesty, které čtou řádky
// `inventory_items` přímo (odpis prodeje, spotřeba, marže, inventura, receptury).
//
// Položka bez vlastní velikosti balení a jednotky obsahu je dědí z nejbližší
// kategorie, která je má (`inventory_categories.default_package_size`,
// `content_unit`, i přes několik úrovní podkategorií). /api/inventory,
// výroba i plán to dělaly správně; ostatní čtenáři brali jen sloupec
// `package_size` položky, takže láhev zděděná z kategorie se při prodeji
// odepsala jako celé kusy a v marži vyšla za cenu jedné jednotky.
//
// Tohle je jediné místo, které kategorie načte a řekne „co se pro tuhle položku
// platí". Samotné rozhodnutí je `efektivniBaleni` v lib/packaging.

import { neon } from '@neondatabase/serverless';
import { efektivniBaleni, normalizeCategoryPackaging, type CategoryPackaging } from './packaging';
import { packagingSourceOf } from './categoryTree';
import { tymyCiselniku } from './tenant';

const sql = neon(process.env.DATABASE_URL!);

/** Řádek položky, ze kterého se pozná kategorie (id, jinak jméno z vlastních kategorií). */
export interface RadekKategorie {
  category_id?: number | string | null;
  categoryId?: number | string | null;
  category?: string | null;
}

export type BaleniKategorie = (r: RadekKategorie) => CategoryPackaging | null;

/** Kategorie týmu (včetně sdílených z organizace) → funkce „řádek položky → balení kategorie". */
export async function nactiBaleniKategorii(teamId: number): Promise<BaleniKategorie> {
  let cats: any[] = [];
  try {
    const tymy = await tymyCiselniku(teamId, 'kategorieSkladu');
    cats = await sql`
      SELECT id, team_id, name, parent_id, tracks_open, content_unit, default_package_size, threshold_unit, scale
      FROM inventory_categories WHERE team_id = ANY(${tymy})`;
  } catch {
    // Před migrací (nebo bez sloupců balení) žádné dědění neexistuje.
    return () => null;
  }
  const nodes = cats.map((c: any) => ({
    id: Number(c.id), name: String(c.name), position: 0,
    parentId: c.parent_id != null ? Number(c.parent_id) : null,
    tracksOpen: c.tracks_open === true,
    vlastni: Number(c.team_id) === Number(teamId),
  }));
  return (r) => {
    const id = r.category_id ?? r.categoryId;
    // Podle jména jen z vlastních řádků — položka bez id se nesmí chytnout
    // na cizí stejnojmennou kategorii.
    const own = id != null
      ? nodes.find(n => n.id === Number(id))
      : nodes.find(n => n.vlastni && n.name === r.category);
    const src = own ? packagingSourceOf(nodes, own) : null;
    return src ? normalizeCategoryPackaging(cats.find((c: any) => Number(c.id) === src.id)) : null;
  };
}

/**
 * Efektivní (velikost balení, jednotka obsahu) řádku položky z databáze.
 * `package_size` a `content_unit` jsou sloupce položky; kategorie doplní,
 * co chybí.
 */
export function baleniRadku(r: any, baleniKategorie: BaleniKategorie): { packageSize: number | null; contentUnit: string | null } {
  return efektivniBaleni(
    { packageSize: r.package_size ?? r.packageSize, contentUnit: r.content_unit ?? r.contentUnit },
    baleniKategorie(r),
  );
}
