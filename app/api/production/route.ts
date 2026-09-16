import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { ensureProductionTasks, openProduction } from '@/lib/production';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// GET: co je právě k výrobě — srovná úkoly se skladem a vrátí je i s plánem.
// Dashboard směny, TO GO i kiosk čtou tohle jedno místo.
export async function GET() {
  const s = await getServerSession(authOptions);
  if (!s?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const meId = parseInt((s.user as any).id);
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  const teamId = u?.team_id as number | null;
  if (!teamId) return NextResponse.json({ toMake: [] });
  try { await ensureProductionTasks(teamId, null); } catch { /* před migrací */ }
  const toMake = await openProduction(teamId);
  return NextResponse.json({ toMake });
}
