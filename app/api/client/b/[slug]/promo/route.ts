// Host zadá promo kód podniku.
//
// Pořadí kroků je navržené tak, aby nic nezůstalo napůl:
//  1) nic se nespotřebuje, dokud je jasné, že odměna hostovi nepatří (kupon s podmínkami
//     — úroveň, skupina, 18+, okno, limity — prochází stejnou claimBlocker jako vyzvednutí za body),
//  2) použití se zapíše (PK promo_uses hlídá „jednou na hosta") a počítadlo `uses` se zvýší
//     JEDNÍM UPDATE ... WHERE uses < max_uses, takže dva souběžní hosté nepřečerpají poslední kus,
//  3) odměna (kupon, body); když se cokoli po kroku 2 nepovede, použití i odměna se vrátí
//     a kód se hostovi nespotřebuje.
import { NextResponse } from 'next/server';
import { sql, customer, profileBySlug, join, membership, award, couponCode } from '@/lib/client';
import { pragueToday } from '@/lib/pragueTime';
import { hit } from '@/lib/rateLimit';
import { tierForMember, tierRulesFromProfile } from '@/lib/clientSlots';
import { claimBlocker } from '@/lib/coupons';
import { rezervujKus, vratKus } from '@/lib/kuponyKusy';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

async function vratPouziti(promoId: number, customerId: number) {
  await sql`DELETE FROM client_promo_uses WHERE promo_id = ${promoId} AND customer_id = ${customerId}`;
  await sql`UPDATE client_promos SET uses = GREATEST(0, uses - 1) WHERE id = ${promoId}`;
}

export async function POST(req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
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
  // Kupon z kódu: nesmí obejít podmínky, které by host měl při vyzvednutí za body.
  let kupon: any = null;
  if (promo.coupon_id) {
    [kupon] = await sql`SELECT * FROM client_coupons WHERE id = ${promo.coupon_id} AND team_id = ${teamId} AND kind = 'offer'`;
    // Kupon mezitím zmizel a kód nedává body: nemá co dát, tak se nespotřebuje.
    if (!kupon && !(Number(promo.points) > 0)) return NextResponse.json({ error: 'Odměna tohoto kódu už není k dispozici.' }, { status: 409 });
    if (kupon) {
      const m = await membership(me.id, teamId);
      const tier = tierForMember({ visits: Number(m?.visits ?? 0), spend: Number(m?.spend ?? 0) }, tierRulesFromProfile(p));
      const [us] = await sql`SELECT birthday FROM users WHERE id = ${me.id}`;
      const blocked = await claimBlocker(kupon, teamId, me.id, { tierId: tier.id, birthday: us?.birthday ?? null });
      if (blocked) return NextResponse.json({ error: blocked }, { status: 400 });
    }
  }
  const pouzito = await sql`INSERT INTO client_promo_uses (promo_id, customer_id) VALUES (${promo.id}, ${me.id}) ON CONFLICT DO NOTHING RETURNING promo_id`;
  if (!pouzito.length) return NextResponse.json({ error: 'Tenhle kód už jsi použil.' }, { status: 409 });
  const rezervace = await sql`
    UPDATE client_promos SET uses = uses + 1
    WHERE id = ${promo.id} AND active = TRUE AND (max_uses IS NULL OR uses < max_uses)
    RETURNING id`;
  if (!rezervace.length) {
    await sql`DELETE FROM client_promo_uses WHERE promo_id = ${promo.id} AND customer_id = ${me.id}`;
    return NextResponse.json({ error: 'Kód už je vyčerpaný.' }, { status: 409 });
  }
  let points: number | null = null;
  let coupon: string | null = null;
  let kusVzat = false;
  let kodKuponu: string | null = null;
  try {
    if (kupon) {
      if (!(await rezervujKus(Number(kupon.id)))) {
        await vratPouziti(Number(promo.id), me.id);
        return NextResponse.json({ error: 'Kupony z tohoto kódu už došly.' }, { status: 409 });
      }
      kusVzat = true;
      const c = couponCode();
      await sql`INSERT INTO client_coupon_claims (coupon_id, customer_id, team_id, code, source) VALUES (${kupon.id}, ${me.id}, ${teamId}, ${c}, 'promo')`;
      kodKuponu = c;
    }
    if (Number(promo.points) > 0) points = await award(teamId, me.id, Number(promo.points), 'manual', `promo:${promo.code}`, `Promo kód ${promo.title}`);
    coupon = kodKuponu;
  } catch (e) {
    // Kompenzace: kód se hostovi nespotřebuje, kupon i kus se vrátí.
    if (kodKuponu) await sql`DELETE FROM client_coupon_claims WHERE code = ${kodKuponu} AND redeemed_at IS NULL`.catch(() => {});
    if (kusVzat) await vratKus(Number(kupon.id)).catch(() => {});
    await vratPouziti(Number(promo.id), me.id).catch(() => {});
    throw e;
  }
  return NextResponse.json({ ok: true, title: promo.title, points, coupon });
}
