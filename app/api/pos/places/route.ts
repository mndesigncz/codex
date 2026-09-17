// Provozovny (places) merchanta ve Storyous. Jeden podnik jich může mít víc —
// třeba stálou provozovnu a mobilní stánek. Výjezdová akce si pak přiřadí svoji
// kasu a tržby dvou provozoven se nemíchají.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { getConnection, merchantInfo } from '@/lib/storyous';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const meId = parseInt((session.user as any).id);
  const [u] = await sql`SELECT role, team_id FROM users WHERE id = ${meId}`;
  if (!u?.team_id || u.role !== 'employer') return NextResponse.json({ error: 'Jen pro vedení.' }, { status: 403 });
  const conn = await getConnection(u.team_id);
  if (!conn) return NextResponse.json({ places: [], current: null });
  try {
    const m = await merchantInfo(conn);
    return NextResponse.json({
      places: (m.places ?? []).map(p => ({ placeId: p.placeId, name: p.name })),
      current: conn.placeId,
    });
  } catch {
    return NextResponse.json({ places: [], current: conn.placeId });
  }
}
