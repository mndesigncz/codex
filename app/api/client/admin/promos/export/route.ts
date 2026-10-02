// Export promo kódů do CSV: jedna dávka (`?batch=`), nebo všechny kódy podniku.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { davkaCsv } from '@/lib/promoKody';
import { pragueToday } from '@/lib/pragueTime';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('kupony.spravovat');
  if (jeOdpoved(ctx)) return ctx;
  const batch = new URL(req.url).searchParams.get('batch');
  const rows = await sql`
    SELECT p.code, p.title, p.points, p.max_uses, p.valid_until, p.uses, c.title AS coupon_title
    FROM client_promos p LEFT JOIN client_coupons c ON c.id = p.coupon_id
    WHERE p.team_id = ${ctx.teamId} AND (${batch}::text IS NULL OR p.batch = ${batch})
    ORDER BY p.id` as any[];
  if (!rows.length) return NextResponse.json({ error: 'V téhle dávce nejsou žádné kódy.' }, { status: 404 });
  return new NextResponse(davkaCsv(rows.map(r => ({ ...r, points: Number(r.points) || 0, uses: Number(r.uses) || 0 }))), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="promo-kody-${pragueToday()}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
