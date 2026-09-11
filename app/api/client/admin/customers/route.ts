// Členové podniku: kdo chodí, kolik má bodů a razítek, kdy byl naposledy.
import { NextRequest, NextResponse } from 'next/server';
import { sql, employer } from '@/lib/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const q = String(new URL(req.url).searchParams.get('q') ?? '').trim().toLowerCase();
  const rows = await sql`
    SELECT m.customer_id AS id, us.name, us.email, m.points, m.stamps, m.visits, m.joined_at, m.last_visit_at,
           (SELECT COUNT(*)::int FROM client_reservations r WHERE r.customer_id = m.customer_id AND r.team_id = m.team_id) AS reservations,
           (SELECT COUNT(*)::int FROM client_coupon_claims c WHERE c.customer_id = m.customer_id AND c.team_id = m.team_id AND c.redeemed_at IS NULL) AS open_coupons
    FROM client_memberships m JOIN users us ON us.id = m.customer_id
    WHERE m.team_id = ${u.team_id}
    ORDER BY m.last_visit_at DESC NULLS LAST, m.joined_at DESC LIMIT 500` as any[];
  const customers = rows.filter(r => !q || String(r.name).toLowerCase().includes(q) || String(r.email).toLowerCase().includes(q));
  return NextResponse.json({ customers, total: rows.length });
}
