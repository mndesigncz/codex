// Host ukáže kód kuponu (opíše ho, nebo ukáže QR „managero:coupon:ABC-DEF“),
// obsluha ho tady uplatní. Jednou. Jediná cesta uplatnění: kód z QR i z ruky
// projde stejnou normalizací (lib/kuponQr). S `preview: true` se kupon jen
// ukáže (název, podmínky, platnost, kdo ho drží, co obsluha ještě musí zadat)
// a nic se neuplatní.
//
// Uplatnění hlídá, co kupon slibuje: minimální útratu (obsluha ji zadá v `amount`),
// 18+ (podle data narození hosta, jinak obsluha potvrdí občanku `ageChecked`),
// okno platnosti a denní limit uplatnění. Zapíše se částka a obsluha.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { benefitLabel, conditionBadges } from '@/lib/coupons';
import { windowOk, kontrolaUplatneni, castkaZTela, odhadSlevy } from '@/lib/kuponyPravidla';
import { zajistiKupony, polozkyNabidky, obohatKupony, rezervujUplatneni, vratUplatneni } from '@/lib/kuponyDb';
import { menaPodniku } from '@/lib/menaPodniku';
import { kodKuponu, duvodNeKupon } from '@/lib/kuponQr';
import { pragueToday } from '@/lib/pragueTime';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(req: NextRequest) {
  const ctx = await pozaduj('kupony.uplatnit');
  if (jeOdpoved(ctx)) return ctx;
  await zajistiKupony();
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const b = await req.json().catch(() => ({}));
  // `code` může být ručně zadaný kód, nebo text z QR (payload kuponu); `payload` je alias pro skener.
  const norm = kodKuponu(b.payload ?? b.code);
  if (!norm) return NextResponse.json({ error: duvodNeKupon(b.payload ?? b.code) }, { status: 400 });
  const [raw] = await sql`
    SELECT cl.*, c.title, c.description, us.name AS customer_name, us.birthday AS customer_birthday, c.benefit_kind, c.percent_off, c.amount_off,
           c.xy_buy, c.xy_free, c.min_order_value, c.days_of_week, c.hour_from, c.hour_till,
           c.adult_only, c.valid_since, c.valid_until, c.target_tiers, c.menu_item_id, c.excluded_items, c.excluded_categories, c.daily_limit
    FROM client_coupon_claims cl
    JOIN client_coupons c ON c.id = cl.coupon_id JOIN users us ON us.id = cl.customer_id
    WHERE cl.code = ${norm} AND cl.team_id = ${u.team_id}`;
  if (!raw) return NextResponse.json({ error: 'Takový kupon tu není.' }, { status: 404 });
  const [cl] = obohatKupony([raw], await polozkyNabidky(u.team_id));
  const dnes = pragueToday();
  const castka = (await menaPodniku(u.team_id)).money;
  const uzUplatneno = cl.redeemed_at ? `Už uplatněno ${new Date(cl.redeemed_at).toLocaleDateString('cs-CZ')}.` : '';
  const vek = b.ageChecked === true;
  const castkaZadana = castkaZTela(b.amount);
  if (b.preview === true) {
    const problem = cl.redeemed_at ? uzUplatneno : windowOk(cl);
    const kontrola = kontrolaUplatneni(cl, { amount: castkaZadana, vekOvereny: vek, birthday: cl.customer_birthday ?? null }, castka);
    return NextResponse.json({
      preview: true, code: norm, title: cl.title, description: String(cl.description ?? ''), customer: cl.customer_name,
      benefit: benefitLabel(cl, castka), badges: conditionBadges(cl, castka),
      validSince: cl.valid_since ?? null, validUntil: cl.valid_until ?? null,
      claimedAt: cl.claimed_at ?? null, redeemed: !!cl.redeemed_at, problem, usable: !problem,
      // Co má obsluha při uplatnění ještě udělat: zadat útratu, ověřit občanku.
      minOrderValue: cl.min_order_value == null ? null : Number(cl.min_order_value),
      needsAmount: Number(cl.min_order_value) > 0,
      needsAgeCheck: cl.adult_only === true && !(cl.customer_birthday && /^\d{4}-\d{2}-\d{2}$/.test(String(cl.customer_birthday))),
      adultOnly: cl.adult_only === true,
      nezletily: !kontrola.ok && kontrola.kod === 'nezletily',
    });
  }
  if (cl.redeemed_at) return NextResponse.json({ error: uzUplatneno, title: cl.title }, { status: 409 });
  // Kupon s časovým oknem (dny, hodiny) jde uplatnit jen v něm.
  const win = windowOk(cl);
  if (win) return NextResponse.json({ error: win, title: cl.title }, { status: 409 });
  const kontrola = kontrolaUplatneni(cl, { amount: castkaZadana, vekOvereny: vek, birthday: cl.customer_birthday ?? null }, castka);
  if (!kontrola.ok) return NextResponse.json({ error: kontrola.zprava, needs: kontrola.kod, title: cl.title }, { status: kontrola.kod === 'castka' || kontrola.kod === 'vek' ? 422 : 409 });
  // Denní limit uplatnění: rezervace jedním UPDATE, ať dvě zařízení nepřekročí limit.
  if (!(await rezervujUplatneni(Number(cl.coupon_id), dnes))) {
    return NextResponse.json({ error: `Dnešní limit uplatnění tohoto kuponu (${Number(cl.daily_limit)}) je vyčerpaný.`, title: cl.title }, { status: 409 });
  }
  // Atomicky: dvojklik nebo dvě zařízení najednou uplatní kupon jen jednou.
  // Kdo prohraje závod, dostane 409, ne tiché druhé uplatnění (a denní rezervace se vrátí).
  let done: any[] = [];
  try {
    done = await sql`UPDATE client_coupon_claims SET redeemed_at = NOW(), redeemed_by = ${u.id}, redeemed_amount = ${castkaZadana} WHERE id = ${cl.id} AND redeemed_at IS NULL RETURNING id`;
  } catch (e) {
    await vratUplatneni(Number(cl.coupon_id), dnes).catch(() => {});
    throw e;
  }
  if (!done.length) {
    await vratUplatneni(Number(cl.coupon_id), dnes).catch(() => {});
    return NextResponse.json({ error: 'Kupon byl právě uplatněn.', title: cl.title }, { status: 409 });
  }
  // Výhoda a podmínky pro obsluhu: co odečíst a co zkontrolovat. Částky v měně podniku, ne natvrdo v korunách.
  const benefit = benefitLabel(cl, castka);
  const badges = conditionBadges(cl, castka);
  const sleva = odhadSlevy(cl, castkaZadana);
  audit(u.team_id, u.id, 'client.coupon.redeem', 'client_coupon_redeem', Number(cl.coupon_id), `uplatněn: ${cl.title}, host ${cl.customer_name}${castkaZadana != null ? `, útrata ${castkaZadana}` : ''}`);
  return NextResponse.json({ ok: true, title: cl.title, customer: cl.customer_name, benefit, badges, amount: castkaZadana, discount: sleva });
}
