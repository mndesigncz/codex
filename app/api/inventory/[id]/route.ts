import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { notifyUser } from '@/lib/push';

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

function statusOf(quantity: number, min: number, critical: number): 'ok' | 'low' | 'critical' {
  if (quantity <= critical) return 'critical';
  if (quantity <= min) return 'low';
  return 'ok';
}

// Return the item in the same shape the list endpoint uses (camelCase fields).
async function mappedItem(id: number) {
  try {
    const [row] = await sql`
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
      FROM inventory_items i LEFT JOIN users u ON u.id = i.updated_by
      WHERE i.id = ${id}`;
    return row && {
      ...row,
      packageSize: row.packageSize != null ? Number(row.packageSize) : null,
      openAmount: row.openAmount != null ? Number(row.openAmount) : null,
    };
  } catch {
    const [row] = await sql`
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
      FROM inventory_items i LEFT JOIN users u ON u.id = i.updated_by
      WHERE i.id = ${id}`;
    return row;
  }
}

// PATCH: employees may only change quantity; employers may edit all fields.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });

  const id = parseInt(params.id);
  const [item] = await sql`SELECT * FROM inventory_items WHERE id = ${id}`;
  if (!item) return NextResponse.json({ error: 'Položka nenalezena' }, { status: 404 });

  const body = await request.json();
  const note = body.note ?? null;

  if (me.role !== 'employer') {
    // Employees and the shared kiosk may change the stock count and, for
    // packaged goods, how much is left in the open package.
    if ((body.quantity === undefined || body.quantity === null) && body.openAmount === undefined) {
      return NextResponse.json({ error: 'Zaměstnanec může upravit pouze množství' }, { status: 403 });
    }
    const oldQty = Number(item.quantity);
    const newQty = body.quantity !== undefined && body.quantity !== null ? Number(body.quantity) : oldQty;
    const oldOpen = item.open_amount != null ? Number(item.open_amount) : null;
    const newOpen = body.openAmount !== undefined
      ? (body.openAmount === null ? null : Math.max(0, Number(body.openAmount) || 0))
      : oldOpen;

    if (body.openAmount !== undefined) {
      try {
        await sql`
          UPDATE inventory_items
          SET quantity = ${newQty}, open_amount = ${newOpen}, updated_by = ${me.meId}, updated_at = NOW()
          WHERE id = ${id}`;
      } catch {
        return NextResponse.json({ error: 'Sledování balení není dostupné — spusť /api/init.' }, { status: 400 });
      }
    } else {
      await sql`
        UPDATE inventory_items
        SET quantity = ${newQty}, updated_by = ${me.meId}, updated_at = NOW()
        WHERE id = ${id}`;
    }

    if (newQty !== oldQty || newOpen !== oldOpen) {
      try {
        await sql`
          INSERT INTO inventory_log (item_id, user_id, old_quantity, new_quantity, old_open, new_open, note, created_at)
          VALUES (${id}, ${me.meId}, ${oldQty}, ${newQty}, ${oldOpen}, ${newOpen}, ${note}, NOW())`;
      } catch {
        await sql`
          INSERT INTO inventory_log (item_id, user_id, old_quantity, new_quantity, note, created_at)
          VALUES (${id}, ${me.meId}, ${oldQty}, ${newQty}, ${note}, NOW())`;
      }

      // Alert employer(s) when the item drops to low/critical.
      const size = item.package_size != null ? Number(item.package_size) : 0;
      const effective = size > 0 ? newQty + (newOpen ?? 0) / size : newQty;
      const status = statusOf(effective, Number(item.min_quantity), Number(item.critical_quantity));
      if (status !== 'ok') {
        const employers = await sql`
          SELECT id FROM users WHERE team_id = ${me.teamId} AND role = 'employer'`;
        await Promise.all(
          employers.map((e: any) =>
            notifyUser(e.id, {
              title: 'Nízké zásoby',
              body: `${item.name} je na ${newQty} ${item.unit}`,
              type: 'inventory',
              category: 'stock',
              link: '/',
            }),
          ),
        );
      }
    }

    return NextResponse.json(await mappedItem(id));
  }

  // Employer: full edit.
  if (me.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const name = body.name !== undefined ? body.name : item.name;
  const category = body.category !== undefined ? body.category : item.category;
  const quantity = body.quantity !== undefined ? Number(body.quantity) : Number(item.quantity);
  const minQuantity = body.minQuantity !== undefined ? Number(body.minQuantity) : Number(item.min_quantity);
  const criticalQuantity = body.criticalQuantity !== undefined ? Number(body.criticalQuantity) : Number(item.critical_quantity);
  const maxQuantity = body.maxQuantity !== undefined ? Number(body.maxQuantity) : Number(item.max_quantity);
  const unit = body.unit !== undefined ? body.unit : item.unit;
  const supplier = body.supplier !== undefined ? body.supplier : item.supplier;
  const supplierUrl = body.supplierUrl !== undefined
    ? (body.supplierUrl ? String(body.supplierUrl).trim() || null : null)
    : item.supplier_url;

  await sql`
    UPDATE inventory_items SET
      name = ${name},
      category = ${category},
      quantity = ${quantity},
      min_quantity = ${minQuantity},
      critical_quantity = ${criticalQuantity},
      max_quantity = ${maxQuantity},
      unit = ${unit},
      supplier = ${supplier},
      supplier_url = ${supplierUrl},
      updated_by = ${me.meId},
      updated_at = NOW()
    WHERE id = ${id}`;

  // unit_cost updated separately so a not-yet-migrated column can't fail the edit.
  if (body.unitCost !== undefined) {
    const uc = body.unitCost === '' || body.unitCost === null ? null : Math.max(0, Math.round(Number(body.unitCost)));
    try { await sql`UPDATE inventory_items SET unit_cost = ${uc} WHERE id = ${id}`; } catch { /* column not migrated yet */ }
  }

  // Packaging, same treatment — an un-migrated DB must not block a plain edit.
  if (body.packageSize !== undefined || body.openAmount !== undefined) {
    const rawSize = body.packageSize === '' || body.packageSize === null ? null : Number(body.packageSize);
    const size = body.packageSize !== undefined
      ? (Number.isFinite(rawSize as number) && (rawSize as number) > 0 ? rawSize : null)
      : (item.package_size != null ? Number(item.package_size) : null);
    const open = body.openAmount !== undefined
      ? (body.openAmount === '' || body.openAmount === null ? null : Math.max(0, Number(body.openAmount) || 0))
      : (item.open_amount != null ? Number(item.open_amount) : null);
    try {
      await sql`UPDATE inventory_items SET package_size = ${size}, open_amount = ${open} WHERE id = ${id}`;
    } catch { /* columns not migrated yet */ }
  }

  // Log any employer-driven quantity change too.
  if (body.quantity !== undefined && Number(item.quantity) !== quantity) {
    await sql`
      INSERT INTO inventory_log (item_id, user_id, old_quantity, new_quantity, note, created_at)
      VALUES (${id}, ${me.meId}, ${Number(item.quantity)}, ${quantity}, ${note}, NOW())`;
  }

  return NextResponse.json(await mappedItem(id));
}

// DELETE (employer): remove item.
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (me.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const id = parseInt(params.id);
  await sql`DELETE FROM inventory_log WHERE item_id = ${id}`;
  await sql`DELETE FROM inventory_items WHERE id = ${id}`;

  return NextResponse.json({ ok: true });
}
