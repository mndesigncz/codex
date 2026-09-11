// Host objednává od stolu. Ceny se berou z nabídky v databázi, ne z prohlížeče.
import { NextResponse } from 'next/server';
import { sql, customer, profileBySlug, join } from '@/lib/client';
import { buildLines, notifyNewOrder } from '@/lib/clientOrders';
import { hit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Přihlas se jako host.' }, { status: 401 });
  const p = await profileBySlug(params.slug);
  if (!p) return NextResponse.json({ error: 'Podnik nenalezen' }, { status: 404 });
  if (!p.ordering_on) return NextResponse.json({ error: 'Podnik objednávky od stolu nepřijímá.' }, { status: 400 });
  const gate = await hit(`client-order:${me.id}`, 10, 10 * 60);
  if (!gate.ok) return NextResponse.json({ error: 'Moc objednávek za sebou. Chvilku počkej.' }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  const teamId = Number(p.team_id);
  const tableId = parseInt(String(b.tableId ?? ''), 10);
  const [table] = tableId ? await sql`SELECT id, name FROM client_tables WHERE id = ${tableId} AND team_id = ${teamId} AND active = TRUE` : [null as any];
  if (!table) return NextResponse.json({ error: 'Vyber stůl, u kterého sedíš.' }, { status: 400 });
  const built = await buildLines(teamId, p.menu_slug ?? null, Array.isArray(b.items) ? b.items : []);
  if (built.error) return NextResponse.json({ error: built.error }, { status: 400 });
  const [open] = await sql`SELECT id FROM client_orders WHERE team_id = ${teamId} AND customer_id = ${me.id} AND status = 'new'`;
  if (open) return NextResponse.json({ error: 'Předchozí objednávka ještě čeká na obsluhu.' }, { status: 409 });
  await join(me.id, teamId);
  const note = String(b.note ?? '').trim().slice(0, 300) || null;
  const [o] = await sql`
    INSERT INTO client_orders (team_id, customer_id, table_id, items, total, note, status)
    VALUES (${teamId}, ${me.id}, ${table.id}, ${JSON.stringify(built.lines)}, ${built.total}, ${note}, 'new')
    RETURNING id, items, total, status, created_at`;
  await sql`UPDATE client_orders SET external_id = ${'mgr-ord-' + o.id} WHERE id = ${o.id}`;
  await notifyNewOrder(teamId, me.name, table.name, built.total, Number(o.id));
  return NextResponse.json({ ok: true, order: { ...o, tableName: table.name } });
}

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const me = await customer();
  if (!me) return NextResponse.json({ orders: [] });
  const p = await profileBySlug(params.slug);
  if (!p) return NextResponse.json({ error: 'Podnik nenalezen' }, { status: 404 });
  const orders = await sql`
    SELECT o.id, o.items, o.total, o.note, o.status, o.pos_state, o.created_at, t.name AS table_name
    FROM client_orders o LEFT JOIN client_tables t ON t.id = o.table_id
    WHERE o.team_id = ${p.team_id} AND o.customer_id = ${me.id} AND o.created_at > NOW() - INTERVAL '12 hours'
    ORDER BY o.created_at DESC LIMIT 10`;
  return NextResponse.json({ orders });
}
