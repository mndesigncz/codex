// Host ukáže kód kuponu, obsluha ho tady uplatní. Jednou.
import { NextRequest, NextResponse } from 'next/server';
import { sql, teamMember } from '@/lib/client';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(req: NextRequest) {
  const u = await teamMember();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const code = String(b.code ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 6) return NextResponse.json({ error: 'Kód má šest znaků.' }, { status: 400 });
  const norm = code.slice(0, 3) + '-' + code.slice(3, 6);
  const [cl] = await sql`
    SELECT cl.*, c.title, us.name AS customer_name FROM client_coupon_claims cl
    JOIN client_coupons c ON c.id = cl.coupon_id JOIN users us ON us.id = cl.customer_id
    WHERE cl.code = ${norm} AND cl.team_id = ${u.team_id}`;
  if (!cl) return NextResponse.json({ error: 'Takový kupon tu není.' }, { status: 404 });
  if (cl.redeemed_at) return NextResponse.json({ error: `Už uplatněno ${new Date(cl.redeemed_at).toLocaleDateString('cs-CZ')}.`, title: cl.title }, { status: 409 });
  await sql`UPDATE client_coupon_claims SET redeemed_at = NOW() WHERE id = ${cl.id}`;
  return NextResponse.json({ ok: true, title: cl.title, customer: cl.customer_name });
}
