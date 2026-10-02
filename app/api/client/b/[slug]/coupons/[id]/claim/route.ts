// Host si vezme kupon za body. Vznikne kód, který ukáže u kasy.
// Kupon může mít podmínky (úroveň, skupina, okno, limity, 18+) — rozhoduje
// stejná logika jako na stránce podniku (lib/coupons.claimBlocker).
import { NextResponse } from 'next/server';
import { sql, customer, profileBySlug, membership, spendPoints, couponCode, award } from '@/lib/client';
import { pragueToday } from '@/lib/pragueTime';
import { tierForMember, tierRulesFromProfile } from '@/lib/clientSlots';
import { claimBlocker } from '@/lib/coupons';
import { rezervujKus, vratKus } from '@/lib/kuponyKusy';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(_req: Request, props: { params: Promise<{ slug: string; id: string }> }) {
  const params = await props.params;
  await zajistiKupony();
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Přihlas se jako host.' }, { status: 401 });
  const p = await profileBySlug(params.slug);
  if (!p || !p.loyalty_on) return NextResponse.json({ error: 'Podnik nenalezen' }, { status: 404 });
  const teamId = Number(p.team_id);
  const [c] = await sql`SELECT * FROM client_coupons WHERE id = ${parseInt(params.id, 10)} AND team_id = ${teamId} AND active = TRUE AND kind = 'offer'
    AND draft = FALSE AND archived_at IS NULL`;
  // Jen nabídkové kupony: odměny za razítka (kind 'stamps') vznikají dokončením karty, ne klepnutím.
  if (!c || (c.valid_until && String(c.valid_until) < pragueToday())) return NextResponse.json({ error: 'Kupon už neplatí.' }, { status: 404 });
  const m = await membership(me.id, teamId);
  if (!m) return NextResponse.json({ error: 'Nejdřív se staň členem podniku.' }, { status: 400 });
  const tier = tierForMember({ visits: Number(m.visits ?? 0), spend: Number(m.spend ?? 0), lastVisitAt: m.last_visit_at }, tierRulesFromProfile(p));
  const [us] = await sql`SELECT birthday FROM users WHERE id = ${me.id}`;
  const blocked = await claimBlocker(c, teamId, me.id, { tierId: tier.id, birthday: us?.birthday ?? null });
  if (blocked) return NextResponse.json({ error: blocked }, { status: 400 });
  const cost = Number(c.cost_points) || 0;
  if (Number(m.points) < cost) return NextResponse.json({ error: `Chybí ti ${cost - Number(m.points)} bodů.` }, { status: 400 });
  const [open] = await sql`SELECT id FROM client_coupon_claims WHERE coupon_id = ${c.id} AND customer_id = ${me.id} AND redeemed_at IS NULL`;
  if (open) return NextResponse.json({ error: 'Tenhle kupon už máš vyzvednutý — ukaž ho u kasy.' }, { status: 409 });
  const code = couponCode();
  // Postup, ze kterého nic nezůstane napůl: 1) atomicky vzít kus z limitu, 2) atomicky odečíst body,
  // 3) vložit kód. Když se cokoli po kroku 1 nepovede, kus se vrátí a body se vrátí hostovi.
  if (!(await rezervujKus(c.id))) return NextResponse.json({ error: 'Kupony došly.' }, { status: 409 });
  let points = Number(m.points);
  let utraceno = false;
  try {
    if (cost > 0) {
      const after = await spendPoints(teamId, me.id, cost, 'coupon', code, c.title);
      if (after == null) { await vratKus(c.id); return NextResponse.json({ error: 'Body ti mezitím nevyšly. Zkus to znovu.' }, { status: 409 }); }
      points = after; utraceno = true;
    }
    // Vložení hlídá, že host nemá otevřený stejný kupon (dvojklik nevydá druhý kód).
    const vlozeno = await sql`
      INSERT INTO client_coupon_claims (coupon_id, customer_id, team_id, code, source)
      SELECT ${c.id}, ${me.id}, ${teamId}, ${code}, 'points'
      WHERE NOT EXISTS (SELECT 1 FROM client_coupon_claims WHERE coupon_id = ${c.id} AND customer_id = ${me.id} AND redeemed_at IS NULL)
      RETURNING id`;
    if (!vlozeno.length) {
      await vratKus(c.id);
      if (utraceno) await award(teamId, me.id, cost, 'coupon', `vraceni:${code}`, `Vráceno: ${c.title}`);
      return NextResponse.json({ error: 'Tenhle kupon už máš vyzvednutý — ukaž ho u kasy.' }, { status: 409 });
    }
  } catch (e) {
    // Pád databáze uprostřed: kus i body se vrátí, host nezaplatí za kupon, který nedostal.
    await vratKus(c.id).catch(() => {});
    if (utraceno) await award(teamId, me.id, cost, 'coupon', `vraceni:${code}`, `Vráceno: ${c.title}`).catch(() => {});
    throw e;
  }
  return NextResponse.json({ ok: true, code, points });
}
