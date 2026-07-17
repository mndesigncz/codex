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

// GET — cards created by members of my team (cards have no team_id; scope via creator).
export async function GET() {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId) return NextResponse.json([]);

  const cards = await sql`
    SELECT p.* FROM planning_cards p
    JOIN users u ON u.id = p.created_by
    WHERE u.team_id = ${c.teamId}
    ORDER BY p.position ASC, p.created_at ASC`;
  return NextResponse.json(cards);
}

// POST — create a card (any team member; board UI is employer-side).
export async function POST(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? '').trim();
  if (!title) return NextResponse.json({ error: 'Chybí název karty' }, { status: 400 });

  const [card] = await sql`
    INSERT INTO planning_cards (title, description, "column", position, created_by)
    VALUES (${title}, ${body.description ?? null}, ${body.column ?? 'ideas'}, ${body.position ?? 0}, ${c.meId})
    RETURNING *`;
  return NextResponse.json(card);
}
