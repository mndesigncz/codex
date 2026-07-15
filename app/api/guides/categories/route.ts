import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function ctx() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const meId = parseInt((session.user as any).id);
  const role = (session.user as any).role;
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  return { meId, role, teamId: u?.team_id ?? null };
}

// GET — list team's categories ordered by position
export async function GET() {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId) return NextResponse.json({ categories: [] });

  const categories = await sql`
    SELECT id, name, icon, position
    FROM guide_categories
    WHERE team_id = ${c.teamId}
    ORDER BY position ASC, created_at ASC`;

  return NextResponse.json({ categories });
}

// POST (employer) — create category
export async function POST(request: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (c.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  if (!c.teamId) return NextResponse.json({ error: 'Tým nenalezen' }, { status: 404 });

  const { name, icon } = await request.json();
  if (!name || !String(name).trim()) return NextResponse.json({ error: 'Název je povinný' }, { status: 400 });

  const [{ next } = { next: 0 }] = await sql`
    SELECT COALESCE(MAX(position), -1) + 1 AS next FROM guide_categories WHERE team_id = ${c.teamId}`;

  const [category] = await sql`
    INSERT INTO guide_categories (team_id, name, icon, position)
    VALUES (${c.teamId}, ${String(name).trim()}, ${icon || 'book'}, ${next})
    RETURNING id, name, icon, position`;

  return NextResponse.json({ category });
}
