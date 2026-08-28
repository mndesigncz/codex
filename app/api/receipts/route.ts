// Receipts snapped on the go: a photo, who sold it, how much, and a note.
// The employer captures them in TO GO mode standing in the shop doorway;
// the details can be pushed into the stock later.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function employer() {
  const s = await getServerSession(authOptions);
  if (!s?.user) return null;
  const meId = parseInt((s.user as any).id);
  const [u] = await sql`SELECT id, role, team_id FROM users WHERE id = ${meId}`;
  if (!u || u.role !== 'employer' || !u.team_id) return null;
  return u;
}

export async function GET() {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  try {
    const rows = await sql`
      SELECT r.id, r.photo_url AS "photoUrl", r.supplier, r.amount, r.note, r.created_at AS "createdAt",
             us.name AS "authorName"
      FROM receipts r LEFT JOIN users us ON us.id = r.user_id
      WHERE r.team_id = ${u.team_id}
      ORDER BY r.created_at DESC LIMIT 100`;
    return NextResponse.json({ receipts: rows });
  } catch {
    return NextResponse.json({ receipts: [], error: 'Účtenky nejsou dostupné — spusť /api/init.' });
  }
}

export async function POST(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const photoUrl = b.photoUrl ? String(b.photoUrl).slice(0, 500) : null;
  const supplier = b.supplier ? String(b.supplier).trim().slice(0, 160) : null;
  const amount = b.amount === null || b.amount === undefined || b.amount === ''
    ? null : Math.max(0, Math.round(Number(b.amount)) || 0);
  const note = b.note ? String(b.note).trim().slice(0, 1000) : null;
  if (!photoUrl && !supplier && !amount && !note) {
    return NextResponse.json({ error: 'Účtenka je prázdná.' }, { status: 400 });
  }
  try {
    const [row] = await sql`
      INSERT INTO receipts (team_id, user_id, photo_url, supplier, amount, note)
      VALUES (${u.team_id}, ${u.id}, ${photoUrl}, ${supplier}, ${amount}, ${note})
      RETURNING id, photo_url AS "photoUrl", supplier, amount, note, created_at AS "createdAt"`;
    audit(u.team_id, u.id, 'receipt.add', 'receipt', row.id,
      `${supplier ?? 'Účtenka'}${amount ? ` · ${amount} Kč` : ''}`);
    return NextResponse.json({ ok: true, receipt: row });
  } catch {
    return NextResponse.json({ error: 'Účtenky nejsou dostupné — spusť /api/init.' }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const id = parseInt(b.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });
  const [row] = await sql`SELECT id, supplier, amount, note FROM receipts WHERE id = ${id} AND team_id = ${u.team_id}`;
  if (!row) return NextResponse.json({ error: 'Účtenka nenalezena' }, { status: 404 });
  const supplier = b.supplier !== undefined ? (b.supplier ? String(b.supplier).trim().slice(0, 160) : null) : row.supplier;
  const amount = b.amount !== undefined
    ? (b.amount === null || b.amount === '' ? null : Math.max(0, Math.round(Number(b.amount)) || 0))
    : row.amount;
  const note = b.note !== undefined ? (b.note ? String(b.note).trim().slice(0, 1000) : null) : row.note;
  await sql`UPDATE receipts SET supplier = ${supplier}, amount = ${amount}, note = ${note} WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });
  await sql`DELETE FROM receipts WHERE id = ${id} AND team_id = ${u.team_id}`;
  return NextResponse.json({ ok: true });
}
