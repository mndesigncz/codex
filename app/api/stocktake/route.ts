// Stocktake (inventura): freeze a snapshot of the stock, count it item by
// item, then write the differences back in one confirmed step.
//
// data: [{ itemId, name, category, unit, expected, counted|null }]

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function me() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const id = parseInt((session.user as any).id);
  const [u] = await sql`SELECT id, role, team_id FROM users WHERE id = ${id}`;
  return u ?? null;
}

const shape = (r: any) => ({
  id: r.id, status: r.status, data: Array.isArray(r.data) ? r.data : [],
  createdAt: r.created_at, completedAt: r.completed_at ?? null,
});

export async function GET() {
  const u = await me();
  if (!u?.team_id) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  try {
    const [open] = await sql`
      SELECT * FROM stocktakes WHERE team_id = ${u.team_id} AND status = 'open'
      ORDER BY created_at DESC LIMIT 1`;
    const history = await sql`
      SELECT * FROM stocktakes WHERE team_id = ${u.team_id} AND status = 'done'
      ORDER BY completed_at DESC LIMIT 10`;
    return NextResponse.json({
      open: open ? shape(open) : null,
      history: (history as any[]).map(shape),
    });
  } catch {
    return NextResponse.json({ open: null, history: [], notMigrated: true });
  }
}

// Start a new stocktake (employer). Snapshot = active, approved items.
export async function POST() {
  const u = await me();
  if (!u?.team_id) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (u.role !== 'employer') return NextResponse.json({ error: 'Inventuru zahajuje vedení.' }, { status: 403 });
  try {
    const [existing] = await sql`
      SELECT id FROM stocktakes WHERE team_id = ${u.team_id} AND status = 'open' LIMIT 1`;
    if (existing) return NextResponse.json({ error: 'Jedna inventura už běží — dokončete ji nebo zrušte.' }, { status: 409 });

    let items: any[];
    try {
      items = await sql`
        SELECT id, name, category, quantity, unit FROM inventory_items
        WHERE team_id = ${u.team_id} AND archived IS NOT TRUE AND (approved IS DISTINCT FROM FALSE)
        ORDER BY category ASC NULLS LAST, name ASC`;
    } catch {
      items = await sql`
        SELECT id, name, category, quantity, unit FROM inventory_items
        WHERE team_id = ${u.team_id}
        ORDER BY name ASC`;
    }
    const data = (items as any[]).map(i => ({
      itemId: Number(i.id), name: String(i.name), category: i.category ?? null,
      unit: i.unit ?? 'ks', expected: Number(i.quantity) || 0, counted: null,
    }));
    if (data.length === 0) return NextResponse.json({ error: 'Ve skladu nejsou žádné aktivní položky.' }, { status: 400 });
    const [row] = await sql`
      INSERT INTO stocktakes (team_id, created_by, status, data)
      VALUES (${u.team_id}, ${u.id}, 'open', ${JSON.stringify(data)}::jsonb)
      RETURNING *`;
    return NextResponse.json({ open: shape(row) });
  } catch {
    return NextResponse.json({ error: 'Inventura není dostupná — spusť /api/init.' }, { status: 400 });
  }
}

// Update counts (anyone on the team), complete or cancel (employer).
export async function PATCH(req: NextRequest) {
  const u = await me();
  if (!u?.team_id) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const id = parseInt(b.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Chybí id' }, { status: 400 });

  const [row] = await sql`SELECT * FROM stocktakes WHERE id = ${id} AND team_id = ${u.team_id}`;
  if (!row) return NextResponse.json({ error: 'Inventura nenalezena' }, { status: 404 });
  if (row.status !== 'open') return NextResponse.json({ error: 'Inventura už je uzavřená.' }, { status: 400 });
  const data: any[] = Array.isArray(row.data) ? row.data : [];

  if (b.cancel === true) {
    if (u.role !== 'employer') return NextResponse.json({ error: 'Zrušit může jen vedení.' }, { status: 403 });
    await sql`DELETE FROM stocktakes WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  }

  if (b.counts && typeof b.counts === 'object') {
    const next = data.map(d => {
      const v = (b.counts as any)[String(d.itemId)];
      if (v === undefined) return d;
      const n = v === null || v === '' ? null : Math.max(0, Math.round(Number(v)));
      return { ...d, counted: n != null && Number.isFinite(n) ? n : null };
    });
    await sql`UPDATE stocktakes SET data = ${JSON.stringify(next)}::jsonb WHERE id = ${id}`;
    if (b.complete !== true) return NextResponse.json({ ok: true });
    row.data = next;
  }

  if (b.complete === true) {
    if (u.role !== 'employer') return NextResponse.json({ error: 'Dokončit může jen vedení.' }, { status: 403 });
    const final: any[] = Array.isArray(row.data) ? row.data : data;
    let applied = 0, diffs = 0;
    for (const d of final) {
      if (d.counted == null) continue;
      applied++;
      if (Number(d.counted) === Number(d.expected)) continue;
      diffs++;
      try {
        const [cur] = await sql`SELECT quantity FROM inventory_items WHERE id = ${d.itemId} AND team_id = ${u.team_id}`;
        if (!cur) continue;
        await sql`
          UPDATE inventory_items SET quantity = ${d.counted}, updated_by = ${u.id}, updated_at = NOW()
          WHERE id = ${d.itemId} AND team_id = ${u.team_id}`;
        try {
          await sql`
            INSERT INTO inventory_log (item_id, user_id, old_quantity, new_quantity, note, created_at)
            VALUES (${d.itemId}, ${u.id}, ${Number(cur.quantity) || 0}, ${d.counted}, ${'Inventura #' + id}, NOW())`;
        } catch { /* log is best-effort */ }
      } catch { /* keep going — one broken item must not kill the stocktake */ }
    }
    const [done] = await sql`
      UPDATE stocktakes SET status = 'done', completed_at = NOW() WHERE id = ${id} RETURNING *`;
    return NextResponse.json({ ok: true, applied, diffs, stocktake: shape(done) });
  }

  return NextResponse.json({ ok: true });
}
