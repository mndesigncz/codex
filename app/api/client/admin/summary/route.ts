// Čísla pro přehled režimu Client a odznak v hlavičce.
import { NextResponse } from 'next/server';
import { sql, employer, ensureProfile } from '@/lib/client';
import { pragueToday } from '@/lib/pragueTime';

export const dynamic = 'force-dynamic';

export async function GET() {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const p = await ensureProfile(u.team_id);
  const today = pragueToday();
  const [[res], [ord], [mem]] = await Promise.all([
    sql`SELECT COUNT(*) FILTER (WHERE status = 'requested')::int AS requested, COUNT(*) FILTER (WHERE date = ${today} AND status IN ('confirmed','seated'))::int AS today FROM client_reservations WHERE team_id = ${u.team_id} AND date >= ${today}`,
    sql`SELECT COUNT(*) FILTER (WHERE status = 'new')::int AS new, COUNT(*) FILTER (WHERE created_at::date = ${today}::date)::int AS today FROM client_orders WHERE team_id = ${u.team_id}`.catch(() => [{ new: 0, today: 0 }]),
    sql`SELECT COUNT(*)::int AS members, COUNT(*) FILTER (WHERE joined_at >= NOW() - INTERVAL '30 days')::int AS new30 FROM client_memberships WHERE team_id = ${u.team_id}`,
  ]) as any[];
  return NextResponse.json({
    enabled: !!p.enabled, slug: p.slug,
    reservations: { requested: Number(res?.requested) || 0, today: Number(res?.today) || 0 },
    orders: { new: Number(ord?.new) || 0, today: Number(ord?.today) || 0 },
    members: Number(mem?.members) || 0, newMembers30: Number(mem?.new30) || 0,
    attention: (Number(res?.requested) || 0) + (Number(ord?.new) || 0),
  });
}
