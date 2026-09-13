// Příjem u obsluhy: nové a rozpracované objednávky a dnešní rezervace.
// Kdokoli z týmu — kiosk na baru, zaměstnanec v mobilu i vedení.
import { NextRequest, NextResponse } from 'next/server';
import { sql, teamMember } from '@/lib/client';
import { setOrderStatus, refreshPosState, sendToPos } from '@/lib/clientOrders';
import { getConnection } from '@/lib/storyous';
import { pragueToday } from '@/lib/pragueTime';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET() {
  const u = await teamMember();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const today = pragueToday();
  let orders: any[] = [];
  try {
    orders = await sql`
      SELECT o.id, o.items, o.total, o.note, o.status, o.pos_state, o.storyous_order_id, o.pos_note, o.pos_tried_at, o.created_at, o.via_qr, o.geo_status, o.geo_distance_m, us.name AS customer_name, t.name AS table_name, t.storyous_desk_id
      FROM client_orders o JOIN users us ON us.id = o.customer_id LEFT JOIN client_tables t ON t.id = o.table_id
      WHERE o.team_id = ${u.team_id} AND (o.status IN ('new','confirmed') OR (o.status IN ('done','declined') AND o.updated_at > NOW() - INTERVAL '3 hours'))
      ORDER BY CASE o.status WHEN 'new' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END, o.created_at ASC` as any[];
    for (const o of orders) if (o.status === 'confirmed' && o.storyous_order_id) o.pos_state = await refreshPosState(u.team_id, o);
  } catch { orders = []; }
  let reservations: any[] = [];
  try {
    reservations = await sql`
      SELECT r.id, r.time, r.party, r.note, r.status, us.name AS customer_name, t.name AS table_name
      FROM client_reservations r JOIN users us ON us.id = r.customer_id LEFT JOIN client_tables t ON t.id = r.table_id
      WHERE r.team_id = ${u.team_id} AND r.date = ${today} AND r.status IN ('requested','confirmed','seated') ORDER BY r.time` as any[];
  } catch { reservations = []; }
  const newCount = orders.filter(o => o.status === 'new').length;

  // Řetězec k terminálu: pokladna → spárovaný stůl → položky s produktem.
  // Když kterýkoli článek chybí, objednávka se nevytiskne — a obsluha to
  // musí vidět dřív, než se na to zeptá host.
  let pos: any = { connected: false };
  try {
    const conn = await getConnection(u.team_id);
    const [t] = await sql`
      SELECT COUNT(*) FILTER (WHERE active)::int AS active,
             COUNT(*) FILTER (WHERE active AND storyous_desk_id IS NOT NULL)::int AS paired
      FROM client_tables WHERE team_id = ${u.team_id}` as any[];
    const [p] = await sql`SELECT menu_slug, order_auto_pos FROM client_profiles WHERE team_id = ${u.team_id}` as any[];
    const [m] = await sql`
      SELECT COUNT(i.id)::int AS items,
             COUNT(i.id) FILTER (WHERE i.pos_product_id IS NOT NULL AND i.pos_product_id <> '')::int AS linked
      FROM menu_boards b
      JOIN menu_sections s ON s.board_id = b.id
      JOIN menu_items i ON i.section_id = s.id
      WHERE b.team_id = ${u.team_id} AND b.enabled IS NOT FALSE
        AND (${p?.menu_slug ?? null}::text IS NULL OR b.slug = ${p?.menu_slug ?? null})` as any[];
    pos = {
      connected: !!conn,
      autoPos: p?.order_auto_pos !== false,
      tables: Number(t?.active) || 0, tablesPaired: Number(t?.paired) || 0,
      items: Number(m?.items) || 0, itemsLinked: Number(m?.linked) || 0,
    };
  } catch { /* nezmigrované tabulky nesmí shodit celý příjem */ }

  const stuck = orders.filter(o => o.status !== 'declined' && !o.storyous_order_id).length;
  return NextResponse.json({ orders, reservations, newCount, today, pos, stuck });
}

export async function PATCH(req: NextRequest) {
  const u = await teamMember();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const id = parseInt(String(b.id), 10);

  // Opakované odeslání do kasy. Bez něj zůstala objednávka, kterou pokladna
  // zrovna nepřijala, navždy mimo terminál — stav „confirmed" už se znovu
  // potvrdit nedal.
  if (b.action === 'pos') {
    try {
      const r = await sendToPos(u.team_id, id);
      audit(u.team_id, u.id, 'client.order.pos', 'client', id, r.posNote ?? '');
      return NextResponse.json({ ok: r.posOk, ...r });
    } catch (e: any) {
      return NextResponse.json({ error: String(e?.message ?? 'Nepovedlo se.').slice(0, 160) }, { status: 400 });
    }
  }

  const next = String(b.status ?? '');
  if (!['confirmed', 'declined', 'done'].includes(next)) return NextResponse.json({ error: 'Neznámý stav' }, { status: 400 });
  try {
    const r = await setOrderStatus(u.team_id, id, next);
    audit(u.team_id, u.id, 'client.order', 'client', id, `objednávka → ${next}${r.posNote ? ` · ${r.posNote}` : ''}`);
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? 'Nepovedlo se.').slice(0, 160) }, { status: 400 });
  }
}
