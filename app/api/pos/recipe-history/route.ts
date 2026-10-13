import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { osobyPodleId } from '@/lib/recepturyDb';

// Historie receptury (kolo 8, R8-5): kdo co kdy změnil.
//
//   GET /api/pos/recipe-history?productId=p1   verze jedné receptury od nejnovější (nejvýš 50),
//                                              každá se snímkem surovin, nákladem porce a kým
//   GET /api/pos/recipe-history               co se změnilo za posledních 7 dní (widget Receptury:
//                                              „Změněno tento týden · N") — bez snímků surovin
//
// Čte, kdo receptury vidí (receptury.zobrazit). Rozdíl mezi verzemi počítá klient
// (lib/recepturyVerze rozdilVerzi) ze snímků, ať server neposílá totéž dvakrát.

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

const predMigraci = (e: unknown) => (e as { code?: string } | null)?.code === '42P01';

export async function GET(req: NextRequest) {
  const c = await pozaduj('receptury.zobrazit');
  if (jeOdpoved(c)) return c;
  const productId = String(req.nextUrl.searchParams.get('productId') ?? '').trim().slice(0, 120);
  try {
    const rows = productId
      ? await sql`
          SELECT id, product_id, product_name, ingredients, cost_per_portion, created_by, created_at, note
          FROM pos_recipe_versions WHERE team_id = ${c.teamId} AND product_id = ${productId}
          ORDER BY created_at DESC, id DESC LIMIT 50`
      : await sql`
          SELECT id, product_id, product_name, cost_per_portion, created_by, created_at, note
          FROM pos_recipe_versions WHERE team_id = ${c.teamId} AND created_at >= NOW() - INTERVAL '7 days'
          ORDER BY created_at DESC, id DESC LIMIT 200`;
    const lide = await osobyPodleId((rows as any[]).map(r => Number(r.created_by)));
    return NextResponse.json({
      versions: (rows as any[]).map(r => ({
        id: Number(r.id),
        productId: String(r.product_id),
        productName: r.product_name ?? null,
        ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
        costPerPortion: r.cost_per_portion == null ? null : Number(r.cost_per_portion),
        changedBy: lide.get(Number(r.created_by)) ?? null,
        changedAt: r.created_at ? new Date(r.created_at).toISOString() : '',
        note: r.note ?? null,
      })),
    });
  } catch (e) {
    // Tabulka před migrací: prázdná historie, ne 500 — editor receptury bez ní funguje dál.
    if (predMigraci(e)) return NextResponse.json({ versions: [] });
    console.error('recipe-history GET', e);
    return NextResponse.json({ error: 'Historie receptury se nenačetla.' }, { status: 500 });
  }
}
