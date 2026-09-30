// Smazání zprávy v chatu (moderace, Apple 1.2): smí autor, nebo ten, kdo smí
// odebírat členy (tym.odebrat). Jen člen vlákna a jen zpráva z tohoto vlákna.

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { smiSmazatZpravu } from '@/lib/moderace';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function DELETE(_request: Request, props: { params: Promise<{ id: string; msgId: string }> }) {
  const { id, msgId } = await props.params;
  const conversationId = parseInt(id);
  const messageId = parseInt(msgId);
  if (!conversationId || !messageId) return NextResponse.json({ error: 'Neplatná zpráva.' }, { status: 400 });
  const c = await pozaduj('chat.pouzivat');
  if (jeOdpoved(c)) return c;
  const [clen] = await sql`SELECT 1 AS ok FROM conversation_members WHERE conversation_id = ${conversationId} AND user_id = ${c.meId} LIMIT 1`;
  if (!clen) return NextResponse.json({ error: 'Přístup odepřen' }, { status: 403 });
  const [m] = await sql`SELECT id, sender_id FROM chat_messages WHERE id = ${messageId} AND conversation_id = ${conversationId}`;
  if (!m) return NextResponse.json({ error: 'Zpráva už neexistuje.' }, { status: 404 });
  if (!smiSmazatZpravu({ meId: c.meId, autorId: Number(m.sender_id), moderator: c.role.opravneni.has('tym.odebrat') })) {
    return NextResponse.json({ error: 'Cizí zprávu smí smazat jen vedení.' }, { status: 403 });
  }
  await sql`DELETE FROM chat_messages WHERE id = ${messageId} AND conversation_id = ${conversationId}`;
  await audit(c.teamId, c.meId, 'zprava.smazana', 'chat_message', messageId);
  return NextResponse.json({ ok: true });
}
