import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { notifyUser } from '@/lib/push';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function currentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return { id: parseInt((session.user as any).id) };
}

async function isMember(conversationId: number, userId: number) {
  const rows = await sql`
    SELECT id FROM conversation_members
    WHERE conversation_id = ${conversationId} AND user_id = ${userId} LIMIT 1`;
  return rows.length > 0;
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const conversationId = parseInt(params.id);
  if (!conversationId) return NextResponse.json({ error: 'Neplatná konverzace' }, { status: 400 });

  if (!(await isMember(conversationId, me.id))) {
    return NextResponse.json({ error: 'Přístup odepřen' }, { status: 403 });
  }

  const messages = await sql`
    SELECT
      m.id, m.conversation_id, m.sender_id, m.content,
      m.attachment_url, m.attachment_type, m.attachment_name, m.created_at,
      u.name AS sender_name, u.avatar AS sender_avatar
    FROM chat_messages m
    JOIN users u ON u.id = m.sender_id
    WHERE m.conversation_id = ${conversationId}
    ORDER BY m.created_at ASC`;

  const out = messages.map((m: any) => ({
    id: m.id,
    conversationId: m.conversation_id,
    senderId: m.sender_id,
    content: m.content,
    attachmentUrl: m.attachment_url,
    attachmentType: m.attachment_type,
    attachmentName: m.attachment_name,
    createdAt: m.created_at,
    senderName: m.sender_name,
    senderAvatar: m.sender_avatar ?? '👤',
  }));

  return NextResponse.json({ messages: out });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const conversationId = parseInt(params.id);
  if (!conversationId) return NextResponse.json({ error: 'Neplatná konverzace' }, { status: 400 });

  if (!(await isMember(conversationId, me.id))) {
    return NextResponse.json({ error: 'Přístup odepřen' }, { status: 403 });
  }

  const body = await request.json();
  const content = (body.content ?? '').toString().trim() || null;
  const attachmentUrl = body.attachmentUrl ?? null;
  const attachmentType = body.attachmentType ?? null;
  const attachmentName = body.attachmentName ?? null;

  if (!content && !attachmentUrl) {
    return NextResponse.json({ error: 'Prázdná zpráva' }, { status: 400 });
  }

  const [inserted] = await sql`
    INSERT INTO chat_messages (conversation_id, sender_id, content, attachment_url, attachment_type, attachment_name)
    VALUES (${conversationId}, ${me.id}, ${content}, ${attachmentUrl}, ${attachmentType}, ${attachmentName})
    RETURNING id, conversation_id, sender_id, content, attachment_url, attachment_type, attachment_name, created_at`;

  // Update sender's last_read_at.
  await sql`
    UPDATE conversation_members SET last_read_at = NOW()
    WHERE conversation_id = ${conversationId} AND user_id = ${me.id}`;

  const [sender] = await sql`SELECT name, avatar FROM users WHERE id = ${me.id}`;

  // Notify the other members.
  const others = await sql`
    SELECT user_id FROM conversation_members
    WHERE conversation_id = ${conversationId} AND user_id <> ${me.id}`;
  const notifBody = content || '📎 Příloha';
  await Promise.all(
    others.map((o: any) =>
      notifyUser(o.user_id, {
        title: sender?.name ?? 'Nová zpráva',
        body: notifBody,
        type: 'chat',
        link: '/',
      }),
    ),
  );

  return NextResponse.json({
    message: {
      id: inserted.id,
      conversationId: inserted.conversation_id,
      senderId: inserted.sender_id,
      content: inserted.content,
      attachmentUrl: inserted.attachment_url,
      attachmentType: inserted.attachment_type,
      attachmentName: inserted.attachment_name,
      createdAt: inserted.created_at,
      senderName: sender?.name ?? 'Neznámý',
      senderAvatar: sender?.avatar ?? '👤',
    },
  });
}
