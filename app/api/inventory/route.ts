import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { normalizeCategoryPackaging, stockStatus, type CategoryPackaging } from '@/lib/packaging';

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

  // unit_cost is newer — try to include it, fall back if not yet migrated.
  let items: any[];
  try {
    items = await sql`
      SELECT
        i.id, i.name, i.category, i.quantity,
        i.min_quantity      AS "minQuantity",
        i.critical_quantity AS "criticalQuantity",
        i.max_quantity      AS "maxQuantity",
        i.unit, i.supplier,
        i.supplier_url      AS "supplierUrl",
        i.unit_cost         AS "unitCost",
        i.package_size      AS "packageSize",
        i.open_amount       AS "openAmount",
        i.updated_at        AS "updatedAt",
        i.updated_by        AS "updatedBy",
        u.name              AS "updatedByName"
      FROM inventory_items i
      LEFT JOIN users u ON u.id = i.updated_by
      WHERE i.team_id = ${me.teamId} OR i.team_id IS NULL
      ORDER BY i.name ASC`;
  } catch {
    items = await sql`
      SELECT
        i.id, i.name, i.category, i.quantity,
        i.min_quantity      AS "minQuantity",
        i.critical_quantity AS "criticalQuantity",
        i.max_quantity      AS "maxQuantity",
        i.unit, i.supplier,
        i.supplier_url      AS "supplierUrl",
        i.updated_at        AS "updatedAt",
        i.updated_by        AS "updatedBy",
        u.name              AS "updatedByName"
      FROM inventory_items i
      LEFT JOIN users u ON u.id = i.updated_by
      WHERE i.team_id = ${me.teamId} OR i.team_id IS NULL
      ORDER BY i.name ASC`;
  }

  // The category decides whether the thresholds mean packages or content, so the
  // status is computed once here. Every screen reads `status` instead of
  // re-deriving it and reaching a different answer than the stock view.
  let cats: any[] = [];
  try {
    cats = await sql`
      SELECT name, tracks_open, content_unit, default_package_size, threshold_unit, scale, parent_id, id
      FROM inventory_categories WHERE team_id = ${me.teamId}`;
  } catch {
    try {
      cats = await sql`
        SELECT name, tracks_open, content_unit, default_package_size, scale, parent_id, id
        FROM inventory_categories WHERE team_id = ${me.teamId}`;
    } catch { cats = []; }
  }

  // Subcategories inherit their parent's packaging settings.
  const packagingByName = new Map<string, CategoryPackaging>();
  cats.forEach((c: any) => {
    const source = c.tracks_open === true
      ? c
      : (c.parent_id != null ? cats.find((p: any) => p.id === c.parent_id) : null);
    if (source?.tracks_open === true) packagingByName.set(c.name, normalizeCategoryPackaging(source));
  });

  return NextResponse.json(items.map((i: any) => {
    const item = {
      ...i,
      packageSize: i.packageSize != null ? Number(i.packageSize) : null,
      openAmount: i.openAmount != null ? Number(i.openAmount) : null,
    };
    const packaging = packagingByName.get(i.category) ?? null;
    const sized = packaging
      ? { ...item, packageSize: item.packageSize ?? packaging.defaultPackageSize }
      : item;
    return {
      ...item,
      status: stockStatus(sized as any, packaging),
      thresholdUnit: packaging?.thresholdUnit ?? 'package',
    };
  }));
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

  const unitCost = body.unitCost === '' || body.unitCost == null ? null : Math.max(0, Math.round(Number(body.unitCost)));

  const [item] = await sql`
    INSERT INTO inventory_items
      (team_id, name, category, quantity, min_quantity, critical_quantity, max_quantity, unit, supplier, supplier_url, created_by, updated_by, updated_at)
    VALUES
      (${me.teamId}, ${name}, ${category}, ${quantity}, ${minQuantity}, ${criticalQuantity}, ${maxQuantity}, ${unit}, ${supplier}, ${supplierUrl}, ${me.meId}, ${me.meId}, NOW())
    RETURNING id`;

  // unit_cost applied separately so a not-yet-migrated column can't fail the insert.
  if (unitCost !== null && Number.isFinite(unitCost)) {
    try { await sql`UPDATE inventory_items SET unit_cost = ${unitCost} WHERE id = ${item.id}`; } catch { /* column not migrated yet */ }
  }

  return NextResponse.json({ ok: true, id: item.id });
}
