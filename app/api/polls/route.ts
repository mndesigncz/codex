// Quick team polls: "kdy uděláme teambuilding?" without a message thread of
// forty '+1's. One vote per person, results visible live.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { notifyUsers } from '@/lib/push';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function me() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const id = parseInt((session.user as any).id);
  const [u] = await sql`SELECT id, role, team_id, name FROM users WHERE id = ${id}`;
  return u ?? null;
}

async function shapePolls(teamId: number, meId: number) {
  const polls = await sql`
    SELECT p.*, us.name AS author_name, us.avatar AS author_avatar
    FROM polls p LEFT JOIN users us ON us.id = p.created_by
    WHERE p.team_id = ${teamId} AND p.closed = FALSE
    ORDER BY p.created_at DESC LIMIT 5`;
  const out: any[] = [];
  for (const p of polls as any[]) {
    const votes = await sql`SELECT user_id, option_idx FROM poll_votes WHERE poll_id = ${p.id}`;
    const counts = (Array.isArray(p.options) ? p.options : []).map((_: any, i: number) =>
      (votes as any[]).filter(v => Number(v.option_idx) === i).length);
    out.push({
      id: p.id, question: p.question, options: p.options,
      authorName: p.author_name, authorAvatar: p.author_avatar,
      createdBy: p.created_by,
      counts, total: (votes as any[]).length,
      myVote: (votes as any[]).find(v => Number(v.user_id) === meId)?.option_idx ?? null,
    });
  }
  return out;
}

export async function GET() {
  const u = await me();
  if (!u?.team_id) return NextResponse.json({ polls: [] });
  try {
    return NextResponse.json({ polls: await shapePolls(u.team_id, u.id) });
  } catch { return NextResponse.json({ polls: [] }); }
}

export async function POST(req: NextRequest) {
  const u = await me();
  if (!u?.team_id) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (u.role === 'kiosk') return NextResponse.json({ error: 'Anketu zakládá osobní účet.' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const question = String(b.question ?? '').trim().slice(0, 200);
  const options = (Array.isArray(b.options) ? b.options : [])
    .map((o: any) => String(o ?? '').trim().slice(0, 80)).filter(Boolean).slice(0, 8);
  if (!question || options.length < 2) {
    return NextResponse.json({ error: 'Zadej otázku a aspoň dvě možnosti.' }, { status: 400 });
  }
  try {
    const [row] = await sql`
      INSERT INTO polls (team_id, question, options, created_by)
      VALUES (${u.team_id}, ${question}, ${JSON.stringify(options)}::jsonb, ${u.id})
      RETURNING id`;
    try {
      const members = await sql`
        SELECT id, role FROM users WHERE team_id = ${u.team_id} AND id <> ${u.id} AND role <> 'kiosk'`;
      const ees = (members as any[]).filter(m => m.role !== 'employer').map(m => m.id);
      const emp = (members as any[]).filter(m => m.role === 'employer').map(m => m.id);
      if (ees.length) await notifyUsers(ees, { title: '📊 Nová anketa', body: question, type: 'info', link: '/employee/chat' });
      if (emp.length) await notifyUsers(emp, { title: '📊 Nová anketa', body: question, type: 'info', link: '/employer/chat' });
    } catch { /* best-effort */ }
    return NextResponse.json({ ok: true, id: row.id });
  } catch { return NextResponse.json({ error: 'Ankety nejsou dostupné — spusť /api/init.' }, { status: 400 }); }
}

export async function PATCH(req: NextRequest) {
  const u = await me();
  if (!u?.team_id) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const id = parseInt(b.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Chybí id' }, { status: 400 });
  const [poll] = await sql`SELECT * FROM polls WHERE id = ${id} AND team_id = ${u.team_id}`;
  if (!poll) return NextResponse.json({ error: 'Anketa nenalezena' }, { status: 404 });

  if (b.close === true) {
    if (u.role !== 'employer' && poll.created_by !== u.id) {
      return NextResponse.json({ error: 'Zavřít může autor nebo vedení.' }, { status: 403 });
    }
    await sql`UPDATE polls SET closed = TRUE WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  }

  const idx = parseInt(b.vote);
  const optCount = Array.isArray(poll.options) ? poll.options.length : 0;
  if (!Number.isFinite(idx) || idx < 0 || idx >= optCount) {
    return NextResponse.json({ error: 'Neplatná volba' }, { status: 400 });
  }
  if (u.role === 'kiosk') return NextResponse.json({ error: 'Hlasuje se z osobního účtu.' }, { status: 403 });
  await sql`
    INSERT INTO poll_votes (poll_id, user_id, option_idx)
    VALUES (${id}, ${u.id}, ${idx})
    ON CONFLICT (poll_id, user_id) DO UPDATE SET option_idx = ${idx}`;
  return NextResponse.json({ ok: true });
}
