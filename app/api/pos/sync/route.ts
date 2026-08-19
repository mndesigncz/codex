// Sales → stock write-off, on demand (employer). The engine lives in
// lib/posSync so the digest cron can reuse it.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { runPosSync } from '@/lib/posSync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const sql = neon(process.env.DATABASE_URL!);

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const meId = parseInt((session.user as any).id);
  const [u] = await sql`SELECT id, role, team_id FROM users WHERE id = ${meId}`;
  if (!u?.team_id || u.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const force = (await req.json().catch(() => ({})))?.force === true;
  try {
    const r = await runPosSync(u.team_id, u.id, force);
    return NextResponse.json(r);
  } catch {
    return NextResponse.json({ error: 'Synchronizace selhala — zkus to za chvíli.' }, { status: 502 });
  }
}
