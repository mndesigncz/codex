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

// PATCH (employer) — rename / reorder
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (c.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const id = parseInt(params.id);
  const body = await request.json();
  const { name, icon, position } = body;

  const [existing] = await sql`SELECT id FROM guide_categories WHERE id = ${id} AND team_id = ${c.teamId}`;
  if (!existing) return NextResponse.json({ error: 'Kategorie nenalezena' }, { status: 404 });

  const nextName = name !== undefined && String(name).trim() ? String(name).trim() : null;
  const nextIcon = icon !== undefined ? icon : null;
  const nextPos = position !== undefined ? position : null;

  const [category] = await sql`
    UPDATE guide_categories SET
      name = COALESCE(${nextName}, name),
      icon = COALESCE(${nextIcon}, icon),
      position = COALESCE(${nextPos}, position)
    WHERE id = ${id} AND team_id = ${c.teamId}
    RETURNING id, name, icon, position`;

  return NextResponse.json({ category });
}

// DELETE (employer) — remove category, keep guides (null out category_id)
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (c.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const id = parseInt(params.id);
  const [existing] = await sql`SELECT id FROM guide_categories WHERE id = ${id} AND team_id = ${c.teamId}`;
  if (!existing) return NextResponse.json({ error: 'Kategorie nenalezena' }, { status: 404 });

  await sql`UPDATE guides SET category_id = NULL WHERE category_id = ${id} AND team_id = ${c.teamId}`;
  await sql`DELETE FROM guide_categories WHERE id = ${id} AND team_id = ${c.teamId}`;

  return NextResponse.json({ ok: true });
}
