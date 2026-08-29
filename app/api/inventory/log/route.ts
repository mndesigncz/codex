import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function currentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const meId = parseInt((session.user as any).id);
  const role = (session.user as any).role as string;
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  const teamId = u?.team_id ?? null;
  return { meId, role, teamId };
}

// GET ?itemId= : recent log entries for one item, or recent team-wide movements.
//
// Pohyb může být jen v načatém balení (odpis 0,04 l z lahve) — pak se počet
// kusů nezmění a bez old_open/new_open by to v historii vypadalo, že se
// nestalo nic.
export async function GET(request: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });

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
    WHERE i.team_id = ${me.teamId} OR i.team_id IS NULL
    ORDER BY l.created_at DESC
    LIMIT 20`;

  return NextResponse.json(rows);
}
