// Rezervace očima vedení: požadavky, potvrzené, dnešek. Přechody stavů:
// requested → confirmed | declined → seated → done; cancelled ruší host.
// Usazení s napojenou pokladnou otevře účet na stole (Reservations API).
import { NextRequest, NextResponse } from 'next/server';
import { sql, employer, ensureProfile, stampVisit } from '@/lib/client';
import { getConnection, seatReservation, StoryousError } from '@/lib/storyous';
import { notifyUser } from '@/lib/push';
import { pragueToday, dayPlus } from '@/lib/pragueTime';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const FLOW: Record<string, string[]> = {
  requested: ['confirmed', 'declined'],
  confirmed: ['seated', 'declined', 'done'],
  seated: ['done'],
};

export async function GET(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const range = String(new URL(req.url).searchParams.get('range') ?? 'upcoming');
  const today = pragueToday();
  const rows = range === 'today'
    ? await sql`SELECT r.*, us.name AS customer_name, us.email AS customer_email, t.name AS table_name FROM client_reservations r JOIN users us ON us.id = r.customer_id LEFT JOIN client_tables t ON t.id = r.table_id WHERE r.team_id = ${u.team_id} AND r.date = ${today} ORDER BY r.time`
    : range === 'past'
    ? await sql`SELECT r.*, us.name AS customer_name, us.email AS customer_email, t.name AS table_name FROM client_reservations r JOIN users us ON us.id = r.customer_id LEFT JOIN client_tables t ON t.id = r.table_id WHERE r.team_id = ${u.team_id} AND r.date < ${today} ORDER BY r.date DESC, r.time DESC LIMIT 100`
    : await sql`SELECT r.*, us.name AS customer_name, us.email AS customer_email, t.name AS table_name FROM client_reservations r JOIN users us ON us.id = r.customer_id LEFT JOIN client_tables t ON t.id = r.table_id WHERE r.team_id = ${u.team_id} AND r.date >= ${today} AND r.date <= ${dayPlus(today, 60)} ORDER BY r.date, r.time`;
  const tables = await sql`SELECT id, name, seats, storyous_desk_id FROM client_tables WHERE team_id = ${u.team_id} AND active = TRUE ORDER BY position, id`;
  return NextResponse.json({ reservations: rows, tables, today });
}

export async function PATCH(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const id = parseInt(String(b.id), 10);
  const [r] = await sql`SELECT r.*, us.name AS customer_name FROM client_reservations r JOIN users us ON us.id = r.customer_id WHERE r.id = ${id} AND r.team_id = ${u.team_id}`;
  if (!r) return NextResponse.json({ error: 'Rezervace nenalezena' }, { status: 404 });

  let tableId: number | null = r.table_id ?? null;
  if (b.tableId !== undefined) {
    tableId = b.tableId ? parseInt(String(b.tableId), 10) : null;
    if (tableId) {
      const [t] = await sql`SELECT id FROM client_tables WHERE id = ${tableId} AND team_id = ${u.team_id}`;
      if (!t) return NextResponse.json({ error: 'Stůl nenalezen' }, { status: 400 });
    }
  }
  let status = String(r.status);
  const next = b.status ? String(b.status) : null;
  if (next && next !== status) {
    if (!(FLOW[status] ?? []).includes(next)) return NextResponse.json({ error: `Z „${status}" nejde na „${next}".` }, { status: 400 });
    status = next;
  }

  let posNote: string | null = null;
  let storyousId: string | null = r.storyous_reservation_id ?? null;
  if (next === 'seated' && !storyousId) {
    // Otevřít účet na stole v pokladně — jen když stůl známe i v ní.
    const conn = await getConnection(u.team_id);
    const [t] = tableId ? await sql`SELECT storyous_desk_id FROM client_tables WHERE id = ${tableId}` : [null as any];
    if (conn && t?.storyous_desk_id) {
      try {
        const s = await seatReservation(conn, { externalReservationId: `mgr-res-${r.id}`, name: String(r.customer_name), deskId: String(t.storyous_desk_id) });
        storyousId = s.reservationId ?? `mgr-res-${r.id}`;
        posNote = 'Účet na stole otevřen v pokladně.';
      } catch (e) {
        posNote = e instanceof StoryousError ? `Pokladna účet neotevřela: ${e.message}` : 'Pokladna účet neotevřela.';
      }
    }
  }

  await sql`UPDATE client_reservations SET status = ${status}, table_id = ${tableId}, storyous_reservation_id = ${storyousId}, updated_at = NOW() WHERE id = ${id}`;

  let loyalty: any = null;
  if (next === 'done') {
    const profile = await ensureProfile(u.team_id);
    if (profile.loyalty_on) loyalty = await stampVisit(u.team_id, Number(r.customer_id), profile, `res:${r.id}`);
  }
  if (next === 'confirmed' || next === 'declined') {
    const when = `${String(r.date).split('-').reverse().join('. ')} ${r.time}`;
    notifyUser(Number(r.customer_id), {
      title: next === 'confirmed' ? 'Rezervace potvrzena' : 'Rezervaci se nepodařilo přijmout',
      body: next === 'confirmed' ? `Těšíme se ${when}.` : `Na ${when} bohužel nemáme místo.`,
      link: '/client/me', type: next === 'confirmed' ? 'success' : 'info',
    }).catch(() => {});
  }
  audit(u.team_id, u.id, 'client.reservation', 'client', id, `${r.customer_name} · ${r.date} ${r.time} → ${status}`);
  return NextResponse.json({ ok: true, status, tableId, posNote, loyalty });
}
