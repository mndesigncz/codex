// "Mám zájem o Pro" — records demand while real billing doesn't exist yet.
import { NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function POST() {
  // Zájem smí projevit kterýkoli člen podniku (nic se tím neplatí), ale jen
  // člen — dřív stačilo mít users.team_id, tedy i host.
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  const meId = c.meId;
  const u = { team_id: c.teamId };
  try {
    const [dup] = await sql`SELECT id FROM billing_interest WHERE team_id = ${u.team_id} AND user_id = ${meId}`;
    if (!dup) await sql`INSERT INTO billing_interest (team_id, user_id) VALUES (${u.team_id}, ${meId})`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Zatím nedostupné — spusť /api/init.' }, { status: 400 });
  }
}
