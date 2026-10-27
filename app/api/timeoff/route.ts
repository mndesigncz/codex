import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { notifyUser, notifyUsers } from '@/lib/push';
import { pozaduj, jeOdpoved, clenoveSOpravnenim } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { duvodVolna, textRozhodnutiVolna, MAX_DUVOD_VOLNA } from '@/lib/rozvrhPrehled';
import { jeClenem } from '@/lib/tenant';
import { pragueToday } from '@/lib/pragueTime';
import { narokDovolene, rokNaroku, vycistiNarok, zbudePoSchvaleni, type NarokDovolene } from '@/lib/dovolena';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

/**
 * Nárok na dovolenou (dní za rok) z členství — kolo 8 (R8-3). Bez migrace (sloupec
 * team_members.vacation_per_year ještě není) prázdná mapa: nic se nekreslí.
 */
async function narokyClenu(teamId: number, userIds: number[] | null): Promise<Map<number, number | null>> {
  const out = new Map<number, number | null>();
  try {
    const rows = userIds
      ? await sql`SELECT user_id, vacation_per_year FROM team_members WHERE team_id = ${teamId} AND user_id = ANY(${userIds})`
      : await sql`SELECT user_id, vacation_per_year FROM team_members WHERE team_id = ${teamId}`;
    for (const r of rows as any[]) out.set(Number(r.user_id), vycistiNarok(r.vacation_per_year));
  } catch { /* před migrací */ }
  return out;
}

/** Schválené a čekající dovolené v roce po lidech — pro zůstatek (jen typ vacation). */
async function dovoleneRoku(teamId: number, rok: number, userIds: number[] | null): Promise<Map<number, any[]>> {
  const out = new Map<number, any[]>();
  try {
    const rows = userIds
      ? await sql`SELECT employee_id, from_date, to_date, type, status FROM time_off_requests
                  WHERE team_id = ${teamId} AND employee_id = ANY(${userIds}) AND type = 'vacation' AND status IN ('approved', 'pending')
                    AND to_date >= ${`${rok}-01-01`} AND from_date <= ${`${rok}-12-31`}`
      : await sql`SELECT employee_id, from_date, to_date, type, status FROM time_off_requests
                  WHERE team_id = ${teamId} AND type = 'vacation' AND status IN ('approved', 'pending')
                    AND to_date >= ${`${rok}-01-01`} AND from_date <= ${`${rok}-12-31`}`;
    for (const r of rows as any[]) {
      const id = Number(r.employee_id);
      out.set(id, [...(out.get(id) ?? []), { fromDate: String(r.from_date), toDate: String(r.to_date), type: r.type, status: r.status }]);
    }
  } catch { /* bez tabulky */ }
  return out;
}

// Vlastní žádosti má každý člen; volno týmu (i typ „nemoc", tedy zdravotní
// údaj) jen s volno.zobrazit, rozhodování s volno.schvalovat.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const shape = (r: any) => ({
  id: r.id, employeeId: r.employee_id, fromDate: r.from_date, toDate: r.to_date,
  type: r.type, note: r.note, status: r.status, createdAt: r.created_at,
  // Důvod rozhodnutí od vedení (kolo 7) — žadatel ho vidí u zamítnuté žádosti i v oznámení.
  decisionNote: r.decision_note ?? null,
  employeeName: r.employee_name ?? null, employeeAvatar: r.employee_avatar ?? null,
  // Kolize s rozvrhem (kolo 6 UX): kolik směn má člověk v dnech čekající žádosti.
  // Jen v seznamu pro vedení a jen u čekajících — o ostatních už se rozhodlo.
  ...(r.conflicts != null ? { conflicts: Number(r.conflicts) || 0 } : {}),
});

/** Směny člověka v podniku ve dnech volna — kolize, která po schválení zůstane v rozvrhu. */
async function smenyVeVolnu(teamId: number, employeeId: number, from: string, to: string) {
  const rows = await sql`
    SELECT date, start_time, end_time FROM shifts
    WHERE team_id = ${teamId} AND employee_id = ${employeeId} AND date >= ${from} AND date <= ${to}
    ORDER BY date ASC, start_time ASC`;
  return rows.map((s: any) => ({ date: String(s.date), startTime: String(s.start_time ?? ''), endTime: String(s.end_time ?? '') }));
}

