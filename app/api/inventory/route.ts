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

// GET: list the team's inventory items (incl. legacy items with null team_id)
export async function GET() {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });

  const items = await sql`
    SELECT
      i.id,
      i.name,
      i.category,
      i.quantity,
      i.min_quantity      AS "minQuantity",
      i.critical_quantity AS "criticalQuantity",
      i.max_quantity      AS "maxQuantity",
      i.unit,
      i.supplier,
      i.supplier_url      AS "supplierUrl",
      i.updated_at        AS "updatedAt",
      i.updated_by        AS "updatedBy",
      u.name              AS "updatedByName"
    FROM inventory_items i
    LEFT JOIN users u ON u.id = i.updated_by
    WHERE i.team_id = ${me.teamId} OR i.team_id IS NULL
    ORDER BY i.name ASC`;

  return NextResponse.json(items);
}

// POST (employer): create a new item
export async function POST(request: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (me.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const body = await request.json();
  const name = (body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Název je povinný' }, { status: 400 });

  const category = body.category ?? null;
  const quantity = Number(body.quantity) || 0;
  const minQuantity = Number(body.minQuantity) || 0;
  const criticalQuantity = Number(body.criticalQuantity) || 0;
  const maxQuantity = Number(body.maxQuantity) || 0;
  const unit = body.unit ?? 'ks';
  const supplier = body.supplier ?? null;
  const supplierUrl = body.supplierUrl ? String(body.supplierUrl).trim() || null : null;

  const [item] = await sql`
    INSERT INTO inventory_items
      (team_id, name, category, quantity, min_quantity, critical_quantity, max_quantity, unit, supplier, supplier_url, created_by, updated_by, updated_at)
    VALUES
      (${me.teamId}, ${name}, ${category}, ${quantity}, ${minQuantity}, ${criticalQuantity}, ${maxQuantity}, ${unit}, ${supplier}, ${supplierUrl}, ${me.meId}, ${me.meId}, NOW())
    RETURNING id`;

  return NextResponse.json({ ok: true, id: item.id });
}
