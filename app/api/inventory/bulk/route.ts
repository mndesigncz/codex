// Bulk edits over selected stock items. One request instead of one per item,
// and every field is applied with its own statement so a column that a database
// has not migrated yet can't take the rest of the edit down with it.

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { webovaUrl } from '@/lib/bezpecnaUrl';
import { tymyCiselniku } from '@/lib/tenant';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

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

// Kolo 67: `sklad.upravit`; nákupní cenu navíc `sklad.ceny_upravit` — jinak
// by šlo cenu obejít hromadnou úpravou. Chybí-li oprávnění k ceně, odmítne
// se celý požadavek, ať se neuloží půlka.
export async function PATCH(request: Request) {
  const c = await pozaduj('sklad.upravit');
  if (jeOdpoved(c)) return c;
  const me = { meId: c.meId, teamId: c.teamId };

  const body = await request.json();
  const ids = idsFrom(body.ids);
  if (ids.length === 0) return NextResponse.json({ error: 'Nevybrány žádné položky' }, { status: 400 });

  const patch = body.patch ?? {};
  if (patch.unitCost !== undefined && !c.role.opravneni.has('sklad.ceny_upravit')) {
    return NextResponse.json({ error: 'Na nákupní ceny nemáš oprávnění.' }, { status: 403 });
  }
  const applied: string[] = [];
  const skipped: string[] = [];

  // Re-filing keeps the label and the pointer in step.
  if (patch.categoryId !== undefined) {
    const catId = num(patch.categoryId);
    if (catId != null) {
      // Cíl proti viditelným podnikům (vlastní + zdroj organizace, kolo 60),
      // nikdy proti holému id — kategorie cizí organizace neprojde.
      const tymy = await tymyCiselniku(me.teamId, 'kategorieSkladu');
      const [cat] = await sql`
        SELECT id, name FROM inventory_categories WHERE id = ${catId} AND team_id = ANY(${tymy})`;
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
    const url = webovaUrl(patch.supplierUrl);
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

// DELETE: remove the selected items outright. Kolo 67: `sklad.mazat`.
export async function DELETE(request: Request) {
  const c = await pozaduj('sklad.mazat');
  if (jeOdpoved(c)) return c;
  const me = { meId: c.meId, teamId: c.teamId };

  const body = await request.json().catch(() => ({}));
  const ids = idsFrom(body.ids);
  if (ids.length === 0) return NextResponse.json({ error: 'Nevybrány žádné položky' }, { status: 400 });

  await sql`DELETE FROM inventory_items WHERE id = ANY(${ids}) AND team_id = ${me.teamId}`;
  return NextResponse.json({ ok: true, count: ids.length });
}
