// Events API. Everyone on the team sees events; the employer manages them.
// Crew assignment creates real shifts (shifts.event_id) so the schedule, the
// closing logic and "Moje směny" all see the event without special cases.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { notifyUsers } from '@/lib/push';
import { audit } from '@/lib/audit';
import { normalizeChecklist, normalizePacking, normalizeCrew, normalizeEventMenu, normalizePhotos, resolveEventMenu } from '@/lib/events';

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

function shape(r: any, people: Map<number, any>, extra?: { onShift?: any[]; closings?: { n: number; total: number }; followers?: number; going?: number; menuById?: Map<number, { name: string; price: number | null }> }) {
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
    photos: normalizePhotos(r.photos),
    menu: resolveEventMenu(normalizeEventMenu(r.menu), extra?.menuById ?? new Map()),
    crew,
    crewPeople: crew.map(id => people.get(id) ?? { id, name: 'Neznámý', avatar: '👤' }),
    // U akce v podniku je základ obsluhy ten, kdo má ten den běžnou směnu.
    onShift: extra?.onShift ?? [],
    closingsCount: extra?.closings?.n ?? 0,
    closingsTotal: extra?.closings?.total ?? 0,
    followers: extra?.followers ?? 0,
    going: extra?.going ?? 0,
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
    const ids = (rows as any[]).map(r => Number(r.id));
    const dates = Array.from(new Set((rows as any[]).map(r => String(r.date))));
    // Tři skupinové dotazy vedle sebe — kdo je ty dny na běžné směně (základ
    // obsluhy akce v podniku), kolik uzávěrek se k akcím váže a kolik hostů
    // akce sleduje / přijde. Po jednom na akci by to bylo 3×100 dotazů.
    const menuIds = Array.from(new Set((rows as any[]).flatMap(r => normalizeEventMenu(r.menu).map(l => l.itemId).filter((x): x is number => x != null))));
    const [people, shiftRows, closingRows, followRows, menuRows] = await Promise.all([
      teamPeople(u.team_id),
      dates.length ? sql`
        SELECT s.date, s.start_time, s.end_time, us.id, us.name, us.avatar
        FROM shifts s JOIN users us ON us.id = s.employee_id
        WHERE s.team_id = ${u.team_id} AND s.date = ANY(${dates}) AND s.event_id IS NULL
        ORDER BY s.start_time` : Promise.resolve([] as any[]),
      ids.length ? sql`
        SELECT event_id, COUNT(*)::int AS n, COALESCE(SUM(cash_revenue + card_revenue), 0)::int AS total
        FROM cash_closings WHERE team_id = ${u.team_id} AND event_id = ANY(${ids})
        GROUP BY event_id` : Promise.resolve([] as any[]),
      ids.length ? sql`
        SELECT event_id, COUNT(*)::int AS followers, COUNT(*) FILTER (WHERE going)::int AS going
        FROM client_event_follows WHERE event_id = ANY(${ids})
        GROUP BY event_id`.catch(() => [] as any[]) : Promise.resolve([] as any[]),
      menuIds.length ? sql`SELECT id, name, price FROM menu_items WHERE id = ANY(${menuIds})` : Promise.resolve([] as any[]),
    ]);
    const menuById = new Map((menuRows as any[]).map(r => [Number(r.id), { name: String(r.name), price: r.price == null ? null : Number(r.price) }]));
    const byDate = new Map<string, any[]>();
    for (const r of shiftRows as any[]) {
      const k = String(r.date);
      if (!byDate.has(k)) byDate.set(k, []);
      const arr = byDate.get(k)!;
      if (!arr.some(x => x.id === Number(r.id))) arr.push({ id: Number(r.id), name: r.name, avatar: r.avatar ?? '👤', start: r.start_time, end: r.end_time });
    }
    const closingsBy = new Map((closingRows as any[]).map(r => [Number(r.event_id), { n: Number(r.n) || 0, total: Number(r.total) || 0 }]));
    const followsBy = new Map((followRows as any[]).map(r => [Number(r.event_id), { followers: Number(r.followers) || 0, going: Number(r.going) || 0 }]));
    return NextResponse.json({
      events: (rows as any[]).map(r => shape(r, people, {
        onShift: byDate.get(String(r.date)) ?? [],
        closings: closingsBy.get(Number(r.id)),
        followers: followsBy.get(Number(r.id))?.followers,
        going: followsBy.get(Number(r.id))?.going,
        menuById,
      })),
      isEmployer: u.role === 'employer',
    });
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
      INSERT INTO events (team_id, title, description, kind, date, start_time, end_time, location, offsite, capacity, notes, created_by, public)
      VALUES (${u.team_id}, ${title}, ${b.description ? String(b.description).trim().slice(0, 2000) : null},
              ${String(b.kind ?? 'other').slice(0, 20)}, ${date}, ${startTime}, ${endTime},
              ${b.location ? String(b.location).trim().slice(0, 300) : null}, ${b.offsite === true},
              ${Number.isFinite(parseInt(b.capacity)) ? parseInt(b.capacity) : null},
              ${b.notes ? String(b.notes).trim().slice(0, 1000) : null}, ${u.id}, ${b.public === true})
      RETURNING *`;
    audit(u.team_id, u.id, 'event.create', 'event', row.id, `${title} · ${date}`);
    const people = await teamPeople(u.team_id);
    return NextResponse.json({ event: shape(row, people) });
  } catch {
    return NextResponse.json({ error: 'Akce nejsou dostupné — spusť /api/init.' }, { status: 400 });
  }
}
