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

function excerpt(content: string) {
  const flat = String(content || '').replace(/\s+/g, ' ').trim();
  return flat.length > 120 ? flat.slice(0, 120).trimEnd() + '…' : flat;
}

// GET — list team's guides (optionally ?categoryId=)
export async function GET(request: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId) return NextResponse.json({ guides: [] });

  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get('categoryId');

  const rows = categoryId
    ? await sql`
        SELECT id, title, category_id, content, updated_at
        FROM guides
        WHERE team_id = ${c.teamId} AND category_id = ${parseInt(categoryId)}
        ORDER BY updated_at DESC`
    : await sql`
        SELECT id, title, category_id, content, updated_at
        FROM guides
        WHERE team_id = ${c.teamId}
        ORDER BY updated_at DESC`;

  const guides = rows.map((g: any) => ({
    id: g.id,
    title: g.title,
    categoryId: g.category_id,
    updatedAt: g.updated_at,
    excerpt: excerpt(g.content),
  }));

  return NextResponse.json({ guides });
}

// POST (employer) — create guide
export async function POST(request: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (c.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  if (!c.teamId) return NextResponse.json({ error: 'Tým nenalezen' }, { status: 404 });

  const { title, content, categoryId } = await request.json();
  if (!title || !String(title).trim()) return NextResponse.json({ error: 'Název je povinný' }, { status: 400 });

  const [guide] = await sql`
    INSERT INTO guides (team_id, category_id, title, content, created_by, updated_at)
    VALUES (
      ${c.teamId},
      ${categoryId ? parseInt(categoryId) : null},
      ${String(title).trim()},
      ${content || ''},
      ${c.meId},
      NOW()
    )
    RETURNING id, title, category_id, content, updated_at`;

  return NextResponse.json({
    guide: {
      id: guide.id,
      title: guide.title,
      categoryId: guide.category_id,
      updatedAt: guide.updated_at,
      excerpt: excerpt(guide.content),
    },
  });
}