// GET — bez volno.zobrazit vlastní žádosti, s ním celý tým.
export async function GET(req: NextRequest) {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  // `?mine=1` (kolo 69, widget Moje volno): vlastní žádosti i pro vedení,
  // kterému by jinak přišel celý tým — a s LIMIT 100 by v něm vlastní
  // dovolená po sezóně klidně chyběla. Jen aktivní podnik.
  if (new URL(req.url).searchParams.get('mine') === '1') {
    try {
      const rows = await sql`
        SELECT t.* FROM time_off_requests t
        WHERE t.employee_id = ${c.meId} AND t.team_id = ${c.teamId}
        ORDER BY t.from_date DESC LIMIT 50`;
      // Nárok a zůstatek dovolené za letošní rok (kolo 8): „Zbývá 6 dní z 20" v žádosti i widgetu.
      // Čerpání z celého roku (ne jen z posledních 50 žádostí), ať zůstatek sedí.
      const rok = rokNaroku(pragueToday());
      const naroky = await narokyClenu(c.teamId, [c.meId]);
      const dovolene = await dovoleneRoku(c.teamId, rok, [c.meId]);
      const narok: NarokDovolene = narokDovolene(dovolene.get(c.meId) ?? [], naroky.get(c.meId) ?? null, rok);
      return NextResponse.json({ requests: rows.map(shape), isEmployer: false, narok });
    } catch {
      return NextResponse.json({ error: 'Žádosti o volno se nenačetly.' }, { status: 500 });
    }
  }
  // Pole se dál jmenuje isEmployer kvůli klientům; znamená „odpověď nese
  // žádosti týmu".
  const isEmployer = c.role.opravneni.has('volno.zobrazit');
  // Čekající žádost nese počet směn, které má člověk v rozvrhu ve dnech volna —
  // jedním dotazem (LATERAL), ne dotazem na žádost. Schválení nic neblokuje;
  // widget jen řekne „2 směny v rozvrhu", ať se na ně po schválení nezapomene.
  const tymSKolizemi = () => sql`
    SELECT t.*, u.name AS employee_name, u.avatar AS employee_avatar,
           CASE WHEN t.status = 'pending' THEN k.n END AS conflicts
    FROM time_off_requests t
    LEFT JOIN users u ON u.id = t.employee_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS n FROM shifts s
      WHERE s.team_id = ${c.teamId} AND s.employee_id = t.employee_id
        AND s.date >= t.from_date AND s.date <= t.to_date
    ) k ON TRUE
    WHERE t.team_id = ${c.teamId}
    ORDER BY (t.status = 'pending') DESC, t.from_date DESC
    LIMIT 100`;
  try {
    const rows = isEmployer
      ? await tymSKolizemi().catch(() => sql`
          SELECT t.*, u.name AS employee_name, u.avatar AS employee_avatar
          FROM time_off_requests t
          LEFT JOIN users u ON u.id = t.employee_id
          WHERE t.team_id = ${c.teamId}
          ORDER BY (t.status = 'pending') DESC, t.from_date DESC
          LIMIT 100`)
      : await sql`
          SELECT t.* FROM time_off_requests t
          WHERE t.employee_id = ${c.meId}
          ORDER BY t.from_date DESC LIMIT 50`;
    if (!isEmployer) return NextResponse.json({ requests: rows.map(shape), isEmployer });
    // Vedení (kolo 8): nárok a zůstatek každého člena (`naroky`, pro pole „Dovolená na rok" v Týmu)
    // a u čekající dovolené „po schválení zbude" (fronta žádostí). Bez nároku null — nekreslí se.
    const rok = rokNaroku(pragueToday());
    const naroky = await narokyClenu(c.teamId, null);
    const dovolene = await dovoleneRoku(c.teamId, rok, null);
    const narokyOut: Record<string, NarokDovolene> = {};
    for (const [id, dni] of naroky) narokyOut[String(id)] = narokDovolene(dovolene.get(id) ?? [], dni, rok);
    const requests = rows.map((r: any) => {
      const s = shape(r);
      const n = narokyOut[String(r.employee_id)];
      const zbude = s.status === 'pending' && s.type === 'vacation' && n ? zbudePoSchvaleni(n, s.fromDate, s.toDate) : null;
      return zbude == null ? s : { ...s, zbydePoSchvaleni: zbude, narokDni: n.dni };
    });
    return NextResponse.json({ requests, isEmployer, naroky: narokyOut });
  } catch {
    return NextResponse.json({ requests: [], isEmployer });
  }
}

