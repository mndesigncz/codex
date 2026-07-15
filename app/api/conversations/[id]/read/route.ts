import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const meId = parseInt((session.user as any).id);
  const conversationId = parseInt(params.id);
  if (!conversationId) return NextResponse.json({ error: 'Neplatná konverzace' }, { status: 400 });

  await sql`
    UPDATE conversation_members SET last_read_at = NOW()
    WHERE conversation_id = ${conversationId} AND user_id = ${meId}`;

  return NextResponse.json({ ok: true });
}
