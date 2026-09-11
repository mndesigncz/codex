// Host objednává od stolu. Ceny se berou z nabídky v databázi, ne z prohlížeče.
import { NextResponse } from 'next/server';
import { sql, customer, profileBySlug, join } from '@/lib/client';
import { buildLines, notifyNewOrder, parseGeo, checkGeo, geoMode, setOrderStatus } from '@/lib/clientOrders';
import { getConnection } from '@/lib/storyous';
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
  const [table] = tableId ? await sql`SELECT id, name, token FROM client_tables WHERE id = ${tableId} AND team_id = ${teamId} AND active = TRUE` : [null as any];
  if (!table) return NextResponse.json({ error: 'Vyber stůl, u kterého sedíš.' }, { status: 400 });

  // Ochrana: kód z QR na stole a poloha telefonu. Viz lib/clientOrders.
  const token = String(b.token ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const viaQr = !!table.token && token === String(table.token);
  if (p.order_qr_required !== false && !viaQr) return NextResponse.json({ error: 'Objednat jde jen přes QR kód na stole. Naskenuj ho telefonem.' }, { status: 403 });
  const geo = checkGeo(p, parseGeo(b.geo));
  if (geoMode(p) === 'block') {
    if (geo.status === 'none') return NextResponse.json({ error: 'Bez polohy objednat nejde. Povol polohu v prohlížeči a zkus to znovu.' }, { status: 403 });
    if (geo.status === 'far') {
      const d = Number(geo.distance);
      const txt = d >= 1000 ? `${(d / 1000).toFixed(d >= 10000 ? 0 : 1).replace('.', ',')} km` : `${d} m`;
      return NextResponse.json({ error: `Podle polohy jsi ${txt} od podniku. Objednat jde jen u stolu.` }, { status: 403 });
    }
  }
  const verified = viaQr && (geo.status === 'ok' || geo.status === 'off');
  const built = await buildLines(teamId, p.menu_slug ?? null, Array.isArray(b.items) ? b.items : []);
  if (built.error) return NextResponse.json({ error: built.error }, { status: 400 });
  const [open] = await sql`SELECT id FROM client_orders WHERE team_id = ${teamId} AND customer_id = ${me.id} AND status = 'new'`;
  if (open) return NextResponse.json({ error: 'Předchozí objednávka ještě čeká na obsluhu.' }, { status: 409 });
  await join(me.id, teamId);
  const note = String(b.note ?? '').trim().slice(0, 300) || null;
  const [o] = await sql`
    INSERT INTO client_orders (team_id, customer_id, table_id, items, total, note, status, via_qr, geo_status, geo_distance_m)
    VALUES (${teamId}, ${me.id}, ${table.id}, ${JSON.stringify(built.lines)}, ${built.total}, ${note}, 'new', ${viaQr}, ${geo.status}, ${geo.distance})
    RETURNING id, items, total, status, created_at`;
  await sql`UPDATE client_orders SET external_id = ${'mgr-ord-' + o.id} WHERE id = ${o.id}`;

  // Ověřená objednávka s napojenou pokladnou jde rovnou do kasy a na terminál;
  // obsluha ji vidí tady i tam. Neověřená čeká na obsluhu.
  let auto: { posNote: string | null } | null = null;
  if (verified && p.order_auto_pos !== false && await getConnection(teamId)) {
    try { auto = await setOrderStatus(teamId, Number(o.id), 'confirmed'); } catch { auto = null; }
  }
  const straight = !!auto && !auto.posNote?.startsWith('Pokladna') && !auto.posNote?.includes('zůstává jen tady');
  if (!straight) await notifyNewOrder(teamId, me.name, table.name, built.total, Number(o.id));
  return NextResponse.json({ ok: true, straight, order: { ...o, status: auto ? 'confirmed' : o.status, tableName: table.name } });
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
