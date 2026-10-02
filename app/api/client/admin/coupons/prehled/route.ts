// Přehled uplatnění kuponů s ROI: kolik se vydalo a uplatnilo, průměrná útrata s kuponem,
// doba do uplatnění, propadlé neuplatněné kódy, odhad slev. Počítá lib/kuponyPrehled nad
// vydanými kódy (kupony za razítka se nepočítají, jsou to odměny, ne nabídky).
import { NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { souhrnKuponu, odhadSlevy } from '@/lib/kuponyPrehled';
import { pragueToday } from '@/lib/pragueTime';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const MAX_RADKU = 20000;

export async function GET() {
  const ctx = await pozaduj('kupony.spravovat');
  if (jeOdpoved(ctx)) return ctx;
  const dnes = pragueToday();
  const rows = await sql`
    SELECT cl.coupon_id, cl.claimed_at, cl.redeemed_at, cl.order_value, c.valid_until,
           c.benefit_kind, c.percent_off, c.amount_off
    FROM client_coupon_claims cl JOIN client_coupons c ON c.id = cl.coupon_id
    WHERE cl.team_id = ${ctx.teamId} AND c.kind = 'offer'
    ORDER BY cl.claimed_at DESC LIMIT ${MAX_RADKU}` as any[];
  const kupony = await sql`SELECT id, title FROM client_coupons WHERE team_id = ${ctx.teamId} AND kind = 'offer'` as any[];
  const poKuponu = new Map<number, any[]>();
  for (const r of rows) {
    const k = Number(r.coupon_id);
    if (!poKuponu.has(k)) poKuponu.set(k, []);
    poKuponu.get(k)!.push(r);
  }
  const radky = kupony
    .map(k => ({ id: Number(k.id), title: String(k.title), ...souhrnKuponu(poKuponu.get(Number(k.id)) ?? [], dnes), odhadSlevy: odhadSlevy(poKuponu.get(Number(k.id)) ?? []) }))
    .filter(k => k.vydano > 0)
    .sort((a, b) => b.uplatneno - a.uplatneno || b.vydano - a.vydano);
  const posledni = await sql`
    SELECT cl.id, cl.redeemed_at, cl.order_value, cl.redeem_note, c.title, cu.name AS host, st.name AS obsluha
    FROM client_coupon_claims cl
    JOIN client_coupons c ON c.id = cl.coupon_id
    JOIN users cu ON cu.id = cl.customer_id
    LEFT JOIN users st ON st.id = cl.redeemed_by
    WHERE cl.team_id = ${ctx.teamId} AND c.kind = 'offer' AND cl.redeemed_at IS NOT NULL
    ORDER BY cl.redeemed_at DESC LIMIT 15`;
  return NextResponse.json({
    celkem: { ...souhrnKuponu(rows, dnes), odhadSlevy: odhadSlevy(rows) },
    zkraceno: rows.length >= MAX_RADKU,
    kupony: radky, posledni,
  });
}
