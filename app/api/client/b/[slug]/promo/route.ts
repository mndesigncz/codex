// Host zadá promo kód podniku.
// Kód nejdřív projde stejnou kontrolou jako vyzvednutí kuponu (úroveň, skupina,
// 18+, limity, platnost) — host, který na kupon z kódu nemá nárok, kód nespotřebuje.
// Použití se počítá atomicky: řádek použití hosta + podmíněný přírůstek počítadla
// (nepřekročí limit ani při souběhu). Když se cokoli po cestě nepovede, použití
// se vrátí a host může kód zadat znovu.
import { NextResponse } from 'next/server';
import { sql, customer, profileBySlug, join, award, couponCode, membership } from '@/lib/client';
import { pragueToday } from '@/lib/pragueTime';
import { hit } from '@/lib/rateLimit';
import { tierForMember, tierRulesFromProfile } from '@/lib/clientSlots';
import { claimBlocker } from '@/lib/coupons';
import { zajistiKupony, vydejKod } from '@/lib/kuponyDb';
import { promoBlocker, cistyKod, jeVeVerejne } from '@/lib/kuponyPravidla';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** Vrátí použití kódu (kompenzace). */
async function vratPouziti(promoId: number, customerId: number) {
  await sql`DELETE FROM client_promo_uses WHERE promo_id = ${promoId} AND customer_id = ${customerId}`;
  await sql`UPDATE client_promos SET uses = GREATEST(uses - 1, 0) WHERE id = ${promoId}`;
}

export async function POST(req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  await zajistiKupony();
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Přihlas se jako host.' }, { status: 401 });
  const p = await profileBySlug(params.slug);
  if (!p || !p.loyalty_on) return NextResponse.json({ error: 'Podnik nenalezen' }, { status: 404 });
  const gate = await hit(`client-promo:${me.id}`, 10, 3600);
  if (!gate.ok) return NextResponse.json({ error: 'Moc pokusů. Zkus to za hodinu.' }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  const code = cistyKod(b.code, 64);
  const teamId = Number(p.team_id);
  const [promo] = await sql`SELECT * FROM client_promos WHERE code = ${code} AND team_id = ${teamId} AND active = TRUE`;
  if (!promo) return NextResponse.json({ error: 'Tenhle kód neplatí.' }, { status: 404 });
  const dnes = pragueToday();
  const proc = promoBlocker(promo, dnes);
  if (proc) return NextResponse.json({ error: proc }, { status: proc.startsWith('Kód už je vyčerpaný') ? 409 : 404 });
  await join(me.id, teamId);
  // Kupon z kódu: host na něj musí mít nárok (úroveň, skupina, 18+, limit na hosta). Okno hodin a dnů
  // se hlídá až při uplatnění u kasy, dar z kódu se dá přijmout kdykoli.
  let kupon: any = null;
  if (promo.coupon_id) {
    [kupon] = await sql`SELECT * FROM client_coupons WHERE id = ${promo.coupon_id} AND team_id = ${teamId} AND kind = 'offer'`;
    if (!kupon || !jeVeVerejne(kupon) || (kupon.status ?? 'live') !== 'live' || (kupon.valid_until && String(kupon.valid_until) < dnes)) {
      return NextResponse.json({ error: 'Kupon k tomuhle kódu už neplatí.' }, { status: 409 });
    }
    const m = await membership(me.id, teamId);
    const tier = tierForMember({ visits: Number(m?.visits ?? 0), spend: Number(m?.spend ?? 0) }, tierRulesFromProfile(p));
    const [us] = await sql`SELECT birthday FROM users WHERE id = ${me.id}`;
    const blokace = await claimBlocker({ ...kupon, valid_since: null, days_of_week: null, hour_from: null, hour_till: null }, teamId, me.id, { tierId: tier.id, birthday: us?.birthday ?? null });
    if (blokace) return NextResponse.json({ error: blokace }, { status: 400 });
  }
  // Atomicky: řádek použití hosta (každý jednou) a podmíněný přírůstek počítadla.
  const vlozeno = await sql`INSERT INTO client_promo_uses (promo_id, customer_id) VALUES (${promo.id}, ${me.id}) ON CONFLICT DO NOTHING RETURNING promo_id`;
  if (!vlozeno.length) return NextResponse.json({ error: 'Tenhle kód už jsi použil.' }, { status: 409 });
  const pocitadlo = await sql`
    UPDATE client_promos SET uses = uses + 1
    WHERE id = ${promo.id} AND (max_uses IS NULL OR uses < max_uses) RETURNING id`;
  if (!pocitadlo.length) {
    await sql`DELETE FROM client_promo_uses WHERE promo_id = ${promo.id} AND customer_id = ${me.id}`;
    return NextResponse.json({ error: 'Kód už je vyčerpaný.' }, { status: 409 });
  }
  let points: number | null = null; let coupon: string | null = null;
  try {
    if (kupon) {
      const r = await vydejKod({ teamId, couponId: Number(kupon.id), customerId: me.id, kod: couponCode(), zdroj: 'promo', promoId: Number(promo.id) });
      if (!r.ok) {
        await vratPouziti(Number(promo.id), me.id);
        return NextResponse.json({ error: 'Kupon z tohoto kódu už došel.' }, { status: 409 });
      }
      coupon = r.kod;
    }
    if (Number(promo.points) > 0) points = await award(teamId, me.id, Number(promo.points), 'manual', `promo:${promo.code}`, `Promo kód ${promo.title}`);
  } catch {
    // Kompenzace: kód z dokončené poloviny se vezme zpět a použití se vrátí, host zkusí znovu.
    if (coupon) {
      await sql`DELETE FROM client_coupon_claims WHERE code = ${coupon} AND customer_id = ${me.id}`;
      await sql`UPDATE client_coupons SET issued = GREATEST(COALESCE(issued, 1) - 1, 0) WHERE id = ${kupon.id}`;
    }
    await vratPouziti(Number(promo.id), me.id);
    return NextResponse.json({ error: 'Kód se nepodařilo uplatnit. Zkus to znovu.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, title: promo.title, points, coupon });
}