// PUT (volno.schvalovat) — nárok na dovolenou člena: { userId, vacationPerYear: dní | null }.
// Na členství v TOMHLE podniku (team_members), ne na účtu — v každém podniku může být jiný.
export async function PUT(req: NextRequest) {
  const c = await pozaduj('volno.schvalovat');
  if (jeOdpoved(c)) return c;
  const b = await req.json().catch(() => ({}));
  const userId = parseInt(b.userId);
  if (!Number.isFinite(userId)) return NextResponse.json({ error: 'Chybí člověk.' }, { status: 400 });
  if (b.vacationPerYear !== null && b.vacationPerYear !== '' && b.vacationPerYear !== undefined
    && (!Number.isFinite(Number(b.vacationPerYear)) || Number(b.vacationPerYear) < 0 || Number(b.vacationPerYear) > 366)) {
    return NextResponse.json({ error: 'Nárok na dovolenou musí být 0 až 366 dní.' }, { status: 400 });
  }
  if (!(await jeClenem(userId, c.teamId))) return NextResponse.json({ error: 'Člověk není v podniku.' }, { status: 404 });
  const dni = vycistiNarok(b.vacationPerYear);
  try {
    const done = await sql`
      UPDATE team_members SET vacation_per_year = ${dni} WHERE team_id = ${c.teamId} AND user_id = ${userId}
      RETURNING user_id`;
    if (!done.length) return NextResponse.json({ error: 'Nárok jde nastavit jen členovi s členstvím v podniku.' }, { status: 404 });
  } catch {
    return NextResponse.json({ error: 'Nárok na dovolenou se teď nepodařilo uložit. Zkus to za chvíli znovu.' }, { status: 503 });
  }
  let jmeno = '';
  try { jmeno = String((await sql`SELECT name FROM users WHERE id = ${userId}`)[0]?.name ?? ''); } catch { /* jen do auditu */ }
  await audit(c.teamId, c.meId, 'volno.narok', 'user', userId, `${jmeno || `#${userId}`}: ${dni == null ? 'nenastaveno' : `${dni} dní za rok`}`);
  return NextResponse.json({ ok: true, vacationPerYear: dni });
}

// POST — vlastní žádost o volno (kdokoli s osobním účtem, ne tablet).
export async function POST(req: NextRequest) {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  if (c.role.typ === 'kiosk') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  let jmeno = 'Kolega';
  try { const [u] = await sql`SELECT name FROM users WHERE id = ${c.meId}`; if (u?.name) jmeno = String(u.name); } catch { /* jen do upozornění */ }

  const b = await req.json().catch(() => ({}));
  const from = String(b.fromDate ?? '');
  const to = String(b.toDate ?? b.fromDate ?? '');
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return NextResponse.json({ error: 'Neplatné datum.' }, { status: 400 });
  if (to < from) return NextResponse.json({ error: 'Konec volna je před začátkem.' }, { status: 400 });
  const type = ['vacation', 'sick', 'other'].includes(b.type) ? b.type : 'vacation';

  const [row] = await sql`
    INSERT INTO time_off_requests (team_id, employee_id, from_date, to_date, type, note)
    VALUES (${c.teamId}, ${c.meId}, ${from}, ${to}, ${type}, ${b.note || null})
    RETURNING *`;

  // Kdo volno schvaluje (kolo 67), podle členství (kolo 62): vedoucí
  // přepnutý jinam žádost jinak neuvidí.
  try {
    const employers = (await clenoveSOpravnenim(c.teamId, 'volno.schvalovat')).filter(id => id !== c.meId);
    await notifyUsers(employers, {
      title: 'Žádost o volno',
      body: `${jmeno}: ${from === to ? from : `${from} až ${to}`}`,
      type: 'info',
      category: 'timeoff',
      link: '/employer/overview?view=shifts',
    });
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, request: shape(row) });
}

