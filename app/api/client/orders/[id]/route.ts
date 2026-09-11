// Stav jedné objednávky pro hosta — stránka se ptá, dokud není hotovo.
import { NextResponse } from 'next/server';
import { sql, customer } from '@/lib/client';
import { refreshPosState } from '@/lib/clientOrders';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const [o] = await sql`SELECT o.*, t.name AS table_name FROM client_orders o LEFT JOIN client_tables t ON t.id = o.table_id WHERE o.id = ${parseInt(params.id, 10)} AND o.customer_id = ${me.id}`;
  if (!o) return NextResponse.json({ error: 'Objednávka nenalezena' }, { status: 404 });
  const posState = await refreshPosState(Number(o.team_id), o);
  const [fresh] = await sql`SELECT status FROM client_orders WHERE id = ${o.id}`;
  return NextResponse.json({ order: { id: o.id, items: o.items, total: o.total, note: o.note, status: fresh?.status ?? o.status, posState, tableName: o.table_name, createdAt: o.created_at } });
}
