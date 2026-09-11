// Objednávka od stolu: společná logika pro hosta, obsluhu i vedení.
//
// Tok: host pošle objednávku (new) → obsluha ji do pěti minut potvrdí
// (confirmed) nebo odmítne (declined) → připraví a označí hotovou (done).
// Při potvrzení s napojenou pokladnou se objednávka zapíše přes Delivery API
// na stůl, který pokladna zná, takže obsluha markuje z jednoho místa.
// Hotová objednávka připíše body za útratu a razítko za návštěvu (nejvýš
// jedno denně, ať tři čaje nejsou tři návštěvy).

import { sql, award, stampVisit, notifyTeamEmployers, ensureProfile } from './client';
import { getConnection, createTableOrder, tableOrderState, StoryousError } from './storyous';
import { notifyUser } from './push';
import { pragueToday, pragueDayOf, parseDbTime } from './pragueTime';

export interface OrderLineIn { id: number; count: number }
export interface OrderLine { itemId: number; name: string; price: number; count: number; posProductId: string | null }

/** Položky objednávky ověřené proti nabídce podniku — ceny z databáze, ne od hosta. */
export async function buildLines(teamId: number, menuSlug: string | null, lines: OrderLineIn[]): Promise<{ lines: OrderLine[]; total: number; error?: string }> {
  const ids = Array.from(new Set(lines.map(l => Math.trunc(Number(l.id))).filter(n => n > 0))).slice(0, 40);
  if (!ids.length) return { lines: [], total: 0, error: 'Vyber aspoň jednu položku.' };
  const [board] = menuSlug
    ? await sql`SELECT id FROM menu_boards WHERE team_id = ${teamId} AND slug = ${menuSlug} AND enabled IS NOT FALSE ORDER BY id LIMIT 1`
    : await sql`SELECT id FROM menu_boards WHERE team_id = ${teamId} AND enabled IS NOT FALSE ORDER BY id LIMIT 1`;
  if (!board) return { lines: [], total: 0, error: 'Podnik nemá zveřejněnou nabídku.' };
  const rows = await sql`
    SELECT i.id, i.name, i.price, i.sold_out, i.pos_product_id FROM menu_items i
    JOIN menu_sections s ON s.id = i.section_id WHERE s.board_id = ${board.id} AND i.id = ANY(${ids})` as any[];
  const byId = new Map(rows.map(r => [Number(r.id), r]));
  const out: OrderLine[] = [];
  for (const l of lines) {
    const r = byId.get(Math.trunc(Number(l.id)));
    if (!r) continue;
    if (r.sold_out) return { lines: [], total: 0, error: `${r.name} je vyprodáno.` };
    const count = Math.max(1, Math.min(20, Math.trunc(Number(l.count)) || 1));
    out.push({ itemId: Number(r.id), name: String(r.name), price: Number(r.price) || 0, count, posProductId: r.pos_product_id ? String(r.pos_product_id) : null });
  }
  if (!out.length) return { lines: [], total: 0, error: 'Položky z nabídky nesedí, obnov stránku.' };
  return { lines: out, total: out.reduce((a, l) => a + l.price * l.count, 0) };
}

export const ORDER_FLOW: Record<string, string[]> = { new: ['confirmed', 'declined'], confirmed: ['done', 'declined'] };

/**
 * Změna stavu objednávky obsluhou. Potvrzení pošle objednávku do pokladny,
 * hotovo připíše věrnost. Vrací poznámku o pokladně pro obrazovku.
 */
