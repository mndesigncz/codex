// Rezervace očima vedení: požadavky, potvrzené, dnešek. Přechody stavů:
// requested → confirmed | declined → seated → done; cancelled ruší host.
// Usazení s napojenou pokladnou otevře účet na stole (Reservations API).
import { NextRequest, NextResponse } from 'next/server';
import { sql, ensureProfile, stampVisit } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { getConnection, seatReservation, StoryousError } from '@/lib/storyous';
import { notifyUser } from '@/lib/push';
import { pragueToday, dayPlus } from '@/lib/pragueTime';
import { audit } from '@/lib/audit';
import { aktivniBonus } from '@/lib/bonusAkceDb';
import { pripisBodyZaRezervaci } from '@/lib/bodyZdrojeDb';
import { poznamkaRazitek } from '@/lib/bonusAkce';
import { tierForMember, tierRulesFromProfile, zpravaHostoviORezervaci } from '@/lib/clientSlots';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const FLOW: Record<string, string[]> = {
  requested: ['confirmed', 'declined'],
  confirmed: ['seated', 'declined', 'done'],
  seated: ['done'],
};

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('rezervace.zobrazit');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  // Sdílený tablet za barem (systémová role Kiosk) má rezervace.zobrazit
  // kvůli dnešnímu příjmu hostů. Dřív tuhle routu vůbec neviděl (hlídal ji
  // employer()) a rezervace znal jen z dnešního inboxu — historie 100
  // minulých a 60 dní dopředu s poznámkami hostů na zařízení, ke kterému
  // má přístup každý u baru, nepatří. Proto jen dnešek a bez poznámky.
  const tablet = ctx.role.typ === 'kiosk';
  const range = tablet ? 'today' : String(new URL(req.url).searchParams.get('range') ?? 'upcoming');
  const today = pragueToday();
  const rows = range === 'today'
    ? await sql`SELECT r.*, us.name AS customer_name, us.email AS customer_email, us.phone AS customer_phone, t.name AS table_name FROM client_reservations r JOIN users us ON us.id = r.customer_id LEFT JOIN client_tables t ON t.id = r.table_id WHERE r.team_id = ${u.team_id} AND r.date = ${today} ORDER BY r.time`
    : range === 'past'
    ? await sql`SELECT r.*, us.name AS customer_name, us.email AS customer_email, us.phone AS customer_phone, t.name AS table_name FROM client_reservations r JOIN users us ON us.id = r.customer_id LEFT JOIN client_tables t ON t.id = r.table_id WHERE r.team_id = ${u.team_id} AND r.date < ${today} ORDER BY r.date DESC, r.time DESC LIMIT 100`
    : await sql`SELECT r.*, us.name AS customer_name, us.email AS customer_email, us.phone AS customer_phone, t.name AS table_name FROM client_reservations r JOIN users us ON us.id = r.customer_id LEFT JOIN client_tables t ON t.id = r.table_id WHERE r.team_id = ${u.team_id} AND r.date >= ${today} AND r.date <= ${dayPlus(today, 60)} ORDER BY r.date, r.time`;
  const tables = await sql`SELECT id, name, seats, storyous_desk_id FROM client_tables WHERE team_id = ${u.team_id} AND active = TRUE ORDER BY position, id`;
  // Kdo vidí rezervace, nemusí vidět kontakt na hosta — e-mail a telefon jsou
  // osobní údaje a patří jen tomu, kdo smí hostům psát (zakaznici.kontakty).
  const kontakty = ctx.role.opravneni.has('zakaznici.kontakty');
  const kontext = await kontextHostu(u.team_id, rows as any[], {
    // Úroveň a počet návštěv jsou údaje z Zákazníků; tablet za barem je nemá (zakaznici.zobrazit).
    hoste: ctx.role.opravneni.has('zakaznici.zobrazit'),
    // Interní poznámka personálu k hostovi: jen se zakaznici.poznamky a nikdy na sdíleném tabletu.
    poznamky: !tablet && ctx.role.opravneni.has('zakaznici.poznamky'),
  });
  const reservations = (rows as any[]).map(r => {
    const out: Record<string, any> = { ...r, ...(kontext.get(Number(r.customer_id)) ?? {}) };
    if (!kontakty) { delete out.customer_email; delete out.customer_phone; }
    if (tablet) delete out.note;
    return out;
  });
  return NextResponse.json({ reservations, tables, today });
}

