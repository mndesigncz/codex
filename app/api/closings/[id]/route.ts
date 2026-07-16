import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// DELETE — remove a closing. Author may delete their own; employer may delete any in the team.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const meId = parseInt((session.user as any).id);
  const role = (session.user as any).role as string;
  const id = parseInt(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });

  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  const teamId = u?.team_id;
  const [row] = await sql`SELECT created_by, team_id FROM cash_closings WHERE id = ${id}`;
  if (!row) return NextResponse.json({ error: 'Uzávěrka nenalezena' }, { status: 404 });

  const isOwnerOfTeam = role === 'employer' && row.team_id === teamId;
  const isAuthor = row.created_by === meId;
  if (!isOwnerOfTeam && !isAuthor) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  await sql`DELETE FROM cash_closings WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
