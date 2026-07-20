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

// GET — pinned announcements for the team (everyone incl. kiosk).
export async function GET() {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId) return NextResponse.json({ announcements: [] });
  try {
    const rows = await sql`
      SELECT a.id, a.content, a.pinned, a.created_at AS "createdAt",
             u.name AS "authorName", u.avatar AS "authorAvatar"
      FROM announcements a
      LEFT JOIN users u ON u.id = a.author_id
      WHERE a.team_id = ${c.teamId} AND a.pinned = TRUE
      ORDER BY a.created_at DESC
      LIMIT 10`;
    return NextResponse.json({ announcements: rows });
  } catch {
    // table not migrated yet
    return NextResponse.json({ announcements: [] });
  }
}

// POST (employer) — pin a new announcement; notifies the whole team.
export async function POST(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (c.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  if (!c.teamId) return NextResponse.json({ error: 'Tým nenalezen' }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const content = String(b.content ?? '').trim();
  if (!content) return NextResponse.json({ error: 'Napiš text oznámení.' }, { status: 400 });
  if (content.length > 1000) return NextResponse.json({ error: 'Oznámení je moc dlouhé (max 1000 znaků).' }, { status: 400 });

  const [row] = await sql`
    INSERT INTO announcements (team_id, author_id, content)
    VALUES (${c.teamId}, ${c.meId}, ${content})
    RETURNING id, content, pinned, created_at AS "createdAt"`;

  try {
    const members = await sql`
      SELECT id FROM users WHERE team_id = ${c.teamId} AND id <> ${c.meId} AND role <> 'kiosk'`;
    await notifyUsers(members.map((m: any) => m.id), {
      title: '📌 Nové oznámení',
      body: content.length > 120 ? content.slice(0, 117) + '…' : content,
      type: 'info',
    });
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, announcement: row });
}

// DELETE ?id= (employer) — unpin/remove an announcement.
export async function DELETE(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (c.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });
  await sql`DELETE FROM announcements WHERE id = ${id} AND team_id = ${c.teamId}`;
  return NextResponse.json({ ok: true });
}
