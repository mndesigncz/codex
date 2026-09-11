// Host si vezme kupon za body. Vznikne kód, který ukáže u kasy.
import { NextResponse } from 'next/server';
import { sql, customer, profileBySlug, membership, award, couponCode } from '@/lib/client';
import { pragueToday } from '@/lib/pragueTime';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: { slug: string; id: string } }) {
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Přihlas se jako host.' }, { status: 401 });
  const p = await profileBySlug(params.slug);
  if (!p || !p.loyalty_on) return NextResponse.json({ error: 'Podnik nenalezen' }, { status: 404 });
  const teamId = Number(p.team_id);
  const [c] = await sql`SELECT * FROM client_coupons WHERE id = ${parseInt(params.id, 10)} AND team_id = ${teamId} AND active = TRUE`;
  if (!c || (c.valid_until && String(c.valid_until) < pragueToday())) return NextResponse.json({ error: 'Kupon už neplatí.' }, { status: 404 });
  const m = await membership(me.id, teamId);
  if (!m) return NextResponse.json({ error: 'Nejdřív se staň členem podniku.' }, { status: 400 });
  const cost = Number(c.cost_points) || 0;
  if (Number(m.points) < cost) return NextResponse.json({ error: `Chybí ti ${cost - Number(m.points)} bodů.` }, { status: 400 });
  const [open] = await sql`SELECT id FROM client_coupon_claims WHERE coupon_id = ${c.id} AND customer_id = ${me.id} AND redeemed_at IS NULL`;
  if (open) return NextResponse.json({ error: 'Tenhle kupon už máš vyzvednutý — ukaž ho u kasy.' }, { status: 409 });
  const code = couponCode();
  await sql`INSERT INTO client_coupon_claims (coupon_id, customer_id, team_id, code) VALUES (${c.id}, ${me.id}, ${teamId}, ${code})`;
  const points = cost > 0 ? await award(teamId, me.id, -cost, 'coupon', code, c.title) : Number(m.points);
  return NextResponse.json({ ok: true, code, points });
}
