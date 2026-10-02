// Historie změn kuponu: kdo a kdy ho založil, upravil, zapnul, archivoval nebo rozeslal.
// Bere se z auditního deníku (entita client_coupon), nová tabulka není potřeba.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { popisAkce } from '@/lib/auditPopisky';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('kupony.spravovat');
  if (jeOdpoved(ctx)) return ctx;
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '', 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatný kupon' }, { status: 400 });
  const [c] = await sql`SELECT id FROM client_coupons WHERE id = ${id} AND team_id = ${ctx.teamId}`;
  if (!c) return NextResponse.json({ error: 'Kupon nenalezen' }, { status: 404 });
  const rows = await sql`
    SELECT a.id, a.action, a.detail, a.created_at, u.name AS user_name
    FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
    WHERE a.team_id = ${ctx.teamId} AND a.entity IN ('client_coupon', 'client_coupon_send', 'client_coupon_redeem') AND a.entity_id = ${id}
    ORDER BY a.created_at DESC, a.id DESC LIMIT 100` as any[];
  return NextResponse.json({
    historie: rows.map(r => ({
      id: Number(r.id), kdy: r.created_at, kdo: r.user_name ?? 'Systém',
      co: popisAkce(String(r.action)), detail: r.detail ?? '',
    })),
  });
}
