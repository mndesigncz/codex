// Host ukáže kód kuponu (opíše ho, nebo ukáže QR „managero:coupon:ABC-DEF“),
// obsluha ho tady uplatní. Jednou. Jediná cesta uplatnění: kód z QR i z ruky
// projde stejnou normalizací (lib/kuponQr).
//
// Smlouva s obrazovkou obsluhy:
//  · `preview: true` — nic se neuplatní; vrátí kupon, podmínky, `problem` (proč nejde),
//    `warnings` (útrata pod minimem, 18+) a `needsConfirm`.
//  · bez `preview` — uplatní. Když má kupon varování a požadavek nenese `confirm: true`,
//    odpoví 409 `{ needsConfirm: true, warnings }` a NIC neuplatní. Uplatnění ze seznamu
//    tak nejde obejít bez toho, aby obsluha varování viděla a potvrdila.
//  · `orderValue` — částka účtenky; zapíše se k uplatnění (ROI) a ověří se proti minimu.
// Zapisuje se, kdo kupon uplatnil (redeemed_by), částka a potvrzená varování.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { benefitLabel, conditionBadges } from '@/lib/coupons';
import { windowOk, varovaniUplatneni, denniLimitOk } from '@/lib/kuponyPravidla';
import { rezervujDenniUplatneni, vratDenniUplatneni } from '@/lib/kuponyKusy';
import { menaPodniku } from '@/lib/menaPodniku';
import { kodKuponu, duvodNeKupon } from '@/lib/kuponQr';
import { pragueToday } from '@/lib/pragueTime';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** Částka účtenky z těla: prázdné = neznámá; záporné nebo nečíselné = chyba. */
function castkaUctenky(v: unknown): { hodnota: number | null } | { chyba: string } {
  if (v === undefined || v === null || String(v).trim() === '') return { hodnota: null };
  const n = Number(String(v).replace(',', '.').replace(/\s/g, ''));
  if (!Number.isFinite(n) || n < 0) return { chyba: 'Částka účtenky musí být nezáporné číslo.' };
  if (n > 10_000_000) return { chyba: 'Částka účtenky je nesmyslně vysoká.' };
  return { hodnota: Math.round(n * 100) / 100 };
}

export async function POST(req: NextRequest) {
  const ctx = await pozaduj('kupony.uplatnit');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const b = await req.json().catch(() => ({}));
  // `code` může být ručně zadaný kód, nebo text z QR (payload kuponu); `payload` je alias pro skener.
  const norm = kodKuponu(b.payload ?? b.code);
  if (!norm) return NextResponse.json({ error: duvodNeKupon(b.payload ?? b.code) }, { status: 400 });
  const uctenka = castkaUctenky(b.orderValue);
  if ('chyba' in uctenka) return NextResponse.json({ error: uctenka.chyba }, { status: 400 });
  const [cl] = await sql`
    SELECT cl.*, c.title, c.description, us.name AS customer_name, c.benefit_kind, c.percent_off, c.amount_off,
           c.xy_buy, c.xy_free, c.min_order_value, c.days_of_week, c.hour_from, c.hour_till,
           c.adult_only, c.valid_since, c.valid_until, c.target_tiers,
           c.daily_limit, c.daily_count, c.daily_day
    FROM client_coupon_claims cl
    JOIN client_coupons c ON c.id = cl.coupon_id JOIN users us ON us.id = cl.customer_id
    WHERE cl.code = ${norm} AND cl.team_id = ${u.team_id}`;
  if (!cl) return NextResponse.json({ error: 'Takový kupon tu není.' }, { status: 404 });
  const dnes = pragueToday();
  // Částky v měně podniku, ne natvrdo v korunách.
  const castka = (await menaPodniku(u.team_id)).money;
  const uzUplatneno = cl.redeemed_at ? `Už uplatněno ${new Date(cl.redeemed_at).toLocaleDateString('cs-CZ')}.` : '';
  const denniProblem = denniLimitOk(cl, dnes) ? null : `Denní limit uplatnění (${Number(cl.daily_limit)}) je dnes vyčerpán.`;
  const warnings = varovaniUplatneni(cl, castka, uctenka.hodnota);
  if (b.preview === true) {
    const problem = cl.redeemed_at ? uzUplatneno : (windowOk(cl) ?? denniProblem);
    return NextResponse.json({
      preview: true, code: norm, title: cl.title, description: String(cl.description ?? ''), customer: cl.customer_name,
      benefit: benefitLabel(cl, castka), badges: conditionBadges(cl, castka),
      validSince: cl.valid_since ?? null, validUntil: cl.valid_until ?? null,
      claimedAt: cl.claimed_at ?? null, redeemed: !!cl.redeemed_at, problem, usable: !problem,
      minOrderValue: cl.min_order_value == null ? null : Number(cl.min_order_value),
      warnings, needsConfirm: warnings.length > 0,
    });
  }
  if (cl.redeemed_at) return NextResponse.json({ error: uzUplatneno, title: cl.title }, { status: 409 });
  // Kupon s časovým oknem (dny, hodiny) jde uplatnit jen v něm.
  const win = windowOk(cl);
  if (win) return NextResponse.json({ error: win, title: cl.title }, { status: 409 });
  if (denniProblem) return NextResponse.json({ error: denniProblem, title: cl.title }, { status: 409 });
  if (warnings.length && b.confirm !== true) {
    return NextResponse.json({ error: `${warnings.join(' ')} Potvrď, že kupon i přesto uplatníš.`, needsConfirm: true, warnings, title: cl.title }, { status: 409 });
  }
  // Denní limit se bere atomicky; když se pak uplatnění nepovede, vrátí se.
  const maLimit = Number(cl.daily_limit) > 0;
  if (maLimit && !(await rezervujDenniUplatneni(Number(cl.coupon_id), dnes))) {
    return NextResponse.json({ error: `Denní limit uplatnění (${Number(cl.daily_limit)}) je dnes vyčerpán.`, title: cl.title }, { status: 409 });
  }
  // Atomicky: dvojklik nebo dvě zařízení najednou uplatní kupon jen jednou.
  // Kdo prohraje závod, dostane 409, ne tiché druhé uplatnění.
  const poznamka = warnings.length ? `Potvrzeno: ${warnings.join(' ')}`.slice(0, 300) : null;
  const done = await sql`
    UPDATE client_coupon_claims
    SET redeemed_at = NOW(), redeemed_by = ${u.id}, order_value = ${uctenka.hodnota}, redeem_note = ${poznamka}
    WHERE id = ${cl.id} AND redeemed_at IS NULL RETURNING id`;
  if (!done.length) {
    if (maLimit) await vratDenniUplatneni(Number(cl.coupon_id), dnes);
    return NextResponse.json({ error: 'Kupon byl právě uplatněn.', title: cl.title }, { status: 409 });
  }
  await audit(u.team_id, u.id, 'client.kupon.uplatnen', 'client_coupon_claim', Number(cl.id),
    `${cl.title} · ${cl.customer_name}${uctenka.hodnota != null ? ` · účtenka ${castka(uctenka.hodnota)}` : ''}${poznamka ? ` · ${poznamka}` : ''}`);
  // Výhoda a podmínky pro obsluhu: co odečíst a co zkontrolovat (útrata, 18+).
  return NextResponse.json({
    ok: true, title: cl.title, customer: cl.customer_name,
    benefit: benefitLabel(cl, castka), badges: conditionBadges(cl, castka),
    orderValue: uctenka.hodnota, warnings,
  });
}
