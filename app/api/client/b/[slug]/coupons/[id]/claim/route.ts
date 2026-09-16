// Host si vezme kupon za body. Vznikne kód, který ukáže u kasy.
// Kupon může mít podmínky (úroveň, skupina, okno, limity, 18+) — rozhoduje
// stejná logika jako na stránce podniku (lib/coupons.claimBlocker).
import { NextResponse } from 'next/server';
import { sql, customer, profileBySlug, membership, spendPoints, couponCode } from '@/lib/client';
import { pragueToday } from '@/lib/pragueTime';
import { tierFor } from '@/lib/clientSlots';
import { claimBlocker } from '@/lib/coupons';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

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
  const tier = tierFor(Number(m.visits ?? 0), {
    silverAt: Number(p.silver_at), goldAt: Number(p.gold_at), platinumAt: Number(p.platinum_at) || 0,
    memberDiscount: Number(p.member_discount), silverDiscount: Number(p.silver_discount), goldDiscount: Number(p.gold_discount),
    platinumDiscount: Number(p.platinum_discount) || 0,
  });
  const [us] = await sql`SELECT birthday FROM users WHERE id = ${me.id}`;
  const blocked = await claimBlocker(c, teamId, me.id, { tierId: tier.id, birthday: us?.birthday ?? null });
  if (blocked) return NextResponse.json({ error: blocked }, { status: 400 });
  const cost = Number(c.cost_points) || 0;
  if (Number(m.points) < cost) return NextResponse.json({ error: `Chybí ti ${cost - Number(m.points)} bodů.` }, { status: 400 });
  const [open] = await sql`SELECT id FROM client_coupon_claims WHERE coupon_id = ${c.id} AND customer_id = ${me.id} AND redeemed_at IS NULL`;
  if (open) return NextResponse.json({ error: 'Tenhle kupon už máš vyzvednutý — ukaž ho u kasy.' }, { status: 409 });
  const code = couponCode();
  // Nejdřív atomicky odečíst body — až když se to povede, vznikne kupon.
  // Dřív se body odečítaly zvlášť po vložení kuponu, takže dvojklik mohl
  // utratit stejné body dvakrát a přidělit dva kupony.
  let points = Number(m.points);
  if (cost > 0) {
    const after = await spendPoints(teamId, me.id, cost, 'coupon', code, c.title);
    if (after == null) return NextResponse.json({ error: 'Body ti mezitím nevyšly. Zkus to znovu.' }, { status: 409 });
    points = after;
  }
  await sql`INSERT INTO client_coupon_claims (coupon_id, customer_id, team_id, code) VALUES (${c.id}, ${me.id}, ${teamId}, ${code})`;
  return NextResponse.json({ ok: true, code, points });
}
