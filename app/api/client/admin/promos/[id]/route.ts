// Rozpad použití promo kódu: po dnech (pražských) a posledních dvacet hostů.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { rozpadPouziti } from '@/lib/promoKody';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const ctx = await pozaduj('kupony.spravovat');
  if (jeOdpoved(ctx)) return ctx;
  const id = parseInt(params.id, 10);
  const [p] = await sql`SELECT * FROM client_promos WHERE id = ${id} AND team_id = ${ctx.teamId}`;
  if (!p) return NextResponse.json({ error: 'Kód nenalezen' }, { status: 404 });
  const uses = await sql`
    SELECT u.used_at, us.name FROM client_promo_uses u JOIN users us ON us.id = u.customer_id
    WHERE u.promo_id = ${id} ORDER BY u.used_at DESC LIMIT 1000` as any[];
  return NextResponse.json({
    promo: p, celkem: Number(p.uses) || 0,
    poDnech: rozpadPouziti(uses).slice(0, 30),
    posledni: uses.slice(0, 20).map(u => ({ usedAt: u.used_at, name: u.name })),
  });
}
