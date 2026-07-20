import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function ctx() {
  const s = await getServerSession(authOptions);
  if (!s?.user) return null;
  const meId = parseInt((s.user as any).id);
  const role = (s.user as any).role as string;
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  return { meId, role, teamId: u?.team_id as number | null };
}

interface OrderItem { name: string; qty: number; unit: string; itemId?: number | null }

function cleanItems(raw: any): OrderItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((i: any) => ({
      name: String(i?.name ?? '').trim().slice(0, 120),
      qty: Math.max(1, Math.round(Number(i?.qty)) || 1),
      unit: String(i?.unit ?? 'ks').slice(0, 12),
      itemId: Number.isFinite(parseInt(i?.itemId)) ? parseInt(i.itemId) : null,
    }))
    .filter(i => i.name);
}

const shape = (r: any) => ({
  id: r.id, supplier: r.supplier, items: r.items ?? [], totalCost: r.total_cost,
  status: r.status, note: r.note, createdAt: r.created_at, receivedAt: r.received_at,
  createdByName: r.created_by_name ?? null,
});

// GET — the team's orders (employer only; money is involved).
export async function GET() {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (c.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  if (!c.teamId) return NextResponse.json({ orders: [] });
  try {
    const rows = await sql`
      SELECT o.*, u.name AS created_by_name
      FROM orders o LEFT JOIN users u ON u.id = o.created_by
      WHERE o.team_id = ${c.teamId}
      ORDER BY (o.status = 'ordered') DESC, o.created_at DESC
      LIMIT 100`;
    return NextResponse.json({ orders: rows.map(shape) });
  } catch {
    return NextResponse.json({ orders: [] });
  }
}

// POST (employer) — create an order: { supplier?, items: [{name, qty, unit, itemId?}], note? }.
export async function POST(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (c.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  if (!c.teamId) return NextResponse.json({ error: 'Tým nenalezen' }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const items = cleanItems(b.items);
  if (items.length === 0) return NextResponse.json({ error: 'Objednávka nemá žádné položky.' }, { status: 400 });

  const [row] = await sql`
    INSERT INTO orders (team_id, created_by, supplier, items, note)
    VALUES (${c.teamId}, ${c.meId}, ${b.supplier ? String(b.supplier).slice(0, 120) : null},
            ${JSON.stringify(items)}, ${b.note ? String(b.note).slice(0, 500) : null})
    RETURNING *`;
  return NextResponse.json({ ok: true, order: shape(row) });
}

// PATCH (employer) — receive or cancel: { id, action: 'received'|'cancelled', totalCost?, restock? }.
// Receiving with restock=true adds the ordered quantities to matching stock items.
export async function PATCH(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (c.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const id = parseInt(b.id);
  const action = b.action === 'received' ? 'received' : b.action === 'cancelled' ? 'cancelled' : null;
  if (!Number.isFinite(id) || !action) return NextResponse.json({ error: 'Neplatný požadavek' }, { status: 400 });

  const [order] = await sql`SELECT * FROM orders WHERE id = ${id} AND team_id = ${c.teamId}`;
  if (!order) return NextResponse.json({ error: 'Objednávka nenalezena' }, { status: 404 });
  if (order.status !== 'ordered') return NextResponse.json({ error: 'Objednávka už je vyřízená.' }, { status: 409 });

  const totalCost = action === 'received' && b.totalCost !== undefined && b.totalCost !== null && b.totalCost !== ''
    ? Math.max(0, Math.round(Number(b.totalCost)) || 0)
    : null;

  const [row] = await sql`
    UPDATE orders
    SET status = ${action},
        total_cost = ${totalCost},
        received_at = ${action === 'received' ? new Date().toISOString() : null}
    WHERE id = ${id}
    RETURNING *`;

  // Auto-restock: add ordered quantities to matching inventory items.
  let restocked = 0;
  if (action === 'received' && b.restock !== false) {
    const items: OrderItem[] = Array.isArray(order.items) ? order.items : [];
    for (const it of items) {
      try {
        let updated: any[] = [];
        if (it.itemId) {
          updated = await sql`
            UPDATE inventory_items SET quantity = quantity + ${it.qty}, updated_by = ${c.meId}, updated_at = NOW()
            WHERE id = ${it.itemId} AND (team_id = ${c.teamId} OR team_id IS NULL)
            RETURNING id, quantity`;
        }
        if (updated.length === 0) {
          updated = await sql`
            UPDATE inventory_items SET quantity = quantity + ${it.qty}, updated_by = ${c.meId}, updated_at = NOW()
            WHERE LOWER(name) = LOWER(${it.name}) AND (team_id = ${c.teamId} OR team_id IS NULL)
            RETURNING id, quantity`;
        }
        if (updated.length > 0) {
          restocked++;
          try {
            await sql`
              INSERT INTO inventory_log (item_id, user_id, old_quantity, new_quantity, note)
              VALUES (${updated[0].id}, ${c.meId}, ${updated[0].quantity - it.qty}, ${updated[0].quantity}, ${'Příjem objednávky #' + id})`;
          } catch { /* log is best-effort */ }
        }
      } catch { /* skip item */ }
    }
  }

  return NextResponse.json({ ok: true, order: shape(row), restocked });
}

// DELETE ?id= (employer) — remove an order record.
export async function DELETE(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (c.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });
  await sql`DELETE FROM orders WHERE id = ${id} AND team_id = ${c.teamId}`;
  return NextResponse.json({ ok: true });
}
