// Kde se skladová položka používá: produkty z kasy, které ji mají v receptuře.
// Čte jen naši tabulku párování — žádné volání pokladny, aby se to dalo bez
// váhání zobrazit přímo u položky ve skladu.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const meId = parseInt((session.user as any).id);
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  if (!u?.team_id) return NextResponse.json({ usage: {} });

  try {
    const rows = await sql`
      SELECT item_id AS "itemId", product_id AS "productId", product_name AS "productName",
             amount_per_sale::float AS amount
      FROM pos_product_map WHERE team_id = ${u.team_id}`;
    const usage: Record<string, { productId: string; productName: string | null; amount: number }[]> = {};
    for (const r of rows as any[]) {
      const key = String(r.itemId);
      (usage[key] ??= []).push({ productId: r.productId, productName: r.productName, amount: r.amount });
    }
    return NextResponse.json({ usage });
  } catch {
    return NextResponse.json({ usage: {} });
  }
}
