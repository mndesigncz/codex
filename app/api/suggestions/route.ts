import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { notifyUsers } from '@/lib/push';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function ctx() {
  const s = await getServerSession(authOptions);
  if (!s?.user) return null;
  const meId = parseInt((s.user as any).id);
  const role = (s.user as any).role as string;
  const [u] = await sql`SELECT team_id, name FROM users WHERE id = ${meId}`;
  return { meId, role, teamId: u?.team_id as number | null, name: u?.name as string };
}

// GET — the whole team's suggestions, newest-relevant first, with vote counts
// and whether the current user has voted. Everyone in the team except the kiosk.
export async function GET() {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId || c.role === 'kiosk') return NextResponse.json({ suggestions: [], isEmployer: false, meId: c?.meId ?? null });
  try {
    const rows = await sql`
      SELECT s.id, s.title, s.content, s.status, s.author_id AS "authorId",
             s.created_at AS "createdAt",
             u.name AS "authorName", u.avatar AS "authorAvatar",
             COUNT(v.user_id)::int AS votes,
             BOOL_OR(v.user_id = ${c.meId}) AS "hasVoted"
      FROM suggestions s
      LEFT JOIN users u ON u.id = s.author_id
      LEFT JOIN suggestion_votes v ON v.suggestion_id = s.id
      WHERE s.team_id = ${c.teamId}
      GROUP BY s.id, u.name, u.avatar
      ORDER BY
        CASE s.status WHEN 'new' THEN 0 WHEN 'planned' THEN 1 WHEN 'done' THEN 2 ELSE 3 END,
        COUNT(v.user_id) DESC,
        s.created_at DESC`;
    return NextResponse.json({
      suggestions: rows,
      isEmployer: c.role === 'employer',
      meId: c.meId,
    });
  } catch {
    // table not migrated yet
    return NextResponse.json({ suggestions: [], isEmployer: c.role === 'employer', meId: c.meId });
  }
}

// POST — anyone on the team (except kiosk) files a suggestion; notifies employers.
export async function POST(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId) return NextResponse.json({ error: 'Tým nenalezen' }, { status: 400 });
  if (c.role === 'kiosk') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const title = String(b.title ?? '').trim();
  const content = String(b.content ?? '').trim();
  if (!title) return NextResponse.json({ error: 'Napiš krátký název podnětu.' }, { status: 400 });
  if (title.length > 160) return NextResponse.json({ error: 'Název je moc dlouhý (max 160 znaků).' }, { status: 400 });
  if (content.length > 2000) return NextResponse.json({ error: 'Popis je moc dlouhý (max 2000 znaků).' }, { status: 400 });

  const [row] = await sql`
    INSERT INTO suggestions (team_id, author_id, title, content)
    VALUES (${c.teamId}, ${c.meId}, ${title}, ${content || null})
    RETURNING id, title, content, status, author_id AS "authorId", created_at AS "createdAt"`;

  // Notify the team's employers (unless the author IS an employer).
  try {
    const employers = await sql`
      SELECT id FROM users WHERE team_id = ${c.teamId} AND role = 'employer' AND id <> ${c.meId}`;
    if (employers.length) {
      await notifyUsers(employers.map((e: any) => e.id), {
        title: '💡 Nový podnět na vylepšení',
        body: `${c.name ?? 'Někdo'}: ${title.length > 100 ? title.slice(0, 97) + '…' : title}`,
        type: 'info',
      });
    }
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, suggestion: row });
}
