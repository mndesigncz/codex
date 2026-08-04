import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { normalizeExcluded } from '@/lib/share';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function employer() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const meId = parseInt((session.user as any).id);
  if ((session.user as any).role !== 'employer') return null;
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  return u?.team_id ? { meId, teamId: Number(u.team_id) } : null;
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const me = await employer();
  if (!me) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const id = parseInt(params.id);
  const b = await request.json();

  // Each field on its own so a partial edit doesn't clear the rest.
  if (b.title !== undefined) {
    const title = b.title ? String(b.title).trim().slice(0, 120) || null : null;
    await sql`UPDATE share_links SET title = ${title} WHERE id = ${id} AND team_id = ${me.teamId}`;
  }
  if (b.note !== undefined) {
    const note = b.note ? String(b.note).trim().slice(0, 500) || null : null;
    await sql`UPDATE share_links SET note = ${note} WHERE id = ${id} AND team_id = ${me.teamId}`;
  }
  if (b.excluded !== undefined) {
    await sql`
      UPDATE share_links SET excluded = ${JSON.stringify(normalizeExcluded(b.excluded))}::jsonb
      WHERE id = ${id} AND team_id = ${me.teamId}`;
  }
  if (b.enabled !== undefined) {
    await sql`UPDATE share_links SET enabled = ${b.enabled === true} WHERE id = ${id} AND team_id = ${me.teamId}`;
  }

  const [row] = await sql`SELECT * FROM share_links WHERE id = ${id} AND team_id = ${me.teamId}`;
  if (!row) return NextResponse.json({ error: 'Odkaz nenalezen' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const me = await employer();
  if (!me) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const id = parseInt(params.id);
  await sql`DELETE FROM share_links WHERE id = ${id} AND team_id = ${me.teamId}`;
  return NextResponse.json({ ok: true });
}
