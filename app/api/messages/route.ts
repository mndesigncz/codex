// The channel-based team chat (Nástěnka / general).
//
// SECURITY: `messages` has no team column, so a plain filter on `channel` mixes
// every business's "general" channel into one. Scope through the sender's team,
// and take the author from the session — never from the request body.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function caller() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const meId = parseInt((session.user as any).id);
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  return { meId, teamId: (u?.team_id ?? null) as number | null };
}

export async function GET(req: NextRequest) {
  const me = await caller();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!me.teamId) return NextResponse.json([]);

  try {
    const { searchParams } = new URL(req.url);
    const channel = (searchParams.get('channel') ?? 'general').slice(0, 40);

    const rows = await sql`
      SELECT m.* FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.channel = ${channel} AND u.team_id = ${me.teamId}
      ORDER BY m.created_at ASC`;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({ error: 'Zprávy se nepodařilo načíst' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const me = await caller();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });

  try {
    const body = await req.json();
    const content = String(body.content ?? '').trim().slice(0, 4000);
    if (!content) return NextResponse.json({ error: 'Prázdná zpráva' }, { status: 400 });
    const channel = String(body.channel ?? 'general').slice(0, 40);

    // The sender is whoever is logged in; body.senderId is ignored so nobody
    // can post under a colleague's name.
    const [row] = await sql`
      INSERT INTO messages (sender_id, channel, content)
      VALUES (${me.meId}, ${channel}, ${content})
      RETURNING *`;
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: 'Zprávu se nepodařilo odeslat' }, { status: 500 });
  }
}
