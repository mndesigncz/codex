// Zápis a čtení vazby návod ↔ skladová položka. Oddělené od `lib/navody.ts`,
// aby tamní logika šla testovat bez databáze — stejně jako `lib/blokace.ts`
// a `lib/blokaceDb.ts`.

import { neon } from '@neondatabase/serverless';
import { navodyPodlePolozek, type NavodKPolozce } from './navody';

const sql = neon(process.env.DATABASE_URL!);

/**
 * Připne návod ke skladové položce — nebo vazbu zruší (`itemId = null`).
 *
 * Na jednu položku má ukazovat jeden návod. Kdyby jich bylo víc, obsluha by
 * u úkolu „Vyrobit limonádu“ viděla jeden postup a vedení v editoru jiný,
 * aniž by kdokoli tušil, že jsou dva. Proto se při připnutí vazba ostatním
 * návodům téhož týmu odebere.
 *
 * Vrací `false`, když položka k týmu nepatří nebo sloupec ještě neexistuje
 * (databáze před migrací) — návod se v takovém případě uloží, jen bez vazby.
 */
export async function pripniNavodKPolozce(
  teamId: number, guideId: number, itemId: number | null,
): Promise<boolean> {
  try {
    if (itemId == null) {
      await sql`UPDATE guides SET item_id = NULL WHERE id = ${guideId} AND team_id = ${teamId}`;
      return true;
    }
    // Cizí položku nelze připnout ani omylem, ani schválně: tohle je jediné
    // místo, kde se `item_id` nastavuje, a projde jen položka téhož týmu.
    const [polozka] = await sql`
      SELECT id FROM inventory_items WHERE id = ${itemId} AND team_id = ${teamId}`;
    if (!polozka) return false;
    await sql`
      UPDATE guides SET item_id = NULL
      WHERE team_id = ${teamId} AND item_id = ${itemId} AND id <> ${guideId}`;
    await sql`UPDATE guides SET item_id = ${itemId} WHERE id = ${guideId} AND team_id = ${teamId}`;
    return true;
  } catch {
    return false; // migrace ještě neproběhla
  }
}

/** Návody připnuté k těmhle položkám, seskupené podle položky. */
export async function navodyProPolozky(
  teamId: number, itemIds: number[],
): Promise<Map<number, NavodKPolozce>> {
  const ids = itemIds.filter(n => Number.isFinite(n) && n > 0);
  if (ids.length === 0) return new Map();
  try {
    const rows = await sql`
      SELECT id, title, checklist, approved, item_id
      FROM guides
      WHERE team_id = ${teamId} AND item_id = ANY(${ids})
      ORDER BY id`;
    return navodyPodlePolozek(rows as any[]);
  } catch {
    return new Map(); // migrace ještě neproběhla
  }
}

/** Návod připnutý k jedné položce, nebo `null`. */
export async function navodProPolozku(teamId: number, itemId: number): Promise<NavodKPolozce | null> {
  return (await navodyProPolozky(teamId, [itemId])).get(itemId) ?? null;
}
