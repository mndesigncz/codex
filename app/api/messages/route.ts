// The channel-based team chat (Nástěnka / general).
//
// SECURITY: `messages` has no team column, so a plain filter on `channel` mixes
// every business's "general" channel into one. Scope through the sender's team,
// and take the author from the session — never from the request body.

import { NextRequest, NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// Člen aktivního podniku s chat.pouzivat. Host s users.team_id dřív
// nástěnku podniku četl i do ní psal — kolo 67 ho odřízne.
async function caller() {
  const c = await pozaduj('chat.pouzivat');
  if (jeOdpoved(c)) return c;
  return { meId: c.meId, teamId: c.teamId as number | null };
}

export async function GET(req: NextRequest) {
  const me = await caller();
  if (jeOdpoved(me)) return me;
  if (!me.teamId) return NextResponse.json([]);

  try {
    const { searchParams } = new URL(req.url);
    const channel = (searchParams.get('channel') ?? 'general').slice(0, 40);

    // Posledních 200 zpráv kanálu chronologicky (trefí index messages(channel,
    // created_at DESC)) — kanál roste bez omezení, celá historie by byla velký
    // sken i payload.
    const rows = await sql`
      SELECT * FROM (
        SELECT m.* FROM messages m
        WHERE m.channel = ${channel} AND m.team_id = ${me.teamId}
        ORDER BY m.created_at DESC
        LIMIT 200
      ) t ORDER BY t.created_at ASC`;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({ error: 'Zprávy se nepodařilo načíst' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const me = await caller();
  if (jeOdpoved(me)) return me;

  try {
    const body = await req.json();
    const content = String(body.content ?? '').trim().slice(0, 4000);
    if (!content) return NextResponse.json({ error: 'Prázdná zpráva' }, { status: 400 });
    const channel = String(body.channel ?? 'general').slice(0, 40);

    // The sender is whoever is logged in; body.senderId is ignored so nobody
    // can post under a colleague's name.
    const [row] = await sql`
      INSERT INTO messages (sender_id, channel, content, team_id)
      VALUES (${me.meId}, ${channel}, ${content}, ${me.teamId})
      RETURNING *`;
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: 'Zprávu se nepodařilo odeslat' }, { status: 500 });
  }
}
