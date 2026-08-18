// Suppliers as entities: a name you order from, with a real e-mail address —
// so an order can leave the app instead of living in a copy-pasted note.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function me() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const id = parseInt((session.user as any).id);
  const [u] = await sql`SELECT id, role, team_id FROM users WHERE id = ${id}`;
  return u ?? null;
}

export async function GET() {
  const u = await me();
  if (!u?.team_id) return NextResponse.json({ suppliers: [] });
  try {
    const rows = await sql`
      SELECT id, name, email, phone, note FROM suppliers
      WHERE team_id = ${u.team_id} ORDER BY name ASC`;
    return NextResponse.json({ suppliers: rows });
  } catch { return NextResponse.json({ suppliers: [] }); }
}

export async function POST(req: NextRequest) {
  const u = await me();
  if (!u?.team_id) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (u.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? '').trim().slice(0, 120);
  if (!name) return NextResponse.json({ error: 'Název je povinný' }, { status: 400 });
  const email = b.email ? String(b.email).trim().slice(0, 200) || null : null;
  const phone = b.phone ? String(b.phone).trim().slice(0, 40) || null : null;
  const note = b.note ? String(b.note).trim().slice(0, 300) || null : null;
  try {
    const [row] = await sql`
      INSERT INTO suppliers (team_id, name, email, phone, note)
      VALUES (${u.team_id}, ${name}, ${email}, ${phone}, ${note}) RETURNING *`;
    audit(u.team_id, u.id, 'supplier.create', 'supplier', row.id, name);
    return NextResponse.json({ supplier: row });
  } catch { return NextResponse.json({ error: 'Dodavatelé nejsou dostupní — spusť /api/init.' }, { status: 400 }); }
}

export async function PATCH(req: NextRequest) {
  const u = await me();
  if (!u?.team_id || u.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const id = parseInt(b.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Chybí id' }, { status: 400 });
  try {
    if (b.name !== undefined) await sql`UPDATE suppliers SET name = ${String(b.name).trim().slice(0, 120)} WHERE id = ${id} AND team_id = ${u.team_id}`;
    if (b.email !== undefined) await sql`UPDATE suppliers SET email = ${b.email ? String(b.email).trim().slice(0, 200) : null} WHERE id = ${id} AND team_id = ${u.team_id}`;
    if (b.phone !== undefined) await sql`UPDATE suppliers SET phone = ${b.phone ? String(b.phone).trim().slice(0, 40) : null} WHERE id = ${id} AND team_id = ${u.team_id}`;
    if (b.note !== undefined) await sql`UPDATE suppliers SET note = ${b.note ? String(b.note).trim().slice(0, 300) : null} WHERE id = ${id} AND team_id = ${u.team_id}`;
    const [row] = await sql`SELECT * FROM suppliers WHERE id = ${id} AND team_id = ${u.team_id}`;
    if (!row) return NextResponse.json({ error: 'Dodavatel nenalezen' }, { status: 404 });
    return NextResponse.json({ supplier: row });
  } catch { return NextResponse.json({ error: 'Uložení se nepodařilo' }, { status: 500 }); }
}

export async function DELETE(req: NextRequest) {
  const u = await me();
  if (!u?.team_id || u.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Chybí id' }, { status: 400 });
  try {
    await sql`DELETE FROM suppliers WHERE id = ${id} AND team_id = ${u.team_id}`;
    try { await sql`UPDATE inventory_items SET supplier_id = NULL WHERE supplier_id = ${id} AND team_id = ${u.team_id}`; } catch {}
    audit(u.team_id, u.id, 'supplier.delete', 'supplier', id);
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: 'Smazání se nepodařilo' }, { status: 500 }); }
}
