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
  const teamId = u?.team_id ?? null;
  return { meId, role, teamId };
}

// GET: list the team's custom categories ordered by position.
export async function GET() {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });

  const rows = await sql`
    SELECT id, name, position
    FROM inventory_categories
    WHERE team_id = ${me.teamId}
    ORDER BY position ASC, name ASC`;

  return NextResponse.json(rows);
}

// POST (employer): create a new custom category.
export async function POST(request: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (me.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const body = await request.json();
  const name = (body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Název kategorie je povinný' }, { status: 400 });

  const [existing] = await sql`
    SELECT id FROM inventory_categories
    WHERE team_id = ${me.teamId} AND lower(name) = lower(${name})`;
  if (existing) return NextResponse.json({ ok: true, id: existing.id });

  const [{ next }] = await sql`
    SELECT COALESCE(MAX(position), -1) + 1 AS next
    FROM inventory_categories WHERE team_id = ${me.teamId}`;

  const [row] = await sql`
    INSERT INTO inventory_categories (team_id, name, position)
    VALUES (${me.teamId}, ${name}, ${next})
    RETURNING id`;

  return NextResponse.json({ ok: true, id: row.id });
}
