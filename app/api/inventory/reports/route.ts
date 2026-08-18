// "Nahlásit chybějící položky" — the list an employee sends to the employer.
//
// The author comes from the session; taking it from the request body would let
// a report be filed under a colleague's name.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { notifyUsers } from '@/lib/push';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function me() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const id = parseInt((session.user as any).id);
  const [u] = await sql`SELECT id, role, team_id FROM users WHERE id = ${id}`;
  return u ?? null;
}

// Employer: reports from their own team, newest first. This is the missing
// other half of the feature — without it every report vanished into the table.
export async function GET() {
  const u = await me();
  if (!u) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (u.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  try {
    const rows = await sql`
      SELECT r.*, us.name AS author_name, us.avatar AS author_avatar
      FROM inventory_reports r
      JOIN users us ON us.id = r.reported_by
      WHERE us.team_id = ${u.team_id}
      ORDER BY r.created_at DESC
      LIMIT 50`;
    return NextResponse.json({ reports: rows });
  } catch {
    return NextResponse.json({ reports: [] });
  }
}

export async function POST(req: NextRequest) {
  const u = await me();
  if (!u) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });

  try {
    const body = await req.json();
    const items = typeof body.items === 'string' ? body.items : JSON.stringify(body.items ?? []);
    const note = body.note ? String(body.note).trim().slice(0, 1000) || null : null;

    const [row] = await sql`
      INSERT INTO inventory_reports (reported_by, items, note, status)
      VALUES (${u.id}, ${items}, ${note}, 'new')
      RETURNING *`;

    // The report is FOR the employers — tell them it exists.
    try {
      const employers = await sql`
        SELECT id FROM users WHERE team_id = ${u.team_id} AND role = 'employer' AND id <> ${u.id}`;
      let count = 0;
      try { count = JSON.parse(items)?.length ?? 0; } catch {}
      const [author] = await sql`SELECT name FROM users WHERE id = ${u.id}`;
      await notifyUsers((employers as any[]).map(e => e.id), {
        title: '📦 Hlášení ze skladu',
        body: `${author?.name ?? 'Zaměstnanec'} hlásí ${count || 'chybějící'} položky k doplnění.`,
        type: 'warning',
        category: 'stock',
        link: '/employer/inventory',
      });
    } catch { /* notification is best-effort */ }

    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: 'Hlášení se nepodařilo vytvořit' }, { status: 500 });
  }
}

// Employer marks a report handled (or reopens it).
export async function PATCH(req: NextRequest) {
  const u = await me();
  if (!u) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (u.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  try {
    const body = await req.json();
    const id = parseInt(body.id);
    const status = body.status === 'done' ? 'done' : 'new';
    if (!Number.isFinite(id)) return NextResponse.json({ error: 'Chybí id' }, { status: 400 });
    const [row] = await sql`
      UPDATE inventory_reports SET status = ${status}
      WHERE id = ${id} AND reported_by IN (SELECT id FROM users WHERE team_id = ${u.team_id})
      RETURNING *`;
    if (!row) return NextResponse.json({ error: 'Hlášení nenalezeno' }, { status: 404 });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: 'Uložení se nepodařilo' }, { status: 500 });
  }
}
