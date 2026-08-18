import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { notifyUsers } from '@/lib/push';
import { normalizeCategoryPackaging, stockStatus, type CategoryPackaging } from '@/lib/packaging';
import { packagingSourceOf } from '@/lib/categoryTree';

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
        i.brand, i.description, i.archived,
        i.hide_from_overview AS "hideFromOverview",
        i.approved, i.submitted_by AS "submittedBy",
        i.category_id       AS "categoryId",
        i.updated_at        AS "updatedAt",
        i.updated_by        AS "updatedBy",
        u.name              AS "updatedByName"
      FROM inventory_items i
      LEFT JOIN users u ON u.id = i.updated_by
      WHERE i.team_id = ${me.teamId} OR i.team_id IS NULL
      ORDER BY i.name ASC`;
  } catch {
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

  // Subcategories inherit packaging from the nearest ancestor that has it, at
  // any depth, so it is configured once on "Tabáky" and holds all the way down.
  const nodes = cats.map((c: any) => ({
    id: Number(c.id), name: String(c.name), position: 0,
    parentId: c.parent_id != null ? Number(c.parent_id) : null,
    tracksOpen: c.tracks_open === true,
  }));
  // Keyed by id: two categories may share a name under different parents.
  const packagingById = new Map<number, CategoryPackaging>();
  const packagingByName = new Map<string, CategoryPackaging>();
  nodes.forEach(n => {
    const src = packagingSourceOf(nodes, n);
    if (!src) return;
    const settings = normalizeCategoryPackaging(cats.find((c: any) => Number(c.id) === src.id));
    packagingById.set(n.id, settings);
    // Name lookup stays as the fallback for items with no category_id yet.
    if (!packagingByName.has(n.name)) packagingByName.set(n.name, settings);
  });

  return NextResponse.json(items.map((i: any) => {
    const item = {
      ...i,
      packageSize: i.packageSize != null ? Number(i.packageSize) : null,
      openAmount: i.openAmount != null ? Number(i.openAmount) : null,
    };
    const packaging = (i.categoryId != null ? packagingById.get(Number(i.categoryId)) : undefined)
      ?? packagingByName.get(i.category) ?? null;
    const sized = packaging
      ? { ...item, packageSize: item.packageSize ?? packaging.defaultPackageSize }
      : item;
    return {
      ...item,
      categoryId: i.categoryId != null ? Number(i.categoryId) : null,
      brand: i.brand ?? null,
      description: i.description ?? null,
      archived: i.archived === true,
      status: stockStatus(sized as any, packaging),
      thresholdUnit: packaging?.thresholdUnit ?? 'package',
    };
  }));
}

// POST: employer creates an item; an employee PROPOSES one (needs approval).
export async function POST(request: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (me.role === 'kiosk') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const isProposal = me.role !== 'employer';

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

  // Employee proposals wait for the employer; the columns are newer, so the
  // flag lands defensively (missing column ⇒ item is simply live right away).
  if (isProposal) {
    try {
      await sql`UPDATE inventory_items SET approved = FALSE, submitted_by = ${me.meId} WHERE id = ${item.id}`;
      const employers = await sql`SELECT id FROM users WHERE team_id = ${me.teamId} AND role = 'employer'`;
      const [author] = await sql`SELECT name FROM users WHERE id = ${me.meId}`;
      await notifyUsers((employers as any[]).map(e => e.id), {
        title: '📦 Návrh položky ke schválení',
        body: `${author?.name ?? 'Zaměstnanec'} navrhuje do skladu „${name}".`,
        type: 'info',
        link: '/employer/overview?view=inventory',
      });
    } catch { /* best-effort */ }
  }

  // unit_cost applied separately so a not-yet-migrated column can't fail the insert.
  if (unitCost !== null && Number.isFinite(unitCost)) {
    try { await sql`UPDATE inventory_items SET unit_cost = ${unitCost} WHERE id = ${item.id}`; } catch { /* column not migrated yet */ }
  }

  // Same treatment for the newer descriptive columns and the package size.
  const brand = body.brand ? String(body.brand).trim().slice(0, 120) || null : null;
  const description = body.description ? String(body.description).trim().slice(0, 500) || null : null;
  if (brand || description) {
    try {
      await sql`UPDATE inventory_items SET brand = ${brand}, description = ${description} WHERE id = ${item.id}`;
    } catch { /* columns not migrated yet */ }
  }
  // The category pointer is what filters run on; the text stays as the label.
  const categoryId = Number(body.categoryId);
  if (Number.isFinite(categoryId) && categoryId > 0) {
    try {
      await sql`
        UPDATE inventory_items SET category_id = ${categoryId}
        WHERE id = ${item.id} AND EXISTS (
          SELECT 1 FROM inventory_categories c WHERE c.id = ${categoryId} AND c.team_id = ${me.teamId})`;
    } catch { /* column not migrated yet */ }
  }

  const rawSize = body.packageSize === '' || body.packageSize == null ? null : Number(body.packageSize);
  if (rawSize !== null && Number.isFinite(rawSize) && rawSize > 0) {
    try { await sql`UPDATE inventory_items SET package_size = ${rawSize} WHERE id = ${item.id}`; } catch { /* not migrated */ }
  }

  return NextResponse.json({ ok: true, id: item.id });
}
