// Čísla pro přehled režimu Client a odznak v hlavičce.
import { NextResponse } from 'next/server';
import { sql, employer, ensureProfile } from '@/lib/client';
import { pragueToday } from '@/lib/pragueTime';
import { getConnection } from '@/lib/storyous';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET() {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const p = await ensureProfile(u.team_id);
  const today = pragueToday();
  const [[res], [ord], [mem], [tbl], [menu], [rev], conn] = await Promise.all([
    sql`SELECT COUNT(*) FILTER (WHERE status = 'requested')::int AS requested, COUNT(*) FILTER (WHERE date = ${today} AND status IN ('confirmed','seated'))::int AS today FROM client_reservations WHERE team_id = ${u.team_id} AND date >= ${today}`,
    sql`SELECT COUNT(*) FILTER (WHERE status = 'new')::int AS new, COUNT(*) FILTER (WHERE created_at::date = ${today}::date)::int AS today FROM client_orders WHERE team_id = ${u.team_id}`.catch(() => [{ new: 0, today: 0 }]),
    sql`SELECT COUNT(*)::int AS members, COUNT(*) FILTER (WHERE joined_at >= NOW() - INTERVAL '30 days')::int AS new30 FROM client_memberships WHERE team_id = ${u.team_id}`,
    sql`SELECT COUNT(*) FILTER (WHERE active)::int AS active, COUNT(*) FILTER (WHERE active AND storyous_desk_id IS NOT NULL)::int AS paired FROM client_tables WHERE team_id = ${u.team_id}`.catch(() => [{ active: 0, paired: 0 }]),
    p.menu_slug
      ? sql`SELECT id FROM menu_boards WHERE team_id = ${u.team_id} AND slug = ${p.menu_slug} AND enabled IS NOT FALSE LIMIT 1`
      : sql`SELECT id FROM menu_boards WHERE team_id = ${u.team_id} AND enabled IS NOT FALSE LIMIT 1`,
    sql`SELECT COUNT(*)::int AS count, ROUND(AVG(rating)::numeric, 1)::float AS avg, COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS new7, COUNT(*) FILTER (WHERE rating <= 2 AND created_at >= NOW() - INTERVAL '7 days')::int AS low7 FROM client_reviews WHERE team_id = ${u.team_id}`.catch(() => [{ count: 0, avg: null, new7: 0, low7: 0 }]),
    getConnection(u.team_id).catch(() => null),
  ]) as any[];
  return NextResponse.json({
    enabled: !!p.enabled, slug: p.slug,
    reservations: { requested: Number(res?.requested) || 0, today: Number(res?.today) || 0 },
    orders: { new: Number(ord?.new) || 0, today: Number(ord?.today) || 0 },
    members: Number(mem?.members) || 0, newMembers30: Number(mem?.new30) || 0,
    attention: (Number(res?.requested) || 0) + (Number(ord?.new) || 0),
    reviews: { count: Number(rev?.count) || 0, avg: rev?.avg ?? null, new7: Number(rev?.new7) || 0, low7: Number(rev?.low7) || 0 },
    // Co je propojené — přehled z toho staví kontrolní seznam s prokliky.
    setup: {
      enabled: !!p.enabled,
      menu: !!menu,
      tables: Number(tbl?.active) || 0,
      tablesPaired: Number(tbl?.paired) || 0,
      pos: !!conn,
      location: p.lat != null && p.lng != null,
      reservationsOn: !!p.reservations_on,
      orderingOn: !!p.ordering_on,
      loyaltyOn: !!p.loyalty_on,
      pointsPer100: Number(p.points_per_100) || 0,
      stampTarget: Number(p.stamp_target) || 0,
      stampReward: p.stamp_reward ?? '',
    },
  });
}
