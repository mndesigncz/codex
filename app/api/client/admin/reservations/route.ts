// Rezervace očima vedení: požadavky, potvrzené, dnešek. Přechody stavů:
// requested → confirmed | declined → seated → done; cancelled ruší host.
// Usazení s napojenou pokladnou otevře účet na stole (Reservations API).
// Obsluha zapíše rezervaci i sama (POST, kolo 7): host z telefonu nebo od dveří
// nemusí mít účet — customer_id je pak NULL a jméno s telefonem nese rezervace.
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
import { tierForMember, tierRulesFromProfile, validujRucniRezervaci, zpravaHostoviORezervaci } from '@/lib/clientSlots';

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
    ? await sql`SELECT r.*, COALESCE(us.name, r.guest_name) AS customer_name, us.email AS customer_email, COALESCE(NULLIF(us.phone, ''), r.guest_phone) AS customer_phone, t.name AS table_name FROM client_reservations r LEFT JOIN users us ON us.id = r.customer_id LEFT JOIN client_tables t ON t.id = r.table_id WHERE r.team_id = ${u.team_id} AND r.date = ${today} ORDER BY r.time`
    : range === 'past'
    ? await sql`SELECT r.*, COALESCE(us.name, r.guest_name) AS customer_name, us.email AS customer_email, COALESCE(NULLIF(us.phone, ''), r.guest_phone) AS customer_phone, t.name AS table_name FROM client_reservations r LEFT JOIN users us ON us.id = r.customer_id LEFT JOIN client_tables t ON t.id = r.table_id WHERE r.team_id = ${u.team_id} AND r.date < ${today} ORDER BY r.date DESC, r.time DESC LIMIT 100`
    : await sql`SELECT r.*, COALESCE(us.name, r.guest_name) AS customer_name, us.email AS customer_email, COALESCE(NULLIF(us.phone, ''), r.guest_phone) AS customer_phone, t.name AS table_name FROM client_reservations r LEFT JOIN users us ON us.id = r.customer_id LEFT JOIN client_tables t ON t.id = r.table_id WHERE r.team_id = ${u.team_id} AND r.date >= ${today} AND r.date <= ${dayPlus(today, 60)} ORDER BY r.date, r.time`;
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
    // Telefon ručně zapsaného hosta je kontakt stejně jako e-mail.
    delete out.guest_phone;
    if (!kontakty) { delete out.customer_email; delete out.customer_phone; }
    if (tablet) delete out.note;
    return out;
  });
  // Okno „Nová rezervace" potřebuje otevírací dobu a meze podniku. Profil (/api/client/admin/profile)
  // chce klient.nastaveni, které Provozní nemá, i když rezervace zapisovat smí — proto to jde odsud,
  // jen tomu, kdo zapisovat smí.
  let zapis: Record<string, unknown> | null = null;
  if (ctx.role.opravneni.has('rezervace.schvalovat')) {
    const [n] = await sql`
      SELECT t.opening_hours, p.max_party, p.lead_days, p.slot_minutes
      FROM teams t LEFT JOIN client_profiles p ON p.team_id = t.id WHERE t.id = ${u.team_id}` as any[];
    zapis = { opening_hours: n?.opening_hours ?? {}, max_party: Number(n?.max_party) || 8, lead_days: Number(n?.lead_days) || 30, slot_minutes: Number(n?.slot_minutes) || 30 };
  }
  return NextResponse.json({ reservations, tables, today, zapis });
}

/**
 * Obsluha zapíše rezervaci za hosta, který zavolal nebo stojí u dveří. Vzniká rovnou
 * potvrzená (rozhodnutí o kapacitě = rezervace.schvalovat), volitelně napojená na člena.
 */
