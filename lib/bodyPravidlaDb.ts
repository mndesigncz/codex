// Pravidla bodů — zápis a čtení v databázi. Čistá logika je v lib/bodyPravidla.ts.
//
// Sloupce se zajišťují i tady (ADD COLUMN IF NOT EXISTS při prvním použití), ať pravidla
// fungují dřív, než někdo po nasazení otevře /api/init. Stejné příkazy jsou v
// app/api/init/route.ts (blok „Body a úrovně"); odtud je čte kontrola SQL.

import { sql } from './client';
import {
  spoctiOdmenu, pravidlaBoduZProfilu, vylouceneZProfilu, cenaVyloucenychPolozek, type Odmena, type PravidlaBodu,
} from './bodyPravidla';

let pripraveno: Promise<void> | null = null;

/** Zajistí sloupce pravidel bodů a neaktivity úrovní. Jednou za studený start. */
export function zajistiBodyPravidla(): Promise<void> {
  if (!pripraveno) {
    pripraveno = (async () => {
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS points_round TEXT NOT NULL DEFAULT 'sta'`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS points_min_spend INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS points_cap_per_bill INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS points_exclude_prepaid BOOLEAN NOT NULL DEFAULT TRUE`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS points_exclude_items JSONB NOT NULL DEFAULT '[]'`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS tier_inactive_months INTEGER NOT NULL DEFAULT 0`;
    })().catch(e => { pripraveno = null; throw e; });
  }
  return pripraveno;
}

export interface VstupUctu {
  /** Část zaplacená kreditem nebo poukazem (od obsluhy). */
  predplaceno?: unknown;
  /** Položky účtu z Pokladny — z nich se odečtou vyloučené. */
  polozky?: { productId: string | null; amount: number; price: number | null }[];
}

/** ID produktů v Pokladně, které podnik vyloučil z bodů (podle položek nabídky). Chyba = nic nevyloučeno. */
async function vylouceneProdukty(teamId: number, profil: any): Promise<Set<string>> {
  const ids = vylouceneZProfilu(profil?.points_exclude_items).map(x => x.itemId);
  if (!ids.length) return new Set();
  try {
    const rows = await sql`
      SELECT mi.pos_product_id FROM menu_items mi
      JOIN menu_sections ms ON ms.id = mi.section_id
      JOIN menu_boards mb ON mb.id = ms.board_id AND mb.team_id = ${teamId}
      WHERE mi.id = ANY(${ids}) AND mi.pos_product_id IS NOT NULL` as any[];
    return new Set(rows.map(r => String(r.pos_product_id)));
  } catch {
    return new Set();
  }
}

/**
 * Body a cashback z účtu podle pravidel podniku — jedno místo pro kasu i objednávky.
 * Bez nových nastavení vychází přesně dosavadní výpočet.
 */
export async function odmenaZUctu(teamId: number, profil: any, castka: unknown, vstup: VstupUctu = {}): Promise<{ odmena: Odmena; pravidla: PravidlaBodu }> {
  const pravidla = pravidlaBoduZProfilu(profil);
  let vylouceno = 0;
  if (vstup.polozky?.length) {
    const produkty = await vylouceneProdukty(teamId, profil);
    if (produkty.size) vylouceno = cenaVyloucenychPolozek(vstup.polozky, produkty);
  }
  return { odmena: spoctiOdmenu(castka, pravidla, { predplaceno: vstup.predplaceno, vylouceno }), pravidla };
}
