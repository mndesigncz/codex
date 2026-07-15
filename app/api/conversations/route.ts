import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function currentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return { id: parseInt((session.user as any).id) };
}

// Ensure the user is a member of their team conversation (self-heal).
async function ensureTeamMembership(teamId: number, meId: number) {
  let [teamConv] = await sql`
    SELECT id FROM conversations WHERE team_id = ${teamId} AND type = 'team' LIMIT 1`;
  if (!teamConv) {
    const [created] = await sql`
      INSERT INTO conversations (team_id, type, name)
      VALUES (${teamId}, 'team', 'Týmový chat') RETURNING id`;
    teamConv = created;
  }
  const existing = await sql`
    SELECT id FROM conversation_members
    WHERE conversation_id = ${teamConv.id} AND user_id = ${meId}`;
  if (existing.length === 0) {
    await sql`
      INSERT INTO conversation_members (conversation_id, user_id)
      VALUES (${teamConv.id}, ${meId})`;
  }
  return teamConv.id;
}

export async function GET() {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });

  const [u] = await sql`SELECT team_id FROM users WHERE id = ${me.id}`;
  const teamId = u?.team_id;
  if (!teamId) return NextResponse.json({ conversations: [] });

  await ensureTeamMembership(teamId, me.id);

  // All conversations the user is a member of.
  const rows = await sql`
    SELECT
      c.id,
      c.type,
      c.name,
      cm.last_read_at,
      (SELECT content FROM chat_messages m WHERE m.conversation_id = c.id
         ORDER BY m.created_at DESC LIMIT 1) AS last_content,
      (SELECT attachment_type FROM chat_messages m WHERE m.conversation_id = c.id
         ORDER BY m.created_at DESC LIMIT 1) AS last_attachment_type,
      (SELECT created_at FROM chat_messages m WHERE m.conversation_id = c.id
         ORDER BY m.created_at DESC LIMIT 1) AS last_time,
      (SELECT COUNT(*) FROM chat_messages m
         WHERE m.conversation_id = c.id
           AND m.sender_id <> ${me.id}
           AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)) AS unread_count
    FROM conversations c
    JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ${me.id}
    WHERE c.team_id = ${teamId}`;

  const conversations = await Promise.all(
    rows.map(async (r: any) => {
      let name = r.name as string | null;
      let avatar: string | null = null;
      let otherUserId: number | null = null;
      if (r.type === 'direct') {
        const [other] = await sql`
          SELECT u.id, u.name, u.avatar
          FROM conversation_members cm
          JOIN users u ON u.id = cm.user_id
          WHERE cm.conversation_id = ${r.id} AND cm.user_id <> ${me.id}
          LIMIT 1`;
        name = other?.name ?? 'Neznámý';
        avatar = other?.avatar ?? '👤';
        otherUserId = other?.id ?? null;
      } else {
        name = r.name || 'Týmový chat';
      }
      let lastMessage: string | null = null;
      if (r.last_content) lastMessage = r.last_content;
      else if (r.last_attachment_type) lastMessage = '📎 Příloha';

      return {
        id: r.id,
        type: r.type,
        name,
        avatar,
        otherUserId,
        lastMessage,
        lastTime: r.last_time,
        unreadCount: Number(r.unread_count) || 0,
      };
    }),
  );

  // Sort: team pinned on top, then by last activity desc.
  conversations.sort((a, b) => {
    if (a.type === 'team' && b.type !== 'team') return -1;
    if (b.type === 'team' && a.type !== 'team') return 1;
    const ta = a.lastTime ? new Date(a.lastTime).getTime() : 0;
    const tb = b.lastTime ? new Date(b.lastTime).getTime() : 0;
    return tb - ta;
  });

  return NextResponse.json({ conversations });
}

// POST { otherUserId } → find-or-create a direct conversation (same team).
export async function POST(request: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });

  const { otherUserId } = await request.json();
  const otherId = parseInt(otherUserId);
  if (!otherId || otherId === me.id) {
    return NextResponse.json({ error: 'Neplatný uživatel' }, { status: 400 });
  }

  const [u] = await sql`SELECT team_id FROM users WHERE id = ${me.id}`;
  const teamId = u?.team_id;
  if (!teamId) return NextResponse.json({ error: 'Bez týmu' }, { status: 400 });

  // Verify the other user is in the same team.
  const [other] = await sql`SELECT id, team_id FROM users WHERE id = ${otherId}`;
  if (!other || other.team_id !== teamId) {
    return NextResponse.json({ error: 'Uživatel není ve stejném týmu' }, { status: 400 });
  }

  // Find existing direct conversation with exactly these two members.
  const [existing] = await sql`
    SELECT c.id
    FROM conversations c
    JOIN conversation_members a ON a.conversation_id = c.id AND a.user_id = ${me.id}
    JOIN conversation_members b ON b.conversation_id = c.id AND b.user_id = ${otherId}
    WHERE c.type = 'direct' AND c.team_id = ${teamId}
    LIMIT 1`;
  if (existing) return NextResponse.json({ id: existing.id });

  const [created] = await sql`
    INSERT INTO conversations (team_id, type) VALUES (${teamId}, 'direct') RETURNING id`;
  await sql`INSERT INTO conversation_members (conversation_id, user_id) VALUES (${created.id}, ${me.id})`;
  await sql`INSERT INTO conversation_members (conversation_id, user_id) VALUES (${created.id}, ${otherId})`;

  return NextResponse.json({ id: created.id });
}
