import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// Nástěnka je v UI jen u vedení, ale API ji dřív vydalo a nechalo zakládat
// komukoli přihlášenému (i tabletu, hostovi s team_id, a bez podniku vznikla
// osiřelá karta). Kolo 67 to zavírá oprávněním v aktivním podniku.

// GET — cards created by members of my team (cards have no team_id; scope via creator).
export async function GET() {
  const c = await pozaduj('planovani.zobrazit');
  if (jeOdpoved(c)) return c;

  try {
    const cards = await sql`
      SELECT p.* FROM planning_cards p
      WHERE p.team_id = ${c.teamId}
      ORDER BY p.position ASC, p.created_at ASC`;
    return NextResponse.json(cards);
  } catch {
    // Před migrací (team_id ještě není) nebo výpadek: hláška, ne holá pětistovka.
    return NextResponse.json({ error: 'Plánování se nepodařilo načíst. Zkuste to prosím znovu.' }, { status: 500 });
  }
}

// POST — create a card.
export async function POST(req: NextRequest) {
  const c = await pozaduj('planovani.upravit');
  if (jeOdpoved(c)) return c;

  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? '').trim();
  if (!title) return NextResponse.json({ error: 'Chybí název karty' }, { status: 400 });

  const [card] = await sql`
    INSERT INTO planning_cards (title, description, "column", position, created_by, team_id)
    VALUES (${title}, ${body.description ?? null}, ${body.column ?? 'ideas'}, ${body.position ?? 0}, ${c.meId}, ${c.teamId})
    RETURNING *`;
  return NextResponse.json(card);
}