export async function setOrderStatus(teamId: number, id: number, next: string): Promise<{ status: string; posNote: string | null; loyalty: any }> {
  const [o] = await sql`SELECT o.*, us.name AS customer_name, t.storyous_desk_id FROM client_orders o JOIN users us ON us.id = o.customer_id LEFT JOIN client_tables t ON t.id = o.table_id WHERE o.id = ${id} AND o.team_id = ${teamId}`;
  if (!o) throw new Error('Objednávka nenalezena');
  const cur = String(o.status);
  if (!(ORDER_FLOW[cur] ?? []).includes(next)) throw new Error(`Z „${cur}" nejde na „${next}".`);

  let posNote: string | null = null;
  let storyousId: string | null = o.storyous_order_id ?? null;
  let posState: string | null = o.pos_state ?? null;
  if (next === 'confirmed' && !storyousId) {
    const conn = await getConnection(teamId);
    const lines = (o.items as any[]) ?? [];
    const posLines = lines.filter(l => l.posProductId);
    if (conn && o.storyous_desk_id && posLines.length === lines.length) {
      try {
        const r = await createTableOrder(conn, {
          externalId: o.external_id || `mgr-ord-${o.id}`, deskId: String(o.storyous_desk_id), customerName: String(o.customer_name),
          note: o.note ?? null, items: lines.map(l => ({ itemId: String(l.posProductId), count: Number(l.count), unitPriceWithVat: Number(l.price) })),
        });
        storyousId = r.orderId; posState = r.state; posNote = 'Objednávka je v pokladně na stole.';
      } catch (e) {
        posNote = e instanceof StoryousError ? `Pokladna objednávku nepřijala: ${e.message}` : 'Pokladna objednávku nepřijala.';
      }
    } else if (conn && !o.storyous_desk_id) {
      posNote = 'Stůl není spárovaný s pokladnou, objednávka zůstává jen tady.';
    } else if (conn && posLines.length !== lines.length) {
      posNote = 'Některé položky nemají produkt v pokladně, objednávka zůstává jen tady.';
    }
  }
  await sql`UPDATE client_orders SET status = ${next}, storyous_order_id = ${storyousId}, pos_state = ${posState}, updated_at = NOW() WHERE id = ${id}`;

  let loyalty: any = null;
  if (next === 'done') {
    const profile = await ensureProfile(teamId);
    if (profile.loyalty_on) {
      const pts = Math.floor(Number(o.total) / 100) * (Number(profile.points_per_100) || 0);
      const points = pts > 0 ? await award(teamId, Number(o.customer_id), pts, 'order', `ord:${o.id}`, `Útrata ${o.total} Kč`) : null;
      const [m] = await sql`SELECT last_visit_at FROM client_memberships WHERE customer_id = ${o.customer_id} AND team_id = ${teamId}`;
      // Ovladač vrací TIMESTAMP jako Date, ne text — porovnává se pražský den,
      // ne prvních deset znaků řetězce.
      const last = parseDbTime(m?.last_visit_at);
      const visitedToday = !!last && pragueDayOf(last) === pragueToday();
      const stamp = visitedToday ? null : await stampVisit(teamId, Number(o.customer_id), profile, `ord:${o.id}`);
      loyalty = { points, pts, stamp };
    }
  }
  const msg = next === 'confirmed' ? 'Objednávku připravujeme.' : next === 'declined' ? 'Objednávku teď bohužel nezvládneme.' : 'Objednávka je hotová.';
  notifyUser(Number(o.customer_id), { title: msg, body: `${(o.items as any[]).map((l: any) => `${l.count}× ${l.name}`).join(', ')}`, link: '/client/me', type: next === 'declined' ? 'info' : 'success' }).catch(() => {});
  return { status: next, posNote, loyalty };
}

/** Dotáhne stav z pokladny pro potvrzenou objednávku (pokladna může zamítnout). */
export async function refreshPosState(teamId: number, order: any): Promise<string | null> {
  if (!order?.storyous_order_id || order.status !== 'confirmed') return order?.pos_state ?? null;
  try {
    const conn = await getConnection(teamId);
    if (!conn) return order.pos_state ?? null;
    const st = await tableOrderState(conn, String(order.storyous_order_id));
    if (st && st !== order.pos_state) {
      await sql`UPDATE client_orders SET pos_state = ${st}${st === 'DECLINED' ? sql`, status = 'declined'` : sql``} WHERE id = ${order.id}`;
    }
    return st ?? order.pos_state ?? null;
  } catch { return order.pos_state ?? null; }
}

export async function notifyNewOrder(teamId: number, customerName: string, tableName: string | null, total: number, id: number) {
  await notifyTeamEmployers(teamId, {
    title: 'Nová objednávka od stolu',
    body: `${customerName}${tableName ? ` · ${tableName}` : ''} · ${total} Kč`,
    link: '/employer/overview?mode=client&tab=orders', type: 'info',
  });
  void id;
}
