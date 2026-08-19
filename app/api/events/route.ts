// Events API. Everyone on the team sees events; the employer manages them.
// Crew assignment creates real shifts (shifts.event_id) so the schedule, the
// closing logic and "Moje směny" all see the event without special cases.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { notifyUsers } from '@/lib/push';
import { audit } from '@/lib/audit';
import { normalizeChecklist, normalizePacking, normalizeCrew } from '@/lib/events';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function me() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const id = parseInt((session.user as any).id);
  const [u] = await sql`SELECT id, role, team_id, name FROM users WHERE id = ${id}`;
  return u ?? null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function shape(r: any, people: Map<number, any>) {
  const crew = normalizeCrew(r.crew);
  return {
    id: r.id, title: r.title, description: r.description ?? null,
    kind: r.kind ?? 'other', date: r.date,
    startTime: r.start_time ?? null, endTime: r.end_time ?? null,
    location: r.location ?? null, offsite: r.offsite === true,
    status: r.status ?? 'planned', public: r.public === true,
    capacity: r.capacity ?? null,
    checklist: normalizeChecklist(r.checklist),
    packing: normalizePacking(r.packing),
    crew,
    crewPeople: crew.map(id => people.get(id) ?? { id, name: 'Neznámý', avatar: '👤' }),
    revenue: r.revenue ?? null, costs: r.costs ?? null,
    notes: r.notes ?? null, createdBy: r.created_by ?? null,
  };
}

async function teamPeople(teamId: number) {
  const rows = await sql`SELECT id, name, avatar FROM users WHERE team_id = ${teamId} AND role <> 'kiosk'`;
  return new Map((rows as any[]).map(r => [Number(r.id), { id: Number(r.id), name: r.name, avatar: r.avatar ?? '👤' }]));
}

export async function GET() {
  const u = await me();
  if (!u?.team_id) return NextResponse.json({ events: [] });
  try {
    const rows = await sql`
      SELECT * FROM events WHERE team_id = ${u.team_id}
      ORDER BY date DESC, start_time ASC NULLS LAST LIMIT 100`;
    const people = await teamPeople(u.team_id);
    return NextResponse.json({ events: (rows as any[]).map(r => shape(r, people)), isEmployer: u.role === 'employer' });
  } catch {
    return NextResponse.json({ events: [], notMigrated: true });
  }
}

export async function POST(req: NextRequest) {
  const u = await me();
  if (!u?.team_id) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (u.role !== 'employer') return NextResponse.json({ error: 'Akce zakládá vedení.' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const title = String(b.title ?? '').trim().slice(0, 160);
  const date = String(b.date ?? '');
  if (!title || !DATE_RE.test(date)) return NextResponse.json({ error: 'Zadej název a datum.' }, { status: 400 });
  const startTime = TIME_RE.test(String(b.startTime)) ? b.startTime : null;
  const endTime = TIME_RE.test(String(b.endTime)) ? b.endTime : null;
  try {
    const [row] = await sql`
      INSERT INTO events (team_id, title, description, kind, date, start_time, end_time, location, offsite, capacity, notes, created_by)
      VALUES (${u.team_id}, ${title}, ${b.description ? String(b.description).trim().slice(0, 2000) : null},
              ${String(b.kind ?? 'other').slice(0, 20)}, ${date}, ${startTime}, ${endTime},
              ${b.location ? String(b.location).trim().slice(0, 300) : null}, ${b.offsite === true},
              ${Number.isFinite(parseInt(b.capacity)) ? parseInt(b.capacity) : null},
              ${b.notes ? String(b.notes).trim().slice(0, 1000) : null}, ${u.id})
      RETURNING *`;
    audit(u.team_id, u.id, 'event.create', 'event', row.id, `${title} · ${date}`);
    const people = await teamPeople(u.team_id);
    return NextResponse.json({ event: shape(row, people) });
  } catch {
    return NextResponse.json({ error: 'Akce nejsou dostupné — spusť /api/init.' }, { status: 400 });
  }
}
