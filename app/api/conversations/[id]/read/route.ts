import { NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  // Zápis se týká jen vlastního členství v konverzaci (WHERE user_id = já).
  const c = await pozaduj('chat.pouzivat');
  if (jeOdpoved(c)) return c;
  const meId = c.meId;
  const conversationId = parseInt(params.id);
  if (!conversationId) return NextResponse.json({ error: 'Neplatná konverzace' }, { status: 400 });

  await sql`
    UPDATE conversation_members SET last_read_at = NOW()
    WHERE conversation_id = ${conversationId} AND user_id = ${meId}`;

  return NextResponse.json({ ok: true });
}
