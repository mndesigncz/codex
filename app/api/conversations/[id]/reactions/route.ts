import { NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { neon } from '@neondatabase/serverless';
import { jeEmojiReakce, seskupReakce } from '@/lib/chatReakce';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// Reakce na zprávu (kolo 8): POST { messageId, emoji } přepne vlastní reakci
// (je → smaže, není → přidá) a vrátí reakce zprávy po změně. Jen člen
// konverzace, jen jedna ze čtyř reakcí (lib/chatReakce), jen zpráva z téhle
// konverzace — jinak by šlo reagovat na cizí vlákno podle id.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const c = await pozaduj('chat.pouzivat');
  if (jeOdpoved(c)) return c;
  const conversationId = parseInt(params.id);
  if (!conversationId) return NextResponse.json({ error: 'Neplatná konverzace' }, { status: 400 });
  const clen = await sql`SELECT id FROM conversation_members WHERE conversation_id = ${conversationId} AND user_id = ${c.meId} LIMIT 1`;
  if (!clen.length) return NextResponse.json({ error: 'Přístup odepřen' }, { status: 403 });

  const b = await request.json().catch(() => ({}));
  const messageId = parseInt(b.messageId);
  const emoji = String(b.emoji ?? '');
  if (!Number.isFinite(messageId)) return NextResponse.json({ error: 'Chybí zpráva' }, { status: 400 });
  if (!jeEmojiReakce(emoji)) return NextResponse.json({ error: 'Neznámá reakce' }, { status: 400 });
  const [m] = await sql`SELECT id FROM chat_messages WHERE id = ${messageId} AND conversation_id = ${conversationId}`;
  if (!m) return NextResponse.json({ error: 'Zpráva nenalezena' }, { status: 404 });

  try {
    const smazano = await sql`DELETE FROM chat_reactions WHERE message_id = ${messageId} AND user_id = ${c.meId} AND emoji = ${emoji} RETURNING id`;
    if (!smazano.length) {
      await sql`INSERT INTO chat_reactions (message_id, user_id, emoji) VALUES (${messageId}, ${c.meId}, ${emoji}) ON CONFLICT (message_id, user_id, emoji) DO NOTHING`;
    }
    const radky = await sql`
      SELECT r.message_id, r.emoji, r.user_id, u.name FROM chat_reactions r JOIN users u ON u.id = r.user_id
      WHERE r.message_id = ${messageId} ORDER BY r.created_at ASC`;
    const reactions = seskupReakce(radky.map((r: any) => ({ messageId: Number(r.message_id), emoji: String(r.emoji), userId: Number(r.user_id), name: String(r.name ?? '') })));
    return NextResponse.json({ ok: true, messageId, reactions, mine: !smazano.length });
  } catch {
    return NextResponse.json({ error: 'Reakci se nepodařilo uložit' }, { status: 500 });
  }
}