// PATCH (volno.schvalovat) — approve / reject: { id, status: 'approved'|'rejected', note? }.
// `note` (kolo 7) je důvod pro žadatele: uloží se jen spolu se `status` (nové
// rozhodnutí bez důvodu starý důvod smaže), samotná úprava termínu ho nechá.
export async function PATCH(req: NextRequest) {
  const c = await pozaduj('volno.schvalovat');
  if (jeOdpoved(c)) return c;

  const b = await req.json().catch(() => ({}));
  const id = parseInt(b.id);
  const status = b.status === 'approved' ? 'approved' : b.status === 'rejected' ? 'rejected' : null;
  const wantsDates = b.fromDate !== undefined || b.toDate !== undefined;
  if (!Number.isFinite(id) || (!status && !wantsDates)) {
    return NextResponse.json({ error: 'Neplatný požadavek' }, { status: 400 });
  }
  const duvod = duvodVolna(b.note);
  if (duvod === false) return NextResponse.json({ error: `Důvod může mít nejvýš ${MAX_DUVOD_VOLNA} znaků.` }, { status: 400 });

  const [existing] = await sql`
    SELECT * FROM time_off_requests WHERE id = ${id} AND team_id = ${c.teamId}`;
  if (!existing) return NextResponse.json({ error: 'Žádost nenalezena' }, { status: 404 });

  // The employer may fix the dates — a holiday booked a day off by mistake
  // must not force the person to cancel and re-request.
  const fromDate = b.fromDate !== undefined ? String(b.fromDate) : String(existing.from_date);
  const toDate = b.toDate !== undefined ? String(b.toDate) : String(existing.to_date);
  if (!DATE_RE.test(fromDate) || !DATE_RE.test(toDate) || toDate < fromDate) {
    return NextResponse.json({ error: 'Neplatné rozmezí dat.' }, { status: 400 });
  }
  const nextStatus = status ?? String(existing.status);
  const nextNote = status ? duvod : (existing.decision_note ?? null);

  const [row] = await sql`
    UPDATE time_off_requests
    SET status = ${nextStatus}, from_date = ${fromDate}, to_date = ${toDate}, decided_by = ${c.meId},
        decision_note = ${nextNote}
    WHERE id = ${id} AND team_id = ${c.teamId}
    RETURNING *`;
  if (!row) return NextResponse.json({ error: 'Žádost nenalezena' }, { status: 404 });
  if (status) await audit(c.teamId, c.meId, 'volno.rozhodnout', 'time_off', id, status);

  // Směny, které po schválení zůstaly v rozvrhu ve dnech volna. Schválení projde jako
  // dřív; widget podle nich ukáže „Upravit rozvrh" (okno dne už umí „Přesto přidat").
  let conflicts: { date: string; startTime: string; endTime: string }[] = [];
  if (nextStatus === 'approved') {
    try { conflicts = await smenyVeVolnu(c.teamId, Number(row.employee_id), fromDate, toDate); } catch { /* bez výčtu — schválení platí */ }
  }

  const datesChanged = fromDate !== String(existing.from_date) || toDate !== String(existing.to_date);
  try {
    await notifyUser(row.employee_id, {
      title: status === 'approved' ? 'Volno schváleno ✓'
        : status === 'rejected' ? 'Volno zamítnuto'
        : '🗓️ Upravený termín volna',
      body: textRozhodnutiVolna({ od: String(row.from_date), doDne: String(row.to_date), status, terminUpraven: datesChanged, duvod: row.decision_note ?? null }),
      type: status === 'approved' ? 'info' : 'warning',
      category: 'timeoff',
      link: '/employee/shifts?view=availability',
    });
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, request: shape(row), conflicts });
}

// DELETE ?id= — the author cancels their own pending request; kdo volno
// schvaluje, smí zrušit JAKOUKOLI žádost (i schválenou dovolenou), the person is told.
export async function DELETE(req: NextRequest) {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });

  if (c.role.opravneni.has('volno.schvalovat')) {
    const [row] = await sql`
      DELETE FROM time_off_requests
      WHERE id = ${id} AND team_id = ${c.teamId}
      RETURNING employee_id, from_date, to_date, status`;
    if (row && row.employee_id !== c.meId) {
      try {
        await notifyUser(row.employee_id, {
          title: '🗓️ Volno zrušeno vedením',
          body: `${row.from_date === row.to_date ? row.from_date : `${row.from_date} až ${row.to_date}`} — kdyby to nesedělo, ozvi se vedení.`,
          type: 'warning', category: 'timeoff', link: '/employee/shifts?view=availability',
        });
      } catch { /* best-effort */ }
    }
    return NextResponse.json({ ok: true });
  }

  await sql`
    DELETE FROM time_off_requests
    WHERE id = ${id} AND employee_id = ${c.meId} AND status = 'pending'`;
  return NextResponse.json({ ok: true });
}
