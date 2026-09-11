// Podniky, ke kterým se dá přidat. Veřejné; přihlášený host navíc vidí,
// kde už je členem.

import { NextRequest, NextResponse } from 'next/server';
import { sql, customer, publicProfile } from '@/lib/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const q = String(new URL(req.url).searchParams.get('q') ?? '').trim().toLowerCase().slice(0, 60);
  let rows: any[] = [];
  try {
    rows = await sql`
      SELECT p.*, t.name AS team_name, t.opening_hours, t.share_theme, t.currency,
             (SELECT COUNT(*)::int FROM client_memberships m WHERE m.team_id = p.team_id) AS members
      FROM client_profiles p JOIN teams t ON t.id = p.team_id
      WHERE p.enabled = TRUE
      ORDER BY t.name ASC LIMIT 100` as any[];
  } catch { return NextResponse.json({ businesses: [] }); }
  const me = await customer();
  let mine = new Set<number>();
  if (me) {
    const ms = await sql`SELECT team_id FROM client_memberships WHERE customer_id = ${me.id}` as any[];
    mine = new Set(ms.map(m => Number(m.team_id)));
  }
  const list = rows
    .map(r => ({ ...publicProfile(r), members: Number(r.members) || 0, member: mine.has(Number(r.team_id)) }))
    .filter(b => !q || b.name.toLowerCase().includes(q) || b.address.toLowerCase().includes(q) || b.tagline.toLowerCase().includes(q));
  return NextResponse.json({ businesses: list, signedIn: !!me });
}
