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
import { cisliceTelefonu, HLEDANI_MIN } from '@/lib/klientPrehled';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const FLOW: Record<string, string[]> = {
  requested: ['confirmed', 'declined'],
  // Kolo 8 (R8-7): „Nedorazil" (no_show) je práce u dveří jako usazení; omyl jde vrátit na potvrzeno.
  confirmed: ['seated', 'declined', 'done', 'no_show'],
  seated: ['done'],
  no_show: ['confirmed'],
};

/** Nejvíc řádků v Minulých a v hledání najednou — oříznutí se hlásí (`celkem`), neschovává. */
const STRANKA_VYCHOZI = 100;
const STRANKA_MAX = 500;
const HLEDANI_MAX = 50;

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('rezervace.zobrazit');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const q = new URL(req.url).searchParams;
  // Sdílený tablet za barem (systémová role Kiosk) má rezervace.zobrazit
  // kvůli dnešnímu příjmu hostů. Dřív tuhle routu vůbec neviděl (hlídal ji
  // employer()) a rezervace znal jen z dnešního inboxu — historie 100
  // minulých a 60 dní dopředu s poznámkami hostů na zařízení, ke kterému
  // má přístup každý u baru, nepatří. Proto jen dnešek a bez poznámky.
  const tablet = ctx.role.typ === 'kiosk';
  const today = pragueToday();
  // Kolo 8 (R8-7): hledání podle jména nebo telefonu (?q=), skok na den (?date=), tečky
  // v kalendáři (?month=), historie jednoho hosta (?customer=), stránkování Minulých (?limit=&offset=)
  // a filtr „Nedorazili" (?status=no_show). Tablet má pořád jen dnešek.
  const hledat = tablet ? '' : String(q.get('q') ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const den = !tablet && /^\d{4}-\d{2}-\d{2}$/.test(String(q.get('date') ?? '')) ? String(q.get('date')) : null;
  const mesic = !tablet && /^\d{4}-\d{2}$/.test(String(q.get('month') ?? '')) ? String(q.get('month')) : null;
  const host = !tablet ? parseInt(String(q.get('customer') ?? ''), 10) : NaN;
  const range = tablet ? 'today' : String(q.get('range') ?? 'upcoming');
  const limit = Math.min(STRANKA_MAX, Math.max(1, parseInt(String(q.get('limit') ?? ''), 10) || STRANKA_VYCHOZI));
  const offset = Math.max(0, parseInt(String(q.get('offset') ?? ''), 10) || 0);
  const jenNedorazili = q.get('status') === 'no_show';

  if (mesic) {
    // Kalendář: kolik živých rezervací má který den měsíce (zrušené, nepřijaté a nedorazivší ne).
    const od = `${mesic}-01`, doo = `${mesic}-31`;
    const dny = await sql`
      SELECT date, COUNT(*)::int AS n FROM client_reservations
      WHERE team_id = ${u.team_id} AND date >= ${od} AND date <= ${doo} AND status NOT IN ('declined','cancelled','no_show')
      GROUP BY date ORDER BY date` as any[];
    return NextResponse.json({ month: mesic, days: Object.fromEntries(dny.map(d => [String(d.date), Number(d.n) || 0])) });
  }

  if (Number.isInteger(host) && host > 0) {
    // Historie hosta pro detail člena: kolik rezervací měl, kolikrát nedorazil, kolik proběhlo.
    const [s] = await sql`
      SELECT COUNT(*)::int AS celkem,
             COUNT(*) FILTER (WHERE status = 'no_show')::int AS nedorazeni,
             COUNT(*) FILTER (WHERE status = 'done')::int AS probehlo,
             MAX(date) FILTER (WHERE status IN ('done','seated','no_show')) AS posledni
      FROM client_reservations WHERE team_id = ${u.team_id} AND customer_id = ${host}` as any[];
    const rows = await sql`
      SELECT r.id, r.date, r.time, r.party, r.status, t.name AS table_name
      FROM client_reservations r LEFT JOIN client_tables t ON t.id = r.table_id
      WHERE r.team_id = ${u.team_id} AND r.customer_id = ${host} ORDER BY r.date DESC, r.time DESC LIMIT 20` as any[];
    return NextResponse.json({ reservations: rows, souhrn: { celkem: Number(s?.celkem) || 0, nedorazeni: Number(s?.nedorazeni) || 0, probehlo: Number(s?.probehlo) || 0, posledni: s?.posledni ?? null } });
  }

  const cislice = cisliceTelefonu(hledat);
  const vzor = `%${hledat.replace(/[%_\\]/g, '')}%`;
  const vzorCislic = cislice.length >= 3 ? `%${cislice}%` : null;
  let rows: any[];
  let celkem: number | null = null;
  let pocty: { celkem: number; nedorazeni: number } | null = null;
  if (hledat.length >= HLEDANI_MIN) {
    // Hledá se ve všech rezervacích (budoucích i minulých) podle jména hosta, jména zapsaného
    // ručně a telefonu (jen číslice, ať „776 221 004" najde „+420776221004"). Nejdřív budoucí
    // od nejbližší, pak minulé od nejnovější.
    rows = await sql`
      SELECT r.*, COALESCE(us.name, r.guest_name) AS customer_name, us.email AS customer_email, COALESCE(NULLIF(us.phone, ''), r.guest_phone) AS customer_phone, t.name AS table_name
      FROM client_reservations r LEFT JOIN users us ON us.id = r.customer_id LEFT JOIN client_tables t ON t.id = r.table_id
      WHERE r.team_id = ${u.team_id}
        AND (COALESCE(us.name, r.guest_name, '') ILIKE ${vzor}
          OR (${vzorCislic}::text IS NOT NULL AND regexp_replace(COALESCE(NULLIF(us.phone, ''), r.guest_phone, ''), '[^0-9]', '', 'g') LIKE ${vzorCislic}))
      ORDER BY (r.date >= ${today}) DESC, CASE WHEN r.date >= ${today} THEN r.date END ASC, r.date DESC, r.time
      LIMIT ${HLEDANI_MAX}` as any[];
    const [n] = await sql`
      SELECT COUNT(*)::int AS n FROM client_reservations r LEFT JOIN users us ON us.id = r.customer_id
      WHERE r.team_id = ${u.team_id}
        AND (COALESCE(us.name, r.guest_name, '') ILIKE ${vzor}
          OR (${vzorCislic}::text IS NOT NULL AND regexp_replace(COALESCE(NULLIF(us.phone, ''), r.guest_phone, ''), '[^0-9]', '', 'g') LIKE ${vzorCislic}))` as any[];
    celkem = Number(n?.n) || rows.length;
  } else if (den) {
    rows = await sql`SELECT r.*, COALESCE(us.name, r.guest_name) AS customer_name, us.email AS customer_email, COALESCE(NULLIF(us.phone, ''), r.guest_phone) AS customer_phone, t.name AS table_name FROM client_reservations r LEFT JOIN users us ON us.id = r.customer_id LEFT JOIN client_tables t ON t.id = r.table_id WHERE r.team_id = ${u.team_id} AND r.date = ${den} ORDER BY r.time` as any[];
  } else if (range === 'today') {
    rows = await sql`SELECT r.*, COALESCE(us.name, r.guest_name) AS customer_name, us.email AS customer_email, COALESCE(NULLIF(us.phone, ''), r.guest_phone) AS customer_phone, t.name AS table_name FROM client_reservations r LEFT JOIN users us ON us.id = r.customer_id LEFT JOIN client_tables t ON t.id = r.table_id WHERE r.team_id = ${u.team_id} AND r.date = ${today} ORDER BY r.time` as any[];
  } else if (range === 'past') {
    // Minulé jsou oříznuté po stránkách; „Zobrazeno 100 z 240" říká celkem a filtr „Nedorazili" má svůj počet.
    rows = jenNedorazili
      ? await sql`SELECT r.*, COALESCE(us.name, r.guest_name) AS customer_name, us.email AS customer_email, COALESCE(NULLIF(us.phone, ''), r.guest_phone) AS customer_phone, t.name AS table_name FROM client_reservations r LEFT JOIN users us ON us.id = r.customer_id LEFT JOIN client_tables t ON t.id = r.table_id WHERE r.team_id = ${u.team_id} AND r.date < ${today} AND r.status = 'no_show' ORDER BY r.date DESC, r.time DESC LIMIT ${limit} OFFSET ${offset}` as any[]
      : await sql`SELECT r.*, COALESCE(us.name, r.guest_name) AS customer_name, us.email AS customer_email, COALESCE(NULLIF(us.phone, ''), r.guest_phone) AS customer_phone, t.name AS table_name FROM client_reservations r LEFT JOIN users us ON us.id = r.customer_id LEFT JOIN client_tables t ON t.id = r.table_id WHERE r.team_id = ${u.team_id} AND r.date < ${today} ORDER BY r.date DESC, r.time DESC LIMIT ${limit} OFFSET ${offset}` as any[];
    const [n] = await sql`
      SELECT COUNT(*)::int AS celkem, COUNT(*) FILTER (WHERE status = 'no_show')::int AS nedorazeni
      FROM client_reservations WHERE team_id = ${u.team_id} AND date < ${today}` as any[];
    pocty = { celkem: Number(n?.celkem) || 0, nedorazeni: Number(n?.nedorazeni) || 0 };
    celkem = jenNedorazili ? pocty.nedorazeni : pocty.celkem;
  } else {
    rows = await sql`SELECT r.*, COALESCE(us.name, r.guest_name) AS customer_name, us.email AS customer_email, COALESCE(NULLIF(us.phone, ''), r.guest_phone) AS customer_phone, t.name AS table_name FROM client_reservations r LEFT JOIN users us ON us.id = r.customer_id LEFT JOIN client_tables t ON t.id = r.table_id WHERE r.team_id = ${u.team_id} AND r.date >= ${today} AND r.date <= ${dayPlus(today, 60)} ORDER BY r.date, r.time` as any[];
  }
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
  return NextResponse.json({ reservations, tables, today, zapis, celkem: celkem ?? reservations.length, pocty });
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

/** Kolik poznámek personálu jede s řádkem rezervace (nejnovější první). */
const POZNAMEK_K_REZERVACI = 3;

/**
 * Kdo host je: počet návštěv, útrata a úroveň (pravidla podniku, stejně jako Zákazníci › Členové),
 * kolikrát nedorazil, jeho skupiny a poslední poznámky personálu. Jen pro hosty s účtem; ručně
 * zapsaný host bez členství nic nedostane. Nezmigrované sloupce (útrata, poznámky) seznam rezervací neshodí.
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
        pridej(Number(m.customer_id), { customer_visits: Number(m.visits) || 0, customer_spend: Number(m.spend) || 0, customer_level: t.id, customer_level_label: t.label });
      }
    } catch (e) { console.error('[rezervace] kontext hostů', e); }
    // Kolo 8 (R8-7): kolikrát host nedorazil a kolik rezervací celkem měl — „2× nedorazil" u další
    // rezervace, ať se host, který nepřišel potřetí, nepodobá štamgastovi.
    try {
      const nedorazeni = await sql`
        SELECT customer_id, COUNT(*)::int AS celkem, COUNT(*) FILTER (WHERE status = 'no_show')::int AS nedorazeni
        FROM client_reservations WHERE team_id = ${teamId} AND customer_id = ANY(${ids}) GROUP BY customer_id` as any[];
      for (const n of nedorazeni) pridej(Number(n.customer_id), { customer_no_shows: Number(n.nedorazeni) || 0, customer_reservations: Number(n.celkem) || 0 });
    } catch (e) { console.error('[rezervace] nedorazení', e); }
    // Skupiny hosta („VIP", „firemní akce") jako štítky v knize rezervací (SevenRooms tagy).
    try {
      const skupiny = await sql`
        SELECT gm.customer_id, g.name, g.color FROM client_group_members gm
        JOIN client_groups g ON g.id = gm.group_id AND g.team_id = gm.team_id
        WHERE gm.team_id = ${teamId} AND gm.customer_id = ANY(${ids}) AND g.archived = FALSE
        ORDER BY gm.customer_id, g.name` as any[];
      const poHostech = new Map<number, { name: string; color: string | null }[]>();
      for (const s of skupiny) { const id = Number(s.customer_id); if (!poHostech.has(id)) poHostech.set(id, []); poHostech.get(id)!.push({ name: String(s.name ?? ''), color: s.color ? String(s.color) : null }); }
      for (const [id, g] of poHostech) pridej(id, { customer_groups: g });
    } catch (e) { console.error('[rezervace] skupiny hostů', e); }
  }
  if (smi.poznamky) {
    try {
      // Poslední tři poznámky k hostovi: „alergie na ořechy" zapsaná minule se musí ukázat u dveří.
      const poznamky = await sql`
        SELECT customer_id, body FROM (
          SELECT customer_id, body, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at DESC, id DESC) AS poradi
          FROM client_member_notes WHERE team_id = ${teamId} AND customer_id = ANY(${ids})
        ) x WHERE poradi <= ${POZNAMEK_K_REZERVACI} ORDER BY customer_id, poradi` as any[];
      const poHostech = new Map<number, string[]>();
      for (const n of poznamky) { const id = Number(n.customer_id); if (!poHostech.has(id)) poHostech.set(id, []); poHostech.get(id)!.push(String(n.body ?? '')); }
      for (const [id, texty] of poHostech) pridej(id, { staff_note: texty[0], staff_notes: texty });
    } catch (e) { console.error('[rezervace] poznámky personálu', e); }
  }
  return out;
}

export async function PATCH(req: NextRequest) {
  const ctx = await pozaduj(['rezervace.schvalovat', 'rezervace.usadit']);
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const b = await req.json().catch(() => ({}));
  const id = parseInt(String(b.id), 10);
  // Ručně zapsaná rezervace nemusí mít účet hosta — jméno nese sama (guest_name).
  const [r] = await sql`SELECT r.*, COALESCE(us.name, r.guest_name) AS customer_name FROM client_reservations r LEFT JOIN users us ON us.id = r.customer_id WHERE r.id = ${id} AND r.team_id = ${u.team_id}`;
  const hostId = r?.customer_id == null ? null : Number(r.customer_id);
  if (!r) return NextResponse.json({ error: 'Rezervace nenalezena' }, { status: 404 });
  // Potvrdit/odmítnout je rozhodnutí o kapacitě podniku (a jde z něj
  // upozornění hostovi); usadit, přidělit stůl, uzavřít a „Nedorazil" (i jeho
  // vrácení na potvrzeno — stejný klíč jako lib/klientPrehled klicPrechodu) je práce
  // u dveří. Jsou to různá oprávnění, takže se kontroluje každá část požadavku zvlášť
  // a chybí-li kterákoli, neuloží se nic.
  const chce = b.status ? String(b.status) : null;
  const potreba = new Set<string>();
  if ((chce === 'confirmed' && String(r.status) !== 'no_show') || chce === 'declined') potreba.add('rezervace.schvalovat');
  else if (chce) potreba.add('rezervace.usadit');
  if (b.tableId !== undefined) potreba.add('rezervace.usadit');
  if (potreba.has('rezervace.schvalovat') && !ctx.role.opravneni.has('rezervace.schvalovat')) {
    return NextResponse.json({ error: 'Potvrzovat a odmítat rezervace nemáš povoleno.' }, { status: 403 });
  }
  if (potreba.has('rezervace.usadit') && !ctx.role.opravneni.has('rezervace.usadit')) {
    return NextResponse.json({ error: 'Usazovat hosty a přidělovat stoly nemáš povoleno.' }, { status: 403 });
  }

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
  // Hostovi se hlásí rozhodnutí o rezervaci — ne vrácení omylu („Nedorazil" → zpět na potvrzeno).
  if ((next === 'confirmed' || next === 'declined') && hostId && String(r.status) !== 'no_show') {
    notifyUser(hostId, zpravaHostoviORezervaci(next, String(r.date), String(r.time))).catch(() => {});
  }
  // Nedorazení je záznam o hostovi (vypíná mu automatické potvrzení) — do protokolu jmenovitě.
  audit(u.team_id, u.id, next === 'no_show' ? 'rezervace.nedorazil' : 'client.reservation', 'client', id, `${r.customer_name} · ${r.date} ${r.time} → ${status}`);
  return NextResponse.json({ ok: true, status, tableId, posNote, loyalty, bodyRezervace });
}