/**
 * Kdo host je: počet návštěv a úroveň (pravidla podniku, stejně jako Zákazníci › Členové)
 * a poslední poznámka personálu. Jen pro hosty s účtem; ručně zapsaný host bez členství
 * nic nedostane. Nezmigrované sloupce (útrata, poznámky) seznam rezervací neshodí.
 */
async function kontextHostu(teamId: number, rows: any[], smi: { hoste: boolean; poznamky: boolean }) {
  const out = new Map<number, Record<string, unknown>>();
  const ids = [...new Set(rows.map(r => Number(r.customer_id)).filter(n => Number.isInteger(n) && n > 0))];
  if (!ids.length) return out;
  const pridej = (id: number, x: Record<string, unknown>) => out.set(id, { ...(out.get(id) ?? {}), ...x });
  if (smi.hoste) {
    try {
      const pravidla = tierRulesFromProfile(await ensureProfile(teamId));
      const clenove = await sql`
        SELECT customer_id, visits, spend, last_visit_at FROM client_memberships
        WHERE team_id = ${teamId} AND customer_id = ANY(${ids})` as any[];
      for (const m of clenove) {
        const t = tierForMember({ visits: m.visits, spend: m.spend, lastVisitAt: m.last_visit_at }, pravidla);
        pridej(Number(m.customer_id), { customer_visits: Number(m.visits) || 0, customer_level: t.id, customer_level_label: t.label });
      }
    } catch (e) { console.error('[rezervace] kontext hostů', e); }
  }
  if (smi.poznamky) {
    try {
      const poznamky = await sql`
        SELECT DISTINCT ON (customer_id) customer_id, body FROM client_member_notes
        WHERE team_id = ${teamId} AND customer_id = ANY(${ids})
        ORDER BY customer_id, created_at DESC, id DESC` as any[];
      for (const n of poznamky) pridej(Number(n.customer_id), { staff_note: String(n.body ?? '') });
    } catch (e) { console.error('[rezervace] poznámky personálu', e); }
  }
  return out;
}

export async function PATCH(req: NextRequest) {
  const ctx = await pozaduj(['rezervace.schvalovat', 'rezervace.usadit']);
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const b = await req.json().catch(() => ({}));
  // Potvrdit/odmítnout je rozhodnutí o kapacitě podniku (a jde z něj
  // upozornění hostovi); usadit, přidělit stůl a uzavřít je práce u dveří.
  // Jsou to různá oprávnění, takže se kontroluje každá část požadavku zvlášť
  // a chybí-li kterákoli, neuloží se nic.
  const chce = b.status ? String(b.status) : null;
  const potreba = new Set<string>();
  if (chce === 'confirmed' || chce === 'declined') potreba.add('rezervace.schvalovat');
  else if (chce) potreba.add('rezervace.usadit');
  if (b.tableId !== undefined) potreba.add('rezervace.usadit');
  if (potreba.has('rezervace.schvalovat') && !ctx.role.opravneni.has('rezervace.schvalovat')) {
    return NextResponse.json({ error: 'Potvrzovat a odmítat rezervace nemáš povoleno.' }, { status: 403 });
  }
  if (potreba.has('rezervace.usadit') && !ctx.role.opravneni.has('rezervace.usadit')) {
    return NextResponse.json({ error: 'Usazovat hosty a přidělovat stoly nemáš povoleno.' }, { status: 403 });
  }
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
  let bodyRezervace = 0;
  if (next === 'done') {
    const profile = await ensureProfile(u.team_id);
    if (profile.loyalty_on) {
      const bonus = await aktivniBonus(u.team_id);
      loyalty = await stampVisit(u.team_id, Number(r.customer_id), profile, `res:${r.id}`, bonus.razitka, poznamkaRazitek(bonus));
      // Body za rezervaci, která proběhla (nastavení podniku; jednou za rezervaci). Selhání bodů uzavření rezervace nezastaví.
      try { bodyRezervace = await pripisBodyZaRezervaci(u.team_id, Number(r.id), Number(r.customer_id)); } catch (e) { console.error('[rezervace] body', e); }
    }
  }
  if (next === 'confirmed' || next === 'declined') {
    notifyUser(Number(r.customer_id), zpravaHostoviORezervaci(next, String(r.date), String(r.time))).catch(() => {});
  }
  audit(u.team_id, u.id, 'client.reservation', 'client', id, `${r.customer_name} · ${r.date} ${r.time} → ${status}`);
  return NextResponse.json({ ok: true, status, tableId, posNote, loyalty, bodyRezervace });
}
