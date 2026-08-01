// Bulk edits over selected stock items. One request instead of one per item,
// and every field is applied with its own statement so a column that a database
// has not migrated yet can't take the rest of the edit down with it.

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
  return { meId, role, teamId: u?.team_id ?? null };
}

function idsFrom(raw: any): number[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(
    raw.map((v: any) => Number(v)).filter(n => Number.isFinite(n) && n > 0),
  )).slice(0, 500);
}

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function PATCH(request: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (me.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const body = await request.json();
  const ids = idsFrom(body.ids);
  if (ids.length === 0) return NextResponse.json({ error: 'Nevybrány žádné položky' }, { status: 400 });

  const patch = body.patch ?? {};
  const applied: string[] = [];
  const skipped: string[] = [];

  // Re-filing keeps the label and the pointer in step.
  if (patch.categoryId !== undefined) {
    const catId = num(patch.categoryId);
    if (catId != null) {
      const [cat] = await sql`
        SELECT id, name FROM inventory_categories WHERE id = ${catId} AND team_id = ${me.teamId}`;
      if (!cat) return NextResponse.json({ error: 'Kategorie neexistuje' }, { status: 400 });
      await sql`
        UPDATE inventory_items SET category = ${cat.name}, updated_by = ${me.meId}, updated_at = NOW()
        WHERE id = ANY(${ids}) AND team_id = ${me.teamId}`;
      try {
        await sql`
          UPDATE inventory_items SET category_id = ${catId}
          WHERE id = ANY(${ids}) AND team_id = ${me.teamId}`;
      } catch { skipped.push('categoryId'); }
      applied.push('category');
    }
  }

  if (patch.unit !== undefined) {
    const unit = String(patch.unit).trim().slice(0, 24);
    if (unit) {
      await sql`UPDATE inventory_items SET unit = ${unit} WHERE id = ANY(${ids}) AND team_id = ${me.teamId}`;
      applied.push('unit');
    }
  }

  if (patch.supplier !== undefined) {
    const supplier = patch.supplier ? String(patch.supplier).trim().slice(0, 200) || null : null;
    await sql`UPDATE inventory_items SET supplier = ${supplier} WHERE id = ANY(${ids}) AND team_id = ${me.teamId}`;
    applied.push('supplier');
  }

  if (patch.supplierUrl !== undefined) {
    const url = patch.supplierUrl ? String(patch.supplierUrl).trim().slice(0, 500) || null : null;
    await sql`UPDATE inventory_items SET supplier_url = ${url} WHERE id = ANY(${ids}) AND team_id = ${me.teamId}`;
    applied.push('supplierUrl');
  }

  if (patch.minQuantity !== undefined) {
    const v = num(patch.minQuantity);
    if (v != null) {
      await sql`UPDATE inventory_items SET min_quantity = ${Math.max(0, Math.round(v))} WHERE id = ANY(${ids}) AND team_id = ${me.teamId}`;
      applied.push('minQuantity');
    }
  }

  if (patch.criticalQuantity !== undefined) {
    const v = num(patch.criticalQuantity);
    if (v != null) {
      await sql`UPDATE inventory_items SET critical_quantity = ${Math.max(0, Math.round(v))} WHERE id = ANY(${ids}) AND team_id = ${me.teamId}`;
      applied.push('criticalQuantity');
    }
  }

  if (patch.maxQuantity !== undefined) {
    const v = num(patch.maxQuantity);
    if (v != null) {
      await sql`UPDATE inventory_items SET max_quantity = ${Math.max(0, Math.round(v))} WHERE id = ANY(${ids}) AND team_id = ${me.teamId}`;
      applied.push('maxQuantity');
    }
  }

  if (patch.unitCost !== undefined) {
    const v = patch.unitCost === null || patch.unitCost === '' ? null : num(patch.unitCost);
    try {
      await sql`UPDATE inventory_items SET unit_cost = ${v == null ? null : Math.max(0, Math.round(v))} WHERE id = ANY(${ids}) AND team_id = ${me.teamId}`;
      applied.push('unitCost');
    } catch { skipped.push('unitCost'); }
  }

  if (patch.packageSize !== undefined) {
    const v = patch.packageSize === null || patch.packageSize === '' ? null : num(patch.packageSize);
    try {
      await sql`UPDATE inventory_items SET package_size = ${v == null || v <= 0 ? null : v} WHERE id = ANY(${ids}) AND team_id = ${me.teamId}`;
      applied.push('packageSize');
    } catch { skipped.push('packageSize'); }
  }

  if (patch.brand !== undefined) {
    const brand = patch.brand ? String(patch.brand).trim().slice(0, 120) || null : null;
    try {
      await sql`UPDATE inventory_items SET brand = ${brand} WHERE id = ANY(${ids}) AND team_id = ${me.teamId}`;
      applied.push('brand');
    } catch { skipped.push('brand'); }
  }

  if (patch.description !== undefined) {
    const desc = patch.description ? String(patch.description).trim().slice(0, 500) || null : null;
    try {
      await sql`UPDATE inventory_items SET description = ${desc} WHERE id = ANY(${ids}) AND team_id = ${me.teamId}`;
      applied.push('description');
    } catch { skipped.push('description'); }
  }

  if (patch.archived !== undefined) {
    try {
      await sql`UPDATE inventory_items SET archived = ${patch.archived === true} WHERE id = ANY(${ids}) AND team_id = ${me.teamId}`;
      applied.push('archived');
    } catch { skipped.push('archived'); }
  }

  if (applied.length === 0 && skipped.length === 0) {
    return NextResponse.json({ error: 'Nebylo co změnit' }, { status: 400 });
  }

  await sql`
    UPDATE inventory_items SET updated_by = ${me.meId}, updated_at = NOW()
    WHERE id = ANY(${ids}) AND team_id = ${me.teamId}`;

  return NextResponse.json({ ok: true, count: ids.length, applied, skipped });
}

// DELETE: remove the selected items outright.
export async function DELETE(request: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (me.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const ids = idsFrom(body.ids);
  if (ids.length === 0) return NextResponse.json({ error: 'Nevybrány žádné položky' }, { status: 400 });

  await sql`DELETE FROM inventory_items WHERE id = ANY(${ids}) AND team_id = ${me.teamId}`;
  return NextResponse.json({ ok: true, count: ids.length });
}
