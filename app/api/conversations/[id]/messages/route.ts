import { NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { neon } from '@neondatabase/serverless';
import { notifyUser } from '@/lib/push';
import { souborUrl } from '@/lib/bezpecnaUrl';
import { reakcePoZpravach, uryvekZpravy } from '@/lib/chatReakce';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// Chat je pro každého s chat.pouzivat (všechny přednastavené role včetně
// tabletu); host s users.team_id, který není členem, dřív prošel taky.
async function currentUser(klic: string = 'chat.pouzivat') {
  const c = await pozaduj(klic);
  if (jeOdpoved(c)) return c;
  return { id: c.meId, teamId: c.teamId };
}

async function isMember(conversationId: number, userId: number) {
  const rows = await sql`
    SELECT id FROM conversation_members
    WHERE conversation_id = ${conversationId} AND user_id = ${userId} LIMIT 1`;
  return rows.length > 0;
}

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const me = await currentUser();
  if (jeOdpoved(me)) return me;
  const conversationId = parseInt(params.id);
  if (!conversationId) return NextResponse.json({ error: 'Neplatná konverzace' }, { status: 400 });

  if (!(await isMember(conversationId, me.id))) {
    return NextResponse.json({ error: 'Přístup odepřen' }, { status: 403 });
  }

  // Chat roste bez omezení — nenačítáme celou historii (velký payload i sken),
  // ale posledních 200 zpráv chronologicky. Vnitřní DESC + LIMIT trefí index
  // chat_messages(conversation_id, created_at DESC); vnější ASC vrátí pořadí,
  // které UI čeká (nejnovější dole).
  // Zprávy zablokovaných autorů se blokujícímu nezobrazují (moderace, Apple 1.2).
  // Před migrací tabulka user_blocks není: nic se neskrývá.
  let zablokovani: number[] = [];
  try {
    const b = await sql`SELECT blocked_id FROM user_blocks WHERE blocker_id = ${me.id}`;
    zablokovani = b.map((r: any) => Number(r.blocked_id));
  } catch { /* před migrací */ }
  // Kolo 8: k odpovědi (reply_to) úryvek původní zprávy a jméno autora — citace nad textem.
  const messages = await sql`
    SELECT * FROM (
      SELECT
        m.id, m.conversation_id, m.sender_id, m.content,
        m.attachment_url, m.attachment_type, m.attachment_name, m.created_at, m.reply_to,
        u.name AS sender_name, u.avatar AS sender_avatar,
        o.content AS reply_content, o.attachment_type AS reply_attachment, ou.name AS reply_sender
      FROM chat_messages m
      JOIN users u ON u.id = m.sender_id
      LEFT JOIN chat_messages o ON o.id = m.reply_to
      LEFT JOIN users ou ON ou.id = o.sender_id
      WHERE m.conversation_id = ${conversationId} AND NOT (m.sender_id = ANY(${zablokovani}))
      ORDER BY m.created_at DESC
      LIMIT 200
    ) t ORDER BY t.created_at ASC`;

  // Reakce ke všem načteným zprávám jedním dotazem (před migrací tabulka není — bez reakcí).
  let reakce = new Map<number, unknown>();
  try {
    const ids = messages.map((m: any) => Number(m.id));
    if (ids.length) {
      const radky = await sql`
        SELECT r.message_id, r.emoji, r.user_id, u.name FROM chat_reactions r JOIN users u ON u.id = r.user_id
        WHERE r.message_id = ANY(${ids}) ORDER BY r.created_at ASC`;
      reakce = reakcePoZpravach(radky.map((r: any) => ({ messageId: Number(r.message_id), emoji: String(r.emoji), userId: Number(r.user_id), name: String(r.name ?? '') })));
    }
  } catch { /* před migrací */ }

  // Kdo zprávu viděl se počítá z last_read_at členů („Viděli: Eva, Petr +3", v soukromé „Přečteno 14:02").
  const clenove = await sql`
    SELECT cm.user_id, cm.last_read_at, u.name FROM conversation_members cm JOIN users u ON u.id = cm.user_id
    WHERE cm.conversation_id = ${conversationId}`;

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
    replyTo: m.reply_to != null
      ? { id: Number(m.reply_to), senderName: m.reply_sender ?? 'Neznámý', content: uryvekZpravy(m.reply_content) ?? (m.reply_attachment ? 'Příloha' : '') }
      : null,
    reactions: reakce.get(Number(m.id)) ?? [],
  }));

  return NextResponse.json({
    messages: out,
    members: clenove.map((c: any) => ({ id: Number(c.user_id), name: String(c.name ?? ''), lastReadAt: c.last_read_at ?? null })),
  });
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const me = await currentUser();
  if (jeOdpoved(me)) return me;
  const conversationId = parseInt(params.id);
  if (!conversationId) return NextResponse.json({ error: 'Neplatná konverzace' }, { status: 400 });

  if (!(await isMember(conversationId, me.id))) {
    return NextResponse.json({ error: 'Přístup odepřen' }, { status: 403 });
  }

  const body = await request.json();
  const content = (body.content ?? '').toString().trim() || null;
  // Příloha je vždy soubor nahraný přes /api/upload — nic jiného chat neposílá.
  const attachmentUrl = souborUrl(body.attachmentUrl);
  const attachmentType = body.attachmentType ?? null;
  const attachmentName = body.attachmentName ?? null;

  if (!content && !attachmentUrl) {
    return NextResponse.json({ error: 'Prázdná zpráva' }, { status: 400 });
  }
  // Odpověď (kolo 8): jen na zprávu z téhle konverzace — cizí id se tiše zahodí, zpráva odejde bez citace.
  let replyTo: number | null = null;
  let citace: { id: number; senderName: string; content: string } | null = null;
  const chteneReply = parseInt(body.replyTo);
  if (Number.isFinite(chteneReply) && chteneReply > 0) {
    const [o] = await sql`
      SELECT o.id, o.content, o.attachment_type, u.name FROM chat_messages o JOIN users u ON u.id = o.sender_id
      WHERE o.id = ${chteneReply} AND o.conversation_id = ${conversationId}`;
    if (o) { replyTo = Number(o.id); citace = { id: replyTo, senderName: o.name ?? 'Neznámý', content: uryvekZpravy(o.content) ?? (o.attachment_type ? 'Příloha' : '') }; }
  }

  const [inserted] = await sql`
    INSERT INTO chat_messages (conversation_id, sender_id, content, attachment_url, attachment_type, attachment_name, reply_to)
    VALUES (${conversationId}, ${me.id}, ${content}, ${attachmentUrl}, ${attachmentType}, ${attachmentName}, ${replyTo})
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
        category: 'message',
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
      replyTo: citace,
      reactions: [],
    },
  });
}
