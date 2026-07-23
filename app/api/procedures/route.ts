import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { sanitizeSteps } from '@/lib/steps';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// 'HH:MM' (24h) or null.
function parseRemindAt(v: any): string | null {
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null;
}

// Weekdays 0=Mon..6=Sun, de-duped and sorted; [] means "every day".
function parseRemindDays(v: any): number[] {
  if (!Array.isArray(v)) return [];
  return Array.from(
    new Set(v.map((n: any) => parseInt(n)).filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 6)),
  ).sort((a, b) => a - b);
}

async function currentUser() {
  const s = await getServerSession(authOptions);
  if (!s?.user) return null;
  const id = parseInt((s.user as any).id);
  const role = (s.user as any).role as string;
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${id}`;
  return { id, role, teamId: u?.team_id as number | null };
}

// GET: list the team's procedures
export async function GET() {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!me.teamId) return NextResponse.json({ procedures: [] });

  let procedures: any[];
  try {
    procedures = await sql`
      SELECT id, name, description, icon, color, items,
             remind_at AS "remindAt", remind_days AS "remindDays", remind_anchor AS "remindAnchor"
      FROM procedures WHERE team_id = ${me.teamId} ORDER BY created_at ASC`;
  } catch {
    procedures = await sql`
      SELECT id, name, description, icon, color, items,
             remind_at AS "remindAt", remind_days AS "remindDays"
      FROM procedures WHERE team_id = ${me.teamId} ORDER BY created_at ASC`;
  }

  // Does the current user work today? (kiosk = shared device, always yes.)
  const today = new Date().toISOString().split('T')[0];
  let hasShiftToday = me.role === 'kiosk';
  if (!hasShiftToday) {
    try {
      const [sh] = await sql`SELECT id FROM shifts WHERE employee_id = ${me.id} AND date = ${today} LIMIT 1`;
      hasShiftToday = !!sh;
    } catch { /* ignore */ }
  }

  // Today's opening hours (for open/close-anchored reminders).
  let openingToday: { open: string; close: string; closed: boolean } = { open: '08:00', close: '20:00', closed: false };
  try {
    const [team] = await sql`SELECT opening_hours FROM teams WHERE id = ${me.teamId}`;
    const oh = team?.opening_hours;
    const wd = String((new Date(today + 'T00:00:00').getDay() + 6) % 7);
    if (oh && oh[wd]) openingToday = oh[wd];
  } catch { /* ignore */ }

  return NextResponse.json({ procedures, hasShiftToday, openingToday });
}

// POST (employer): create a procedure
export async function POST(request: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (me.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  if (!me.teamId) return NextResponse.json({ error: 'Nejste členem žádného týmu' }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? '').trim();
  const description = body.description ? String(body.description).trim() : null;
  const icon = body.icon ? String(body.icon) : 'check';
  const color = body.color ? String(body.color) : 'lime';
  const items = sanitizeSteps(body.items);

  const remindAnchor = ['open', 'close', 'time'].includes(body.remindAnchor) ? body.remindAnchor : 'time';
  // For open/close anchors the fixed time is irrelevant.
  const remindAt = remindAnchor === 'time' ? parseRemindAt(body.remindAt) : null;
  const remindDays = parseRemindDays(body.remindDays);

  if (!name) return NextResponse.json({ error: 'Zadejte název postupu' }, { status: 400 });
  if (items.length === 0) return NextResponse.json({ error: 'Přidejte alespoň jeden krok' }, { status: 400 });

  let created: any;
  try {
    [created] = await sql`
      INSERT INTO procedures (team_id, name, description, icon, color, items, remind_at, remind_days, remind_anchor, created_by)
      VALUES (${me.teamId}, ${name}, ${description}, ${icon}, ${color}, ${JSON.stringify(items)}, ${remindAt}, ${JSON.stringify(remindDays)}, ${remindAnchor}, ${me.id})
      RETURNING id, name, description, icon, color, items, remind_at AS "remindAt", remind_days AS "remindDays", remind_anchor AS "remindAnchor"`;
  } catch {
    [created] = await sql`
      INSERT INTO procedures (team_id, name, description, icon, color, items, remind_at, remind_days, created_by)
      VALUES (${me.teamId}, ${name}, ${description}, ${icon}, ${color}, ${JSON.stringify(items)}, ${remindAt}, ${JSON.stringify(remindDays)}, ${me.id})
      RETURNING id, name, description, icon, color, items, remind_at AS "remindAt", remind_days AS "remindDays"`;
  }

  return NextResponse.json({ procedure: created });
}
