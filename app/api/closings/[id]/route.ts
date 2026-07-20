import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { notifyUser } from '@/lib/push';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// PATCH — employer approves a pending closing.
export async function PATCH(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const meId = parseInt((session.user as any).id);
  const role = (session.user as any).role as string;
  if (role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const id = parseInt(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });

  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  const [row] = await sql`SELECT created_by, team_id FROM cash_closings WHERE id = ${id}`;
  if (!row || row.team_id !== u?.team_id) return NextResponse.json({ error: 'Uzávěrka nenalezena' }, { status: 404 });

  try {
    await sql`UPDATE cash_closings SET approved = TRUE, approved_by = ${meId} WHERE id = ${id}`;
  } catch {
    return NextResponse.json({ error: 'Schválení není dostupné (chybí migrace).' }, { status: 400 });
  }
  try {
    await notifyUser(row.created_by, { title: 'Uzávěrka schválena ✓', body: 'Vedení schválilo tvou uzávěrku.', type: 'info' });
  } catch { /* best-effort */ }
  return NextResponse.json({ ok: true });
}

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
