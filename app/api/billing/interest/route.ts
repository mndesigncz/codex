// "Mám zájem o Pro" — records demand while real billing doesn't exist yet.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const meId = parseInt((session.user as any).id);
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  if (!u?.team_id) return NextResponse.json({ error: 'Bez týmu' }, { status: 400 });
  try {
    const [dup] = await sql`SELECT id FROM billing_interest WHERE team_id = ${u.team_id} AND user_id = ${meId}`;
    if (!dup) await sql`INSERT INTO billing_interest (team_id, user_id) VALUES (${u.team_id}, ${meId})`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Zatím nedostupné — spusť /api/init.' }, { status: 400 });
  }
}