export async function POST(req: NextRequest) {
  const ctx = await pozaduj('rezervace.schvalovat');
  if (jeOdpoved(ctx)) return ctx;
  const teamId = ctx.teamId;
  const b = await req.json().catch(() => ({}));
  const profil = await ensureProfile(teamId);
  const [tym] = await sql`SELECT opening_hours FROM teams WHERE id = ${teamId}` as any[];
  const dnes = pragueToday();
  const v = validujRucniRezervaci(b && typeof b === 'object' ? b : {}, {
    dnes, nejpozdeji: dayPlus(dnes, Number(profil.lead_days) || 30), maxOsob: Number(profil.max_party) || 8, hodiny: tym?.opening_hours,
  });
  if (!v.ok) return NextResponse.json({ error: v.chyba, pole: v.pole }, { status: 400 });
  const d = v.data;
  if (d.stulId) {
    const [t] = await sql`SELECT id FROM client_tables WHERE id = ${d.stulId} AND team_id = ${teamId} AND active = TRUE`;
    if (!t) return NextResponse.json({ error: 'Stůl v podniku není.', pole: 'tableId' }, { status: 400 });
  }
  // Napojit jde jen člena tohohle podniku — cizí id by jinak poslalo oznámení komukoli.
  if (d.hostId) {
    const [m] = await sql`SELECT customer_id FROM client_memberships WHERE team_id = ${teamId} AND customer_id = ${d.hostId}`;
    if (!m) return NextResponse.json({ error: 'Host není členem podniku.', pole: 'customerId' }, { status: 400 });
  }
  // Dvojí zápis téhož (dva lidé u telefonu, dvojklik): stejný čas a stejný host —
  // u člena podle účtu, u ručního podle jména nebo telefonu.
  const telCisla = d.telefon ? d.telefon.replace(/[^\d+]/g, '') : null;
  const [dup] = d.hostId
    ? await sql`
        SELECT id FROM client_reservations WHERE team_id = ${teamId} AND customer_id = ${d.hostId}
          AND date = ${d.datum} AND time = ${d.cas} AND status NOT IN ('cancelled','declined')`
    : await sql`
        SELECT id FROM client_reservations WHERE team_id = ${teamId} AND customer_id IS NULL
          AND date = ${d.datum} AND time = ${d.cas} AND status NOT IN ('cancelled','declined')
          AND (lower(guest_name) = lower(${d.jmeno}) OR (${telCisla}::text IS NOT NULL AND regexp_replace(COALESCE(guest_phone, ''), '[^0-9+]', '', 'g') = ${telCisla}))`;
  if (dup) return NextResponse.json({ error: 'Tenhle host už má na tenhle čas rezervaci.' }, { status: 409 });
  let r: any;
  try {
    [r] = await sql`
      INSERT INTO client_reservations (team_id, customer_id, guest_name, guest_phone, date, time, party, note, table_id, status, created_by)
      VALUES (${teamId}, ${d.hostId}, ${d.jmeno}, ${d.telefon}, ${d.datum}, ${d.cas}, ${d.osob}, ${d.poznamka}, ${d.stulId}, 'confirmed', ${ctx.meId})
      RETURNING id, date, time, party, note, status, table_id, customer_id, guest_name`;
  } catch (e: any) {
    if (String(e?.message ?? '').toLowerCase().includes('unique') || e?.code === '23505') {
      return NextResponse.json({ error: 'Tenhle host už má na tenhle čas rezervaci.' }, { status: 409 });
    }
    throw e;
  }
  await audit(teamId, ctx.meId, 'rezervace.zapsat', 'reservation', Number(r.id),
    `${d.jmeno} · ${d.datum} ${d.cas} · ${d.osob} os.${d.hostId ? ' · člen' : ''}${d.stulId ? ' · se stolem' : ''}`);
  if (d.hostId) notifyUser(d.hostId, zpravaHostoviORezervaci('confirmed', d.datum, d.cas)).catch(() => {});
  return NextResponse.json({ ok: true, reservation: r });
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
  // Ručně zapsaná rezervace nemusí mít účet hosta — jméno nese sama (guest_name).
  const [r] = await sql`SELECT r.*, COALESCE(us.name, r.guest_name) AS customer_name FROM client_reservations r LEFT JOIN users us ON us.id = r.customer_id WHERE r.id = ${id} AND r.team_id = ${u.team_id}`;
  const hostId = r?.customer_id == null ? null : Number(r.customer_id);
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
        const s = await seatReservation(conn, { externalReservationId: `mgr-res-${r.id}`, name: String(r.customer_name ?? 'Host'), deskId: String(t.storyous_desk_id) });
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
  // Razítka a body jen hostovi s účtem; ručně zapsaný host bez členství nemá komu je připsat.
  if (next === 'done' && hostId) {
    const profile = await ensureProfile(u.team_id);
    if (profile.loyalty_on) {
      const bonus = await aktivniBonus(u.team_id);
      loyalty = await stampVisit(u.team_id, hostId, profile, `res:${r.id}`, bonus.razitka, poznamkaRazitek(bonus));
      // Body za rezervaci, která proběhla (nastavení podniku; jednou za rezervaci). Selhání bodů uzavření rezervace nezastaví.
      try { bodyRezervace = await pripisBodyZaRezervaci(u.team_id, Number(r.id), hostId); } catch (e) { console.error('[rezervace] body', e); }
    }
  }
  if ((next === 'confirmed' || next === 'declined') && hostId) {
    notifyUser(hostId, zpravaHostoviORezervaci(next, String(r.date), String(r.time))).catch(() => {});
  }
  audit(u.team_id, u.id, 'client.reservation', 'client', id, `${r.customer_name} · ${r.date} ${r.time} → ${status}`);
  return NextResponse.json({ ok: true, status, tableId, posNote, loyalty, bodyRezervace });
}
