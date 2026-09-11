// Moje podniky: členství s body a razítky, rezervace, objednávky, kupony.
import { NextResponse } from 'next/server';
import { sql, customer, publicProfile } from '@/lib/client';
import { pragueToday } from '@/lib/pragueTime';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET() {
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const today = pragueToday();
  const memberships = await sql`
    SELECT m.points, m.stamps, m.visits, m.joined_at, m.last_visit_at, p.*, t.name AS team_name, t.opening_hours, t.share_theme, t.currency
    FROM client_memberships m JOIN client_profiles p ON p.team_id = m.team_id JOIN teams t ON t.id = m.team_id
    WHERE m.customer_id = ${me.id} ORDER BY m.last_visit_at DESC NULLS LAST, m.joined_at DESC` as any[];
  const reservations = await sql`
    SELECT r.id, r.date, r.time, r.party, r.note, r.status, p.slug, COALESCE(NULLIF(t.share_theme->>'businessName',''), t.name) AS business
    FROM client_reservations r JOIN client_profiles p ON p.team_id = r.team_id JOIN teams t ON t.id = r.team_id
    WHERE r.customer_id = ${me.id} ORDER BY r.date DESC, r.time DESC LIMIT 40`;
  let orders: any[] = [];
  try {
    orders = await sql`
      SELECT o.id, o.items, o.total, o.status, o.created_at, p.slug, COALESCE(NULLIF(t.share_theme->>'businessName',''), t.name) AS business
      FROM client_orders o JOIN client_profiles p ON p.team_id = o.team_id JOIN teams t ON t.id = o.team_id
      WHERE o.customer_id = ${me.id} ORDER BY o.created_at DESC LIMIT 40` as any[];
  } catch { orders = []; }
  const claims = await sql`
    SELECT cl.id, cl.code, cl.claimed_at, cl.redeemed_at, c.title, p.slug, COALESCE(NULLIF(t.share_theme->>'businessName',''), t.name) AS business
    FROM client_coupon_claims cl JOIN client_coupons c ON c.id = cl.coupon_id JOIN client_profiles p ON p.team_id = cl.team_id JOIN teams t ON t.id = cl.team_id
    WHERE cl.customer_id = ${me.id} ORDER BY cl.redeemed_at NULLS FIRST, cl.claimed_at DESC LIMIT 40`;
  return NextResponse.json({
    me,
    memberships: memberships.map(m => ({ ...publicProfile(m), points: Number(m.points), stamps: Number(m.stamps), visits: Number(m.visits), lastVisitAt: m.last_visit_at })),
    reservations, orders, claims, today,
  });
}
