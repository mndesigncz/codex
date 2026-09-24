// Quick team polls: "kdy uděláme teambuilding?" without a message thread of
// forty '+1's. One vote per person, results visible live.

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { notifyUsers } from '@/lib/push';
import { clenovePodniku } from '@/lib/tenant';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// Ankety patří k týmovému chatu (chat.pouzivat). Zakládat a hlasovat smí jen
// osobní účet — `kiosk` je typ účtu, ne oprávnění: sdílený tablet by hlasoval
// za kohokoli, kdo u něj zrovna stojí.
async function me() {
  const c = await pozaduj('chat.pouzivat');
  if (jeOdpoved(c)) return c;
  return { id: c.meId, team_id: c.teamId, kiosk: c.role.typ === 'kiosk', opr: c.role.opravneni };
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
  if (jeOdpoved(u)) return u;
  try {
    return NextResponse.json({ polls: await shapePolls(u.team_id, u.id) });
  } catch { return NextResponse.json({ polls: [] }); }
}

export async function POST(req: NextRequest) {
  const u = await me();
  if (jeOdpoved(u)) return u;
  if (u.kiosk) return NextResponse.json({ error: 'Anketu zakládá osobní účet.' }, { status: 403 });
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
      // Kolo 62: příjemci podle členství; role (odkaz v push) z TOHOTO podniku.
      // Typ účtu tu určuje jen odkaz do správného rozhraní.
      const members = await clenovePodniku(u.team_id, { role: 'lide', krome: u.id });
      const ees = members.filter(m => m.role !== 'employer').map(m => m.id);
      const emp = members.filter(m => m.role === 'employer').map(m => m.id);
      if (ees.length) await notifyUsers(ees, { title: '📊 Nová anketa', body: question, type: 'info', link: '/employee/chat' });
      if (emp.length) await notifyUsers(emp, { title: '📊 Nová anketa', body: question, type: 'info', link: '/employer/chat' });
    } catch { /* best-effort */ }
    return NextResponse.json({ ok: true, id: row.id });
  } catch { return NextResponse.json({ error: 'Ankety nejsou dostupné — spusť /api/init.' }, { status: 400 }); }
}

export async function PATCH(req: NextRequest) {
  const u = await me();
  if (jeOdpoved(u)) return u;
  const b = await req.json().catch(() => ({}));
  const id = parseInt(b.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Chybí id' }, { status: 400 });
  const [poll] = await sql`SELECT * FROM polls WHERE id = ${id} AND team_id = ${u.team_id}`;
  if (!poll) return NextResponse.json({ error: 'Anketa nenalezena' }, { status: 404 });

  if (b.close === true) {
    // Vlastní anketu zavře autor, cizí ten, kdo spravuje oznámení a ankety.
    if (!u.opr.has('oznameni.spravovat') && Number(poll.created_by) !== u.id) {
      return NextResponse.json({ error: 'Zavřít může autor nebo ten, kdo spravuje ankety.' }, { status: 403 });
    }
    await sql`UPDATE polls SET closed = TRUE WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  }

  const idx = parseInt(b.vote);
  const optCount = Array.isArray(poll.options) ? poll.options.length : 0;
  if (!Number.isFinite(idx) || idx < 0 || idx >= optCount) {
    return NextResponse.json({ error: 'Neplatná volba' }, { status: 400 });
  }
  if (u.kiosk) return NextResponse.json({ error: 'Hlasuje se z osobního účtu.' }, { status: 403 });
  await sql`
    INSERT INTO poll_votes (poll_id, user_id, option_idx)
    VALUES (${id}, ${u.id}, ${idx})
    ON CONFLICT (poll_id, user_id) DO UPDATE SET option_idx = ${idx}`;
  return NextResponse.json({ ok: true });
}
