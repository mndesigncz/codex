import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// GET ?itemId= : recent log entries for one item, or recent team-wide movements.
//
// Pohyb může být jen v načatém balení (odpis 0,04 l z lahve) — pak se počet
// kusů nezmění a bez old_open/new_open by to v historii vypadalo, že se
// nestalo nic.
//
// Kolo 67: `sklad.historie`. Historie nese jména (kdo co odepsal), a tak ji
// dřív bez kontroly role dostal každý včetně tabletu, přestože ji UI ukazuje
// jen ve skladu vedení — záměrně zavíraný únik.
export async function GET(request: Request) {
  const c = await pozaduj('sklad.historie');
  if (jeOdpoved(c)) return c;
  const me = { meId: c.meId, teamId: c.teamId };

  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get('itemId');

  if (itemId) {
    const rows = await sql`
      SELECT
        l.id,
        l.item_id       AS "itemId",
        l.old_quantity  AS "oldQuantity",
        l.new_quantity  AS "newQuantity",
        l.old_open      AS "oldOpen",
        l.new_open      AS "newOpen",
        l.note,
        l.created_at    AS "createdAt",
        u.name          AS "userName",
        i.name          AS "itemName",
        i.unit,
        i.content_unit  AS "contentUnit"
      FROM inventory_log l
      LEFT JOIN users u ON u.id = l.user_id
      LEFT JOIN inventory_items i ON i.id = l.item_id
      WHERE l.item_id = ${parseInt(itemId)} AND i.team_id = ${me.teamId}
      ORDER BY l.created_at DESC
      LIMIT 30`;
    return NextResponse.json(rows);
  }

  const rows = await sql`
    SELECT
      l.id,
      l.item_id       AS "itemId",
      l.old_quantity  AS "oldQuantity",
      l.new_quantity  AS "newQuantity",
      l.old_open      AS "oldOpen",
      l.new_open      AS "newOpen",
      l.note,
      l.created_at    AS "createdAt",
      u.name          AS "userName",
      i.name          AS "itemName",
      i.unit,
      i.content_unit  AS "contentUnit"
    FROM inventory_log l
    LEFT JOIN users u ON u.id = l.user_id
    JOIN inventory_items i ON i.id = l.item_id
    WHERE i.team_id = ${me.teamId}
    ORDER BY l.created_at DESC
    LIMIT 20`;

  return NextResponse.json(rows);
}
