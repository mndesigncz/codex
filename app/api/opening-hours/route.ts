import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function context() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const meId = parseInt((session.user as any).id);
  const role = (session.user as any).role as string;
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  return { meId, role, teamId: u?.team_id as number | undefined };
}

// Default: open 08:00–20:00 all week
function defaults() {
  const oh: Record<string, { open: string; close: string; closed: boolean }> = {};
  for (let d = 0; d <= 6; d++) oh[String(d)] = { open: '08:00', close: '20:00', closed: false };
  return oh;
}

// GET — team opening_hours (JSONB) keyed by weekday 0=Mon..6=Sun
export async function GET() {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!ctx.teamId) return NextResponse.json({ openingHours: defaults() });

  const [team] = await sql`SELECT opening_hours FROM teams WHERE id = ${ctx.teamId}`;
  const openingHours = team?.opening_hours && Object.keys(team.opening_hours).length > 0 ? team.opening_hours : defaults();
  return NextResponse.json({ openingHours });
}

// PUT (employer) — save whole opening_hours object
export async function PUT(req: Request) {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (ctx.role !== 'employer') return NextResponse.json({ error: 'Pouze pro zaměstnavatele' }, { status: 403 });
  if (!ctx.teamId) return NextResponse.json({ error: 'Bez týmu' }, { status: 400 });

  const body = await req.json();
  const raw = body.openingHours ?? body;

  // Normalize to 0..6 keys with open/close/closed
  const clean: Record<string, { open: string; close: string; closed: boolean }> = {};
  for (let d = 0; d <= 6; d++) {
    const key = String(d);
    const v = raw?.[key] ?? {};
    clean[key] = {
      open: /^\d{2}:\d{2}$/.test(v.open) ? v.open : '08:00',
      close: /^\d{2}:\d{2}$/.test(v.close) ? v.close : '20:00',
      closed: !!v.closed,
    };
  }

  await sql`UPDATE teams SET opening_hours = ${JSON.stringify(clean)} WHERE id = ${ctx.teamId}`;
  return NextResponse.json({ ok: true, openingHours: clean });
}
