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
  const [row] = await sql`
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
    WHERE i.id = ${id}`;
  return row;
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
    // Employees and the shared kiosk may only change the stock count.
    if (body.quantity === undefined || body.quantity === null) {
      return NextResponse.json({ error: 'Zaměstnanec může upravit pouze množství' }, { status: 403 });
    }
    const newQty = Number(body.quantity);
    const oldQty = Number(item.quantity);

    await sql`
      UPDATE inventory_items
      SET quantity = ${newQty}, updated_by = ${me.meId}, updated_at = NOW()
      WHERE id = ${id}`;

    if (newQty !== oldQty) {
      await sql`
        INSERT INTO inventory_log (item_id, user_id, old_quantity, new_quantity, note, created_at)
        VALUES (${id}, ${me.meId}, ${oldQty}, ${newQty}, ${note}, NOW())`;

      // Alert employer(s) when the item drops to low/critical.
      const status = statusOf(newQty, Number(item.min_quantity), Number(item.critical_quantity));
      if (status !== 'ok') {
        const employers = await sql`
          SELECT id FROM users WHERE team_id = ${me.teamId} AND role = 'employer'`;
        await Promise.all(
          employers.map((e: any) =>
            notifyUser(e.id, {
              title: 'Nízké zásoby',
              body: `${item.name} je na ${newQty} ${item.unit}`,
              type: 'inventory',
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
