// Promo kódy: na letáku, v příspěvku, na účtence. Host ho zadá a dostane body
// nebo kupon. Omezený počet použití, každý host jednou.
import { NextRequest, NextResponse } from 'next/server';
import { sql, employer } from '@/lib/client';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
const clean = (v: any) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
export async function GET() {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const promos = await sql`SELECT p.*, c.title AS coupon_title FROM client_promos p LEFT JOIN client_coupons c ON c.id = p.coupon_id WHERE p.team_id = ${u.team_id} ORDER BY p.active DESC, p.created_at DESC`;
  return NextResponse.json({ promos });
}
export async function POST(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const code = clean(b.code);
  const title = String(b.title ?? '').trim().slice(0, 80);
  if (code.length < 3 || !title) return NextResponse.json({ error: 'Kód (aspoň 3 znaky) a název.' }, { status: 400 });
  const points = Math.max(0, Math.min(10000, parseInt(String(b.points ?? '0'), 10) || 0));
  const couponId = b.coupon_id ? parseInt(String(b.coupon_id), 10) : null;
  if (!points && !couponId) return NextResponse.json({ error: 'Kód musí dávat body, kupon, nebo obojí.' }, { status: 400 });
  if (couponId) {
    const [c] = await sql`SELECT id FROM client_coupons WHERE id = ${couponId} AND team_id = ${u.team_id}`;
    if (!c) return NextResponse.json({ error: 'Kupon nenalezen' }, { status: 400 });
  }
  const maxUses = b.max_uses ? Math.max(1, parseInt(String(b.max_uses), 10) || 1) : null;
  const validUntil = /^\d{4}-\d{2}-\d{2}$/.test(String(b.valid_until ?? '')) ? String(b.valid_until) : null;
  try {
    const [p] = await sql`INSERT INTO client_promos (team_id, code, title, points, coupon_id, max_uses, valid_until) VALUES (${u.team_id}, ${code}, ${title}, ${points}, ${couponId}, ${maxUses}, ${validUntil}) RETURNING *`;
    return NextResponse.json({ ok: true, promo: p });
  } catch { return NextResponse.json({ error: 'Tenhle kód už někdo používá. Zvol jiný.' }, { status: 409 }); }
}
export async function PATCH(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const [p] = await sql`UPDATE client_promos SET active = ${!!b.active} WHERE id = ${parseInt(String(b.id), 10)} AND team_id = ${u.team_id} RETURNING *`;
  if (!p) return NextResponse.json({ error: 'Kód nenalezen' }, { status: 404 });
  return NextResponse.json({ ok: true, promo: p });
}
