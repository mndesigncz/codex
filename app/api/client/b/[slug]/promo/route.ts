// Host zadá promo kód podniku.
import { NextResponse } from 'next/server';
import { sql, customer, profileBySlug, join, award, couponCode } from '@/lib/client';
import { pragueToday } from '@/lib/pragueTime';
import { hit } from '@/lib/rateLimit';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Přihlas se jako host.' }, { status: 401 });
  const p = await profileBySlug(params.slug);
  if (!p || !p.loyalty_on) return NextResponse.json({ error: 'Podnik nenalezen' }, { status: 404 });
  const gate = await hit(`client-promo:${me.id}`, 10, 3600);
  if (!gate.ok) return NextResponse.json({ error: 'Moc pokusů. Zkus to za hodinu.' }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  const code = String(b.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const teamId = Number(p.team_id);
  const [promo] = await sql`SELECT * FROM client_promos WHERE code = ${code} AND team_id = ${teamId} AND active = TRUE`;
  if (!promo || (promo.valid_until && String(promo.valid_until) < pragueToday())) return NextResponse.json({ error: 'Tenhle kód neplatí.' }, { status: 404 });
  if (promo.max_uses && Number(promo.uses) >= Number(promo.max_uses)) return NextResponse.json({ error: 'Kód už je vyčerpaný.' }, { status: 409 });
  await join(me.id, teamId);
  try { await sql`INSERT INTO client_promo_uses (promo_id, customer_id) VALUES (${promo.id}, ${me.id})`; }
  catch { return NextResponse.json({ error: 'Tenhle kód už jsi použil.' }, { status: 409 }); }
  await sql`UPDATE client_promos SET uses = uses + 1 WHERE id = ${promo.id}`;
  let points: number | null = null; let coupon: string | null = null;
  if (Number(promo.points) > 0) points = await award(teamId, me.id, Number(promo.points), 'manual', `promo:${promo.code}`, `Promo kód ${promo.title}`);
  if (promo.coupon_id) {
    const c = couponCode();
    await sql`INSERT INTO client_coupon_claims (coupon_id, customer_id, team_id, code) VALUES (${promo.coupon_id}, ${me.id}, ${teamId}, ${c})`;
    coupon = c;
  }
  return NextResponse.json({ ok: true, title: promo.title, points, coupon });
}
