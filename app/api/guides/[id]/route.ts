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

// Parse a stored checklist (JSONB may arrive as array or string) into string[].
function parseChecklist(raw: any): string[] {
  let arr: any = raw;
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      arr = [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr.map((s) => String(s ?? '')).filter((s) => s.trim().length > 0);
}

// Normalize an incoming checklist into a clean string[] of step texts.
function normalizeChecklist(input: any): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((s) => String(s ?? '').trim())
    .filter((s) => s.length > 0)
    .slice(0, 100);
}

// GET — single guide full content (team members only)
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });

  const id = parseInt(params.id);
  const [g] = await sql`
    SELECT g.id, g.title, g.content, g.checklist, g.category_id, g.updated_at, g.created_at, u.name AS author
    FROM guides g
    LEFT JOIN users u ON u.id = g.created_by
    WHERE g.id = ${id} AND g.team_id = ${c.teamId}`;

  if (!g) return NextResponse.json({ error: 'Návod nenalezen' }, { status: 404 });

  return NextResponse.json({
    guide: {
      id: g.id,
      title: g.title,
      content: g.content,
      checklist: parseChecklist(g.checklist),
      categoryId: g.category_id,
      updatedAt: g.updated_at,
      createdAt: g.created_at,
      author: g.author,
    },
  });
}

// PATCH (employer) — update title/content/category, bump updated_at
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (c.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const id = parseInt(params.id);
  const [existing] = await sql`SELECT id, category_id FROM guides WHERE id = ${id} AND team_id = ${c.teamId}`;
  if (!existing) return NextResponse.json({ error: 'Návod nenalezen' }, { status: 404 });

  const body = await request.json();
  const { title, content, categoryId, checklist } = body;

  const nextTitle = title !== undefined && String(title).trim() ? String(title).trim() : null;
  const nextContent = content !== undefined ? content : null;
  // categoryId: explicit null clears; a value sets; undefined keeps existing.
  const nextCategory =
    categoryId === undefined
      ? existing.category_id
      : categoryId === null || categoryId === ''
      ? null
      : parseInt(categoryId);
  // checklist: undefined keeps existing; anything else is normalized (empty array clears).
  const nextChecklist = checklist === undefined ? null : JSON.stringify(normalizeChecklist(checklist));

  const [g] = await sql`
    UPDATE guides SET
      title = COALESCE(${nextTitle}, title),
      content = COALESCE(${nextContent}, content),
      category_id = ${nextCategory},
      checklist = COALESCE(${nextChecklist}::jsonb, checklist),
      updated_at = NOW()
    WHERE id = ${id} AND team_id = ${c.teamId}
    RETURNING id, title, content, checklist, category_id, updated_at`;

  return NextResponse.json({
    guide: {
      id: g.id,
      title: g.title,
      content: g.content,
      checklist: parseChecklist(g.checklist),
      categoryId: g.category_id,
      updatedAt: g.updated_at,
    },
  });
}

// DELETE (employer)
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (c.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const id = parseInt(params.id);
  const [existing] = await sql`SELECT id FROM guides WHERE id = ${id} AND team_id = ${c.teamId}`;
  if (!existing) return NextResponse.json({ error: 'Návod nenalezen' }, { status: 404 });

  await sql`DELETE FROM guides WHERE id = ${id} AND team_id = ${c.teamId}`;
  return NextResponse.json({ ok: true });
}
