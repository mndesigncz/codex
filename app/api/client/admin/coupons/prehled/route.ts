// Přehled uplatnění kuponů: kdo ho vzal, kdy, kolik utratil, kdo ho uplatnil, odkud
// se vzal (body, uvítací, promo kód, poslal podnik), za jak dlouho se uplatnil,
// kolik jich propadlo, odhad slevy a ROI. Volitelně jeden kupon (`id`) a rozmezí
// vydání (`od`, `do`). `export=csv` stáhne všechny řádky claimů.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { zajistiKupony } from '@/lib/kuponyDb';
import { souhrnUplatneni, claimyCsv } from '@/lib/kuponyPravidla';
import { pragueToday } from '@/lib/pragueTime';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const DEN = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('kupony.spravovat');
  if (jeOdpoved(ctx)) return ctx;
  await zajistiKupony();
  const u = new URL(req.url).searchParams;
  const id = parseInt(u.get('id') ?? '', 10);
  const kupon = Number.isFinite(id) ? id : null;
  const od = DEN.test(u.get('od') ?? '') ? u.get('od')! : null;
  const doDne = DEN.test(u.get('do') ?? '') ? u.get('do')! : null;
  const rows = await sql`
    SELECT cl.id, cl.code, cl.claimed_at, cl.redeemed_at, cl.redeemed_amount, cl.coupon_id,
           COALESCE(cl.source, CASE WHEN c.kind = 'stamps' THEN 'stamps' END) AS source,
           c.title, c.valid_until, c.benefit_kind, c.percent_off, c.amount_off,
           us.name AS customer_name, st.name AS staff_name
    FROM client_coupon_claims cl
    JOIN client_coupons c ON c.id = cl.coupon_id
    JOIN users us ON us.id = cl.customer_id
    LEFT JOIN users st ON st.id = cl.redeemed_by
    WHERE cl.team_id = ${ctx.teamId}
      AND (${kupon}::int IS NULL OR cl.coupon_id = ${kupon})
      AND (${od}::text IS NULL OR cl.claimed_at >= ${od}::date)
      AND (${doDne}::text IS NULL OR cl.claimed_at < (${doDne}::date + 1))
    ORDER BY COALESCE(cl.redeemed_at, cl.claimed_at) DESC, cl.id DESC LIMIT 5000` as any[];
  const dnes = pragueToday();
  if (u.get('export') === 'csv') {
    return new NextResponse(claimyCsv(rows, dnes), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="uplatneni-kuponu-${dnes}.csv"`, 'Cache-Control': 'private, no-store' },
    });
  }
  return NextResponse.json({
    souhrn: souhrnUplatneni(rows, dnes),
    radky: rows.slice(0, 200).map(r => ({
      id: Number(r.id), code: r.code, title: r.title, host: r.customer_name, claimedAt: r.claimed_at, redeemedAt: r.redeemed_at,
      amount: r.redeemed_amount == null ? null : Number(r.redeemed_amount), obsluha: r.staff_name ?? null, zdroj: r.source ?? null,
      propadlo: !r.redeemed_at && !!r.valid_until && String(r.valid_until) < dnes,
    })),
    celkemRadku: rows.length,
  });
}
