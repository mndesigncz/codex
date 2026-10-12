import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { notifyUser, notifyUsers } from '@/lib/push';
import { pozaduj, jeOdpoved, clenoveSOpravnenim } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { duvodVolna, textRozhodnutiVolna, MAX_DUVOD_VOLNA } from '@/lib/rozvrhPrehled';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

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
      return NextResponse.json({ requests: rows.map(shape), isEmployer: false });
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
    return NextResponse.json({ requests: rows.map(shape), isEmployer });
  } catch {
    return NextResponse.json({ requests: [], isEmployer });
  }
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
