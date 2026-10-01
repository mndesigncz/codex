// Host ukáže kód kuponu (opíše ho, nebo ukáže QR „managero:coupon:ABC-DEF“),
// obsluha ho tady uplatní. Jednou. Jediná cesta uplatnění: kód z QR i z ruky
// projde stejnou normalizací (lib/kuponQr). S `preview: true` se kupon jen
// ukáže (název, podmínky, platnost, kdo ho drží) a nic se neuplatní.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { benefitLabel, conditionBadges, windowOk } from '@/lib/coupons';
import { kodKuponu, duvodNeKupon } from '@/lib/kuponQr';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(req: NextRequest) {
  const ctx = await pozaduj('kupony.uplatnit');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const b = await req.json().catch(() => ({}));
  // `code` může být ručně zadaný kód, nebo text z QR (payload kuponu); `payload` je alias pro skener.
  const norm = kodKuponu(b.payload ?? b.code);
  if (!norm) return NextResponse.json({ error: duvodNeKupon(b.payload ?? b.code) }, { status: 400 });
  const [cl] = await sql`
    SELECT cl.*, c.title, c.description, us.name AS customer_name, c.benefit_kind, c.percent_off, c.amount_off,
           c.xy_buy, c.xy_free, c.min_order_value, c.days_of_week, c.hour_from, c.hour_till,
           c.adult_only, c.valid_since, c.valid_until, c.target_tiers
    FROM client_coupon_claims cl
    JOIN client_coupons c ON c.id = cl.coupon_id JOIN users us ON us.id = cl.customer_id
    WHERE cl.code = ${norm} AND cl.team_id = ${u.team_id}`;
  if (!cl) return NextResponse.json({ error: 'Takový kupon tu není.' }, { status: 404 });
  const uzUplatneno = cl.redeemed_at ? `Už uplatněno ${new Date(cl.redeemed_at).toLocaleDateString('cs-CZ')}.` : '';
  if (b.preview === true) {
    const problem = cl.redeemed_at ? uzUplatneno : windowOk(cl);
    return NextResponse.json({
      preview: true, code: norm, title: cl.title, description: String(cl.description ?? ''), customer: cl.customer_name,
      benefit: benefitLabel(cl), badges: conditionBadges(cl),
      validSince: cl.valid_since ?? null, validUntil: cl.valid_until ?? null,
      claimedAt: cl.claimed_at ?? null, redeemed: !!cl.redeemed_at, problem, usable: !problem,
    });
  }
  if (cl.redeemed_at) return NextResponse.json({ error: uzUplatneno, title: cl.title }, { status: 409 });
  // Kupon s časovým oknem (dny, hodiny) jde uplatnit jen v něm.
  const win = windowOk(cl);
  if (win) return NextResponse.json({ error: win, title: cl.title }, { status: 409 });
  // Atomicky: dvojklik nebo dvě zařízení najednou uplatní kupon jen jednou.
  // Kdo prohraje závod, dostane 409, ne tiché druhé uplatnění.
  const done = await sql`UPDATE client_coupon_claims SET redeemed_at = NOW() WHERE id = ${cl.id} AND redeemed_at IS NULL RETURNING id`;
  if (!done.length) return NextResponse.json({ error: 'Kupon byl právě uplatněn.', title: cl.title }, { status: 409 });
  // Výhoda a podmínky pro obsluhu: co odečíst a co zkontrolovat (útrata, 18+).
  const benefit = benefitLabel(cl);
  const badges = conditionBadges(cl);
  return NextResponse.json({ ok: true, title: cl.title, customer: cl.customer_name, benefit, badges });
}
