import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { notifyUser } from '@/lib/push';
import { tymyCiselniku } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

const vMesici = (month: string) => (d: unknown) =>
  typeof d === 'string' && d.startsWith(month + '-') && /^\d{4}-\d{2}-\d{2}$/.test(d);

/**
 * Preference po dnech: 'off' | 'morning' | 'afternoon' | 'flexible' zůstávají,
 * 'type:<id>' ukazuje na typ směny a projde jen s VIDITELNÝM typem —
 * vlastním, nebo ze zdrojového podniku organizace (kolo 60). Cizí id se tiše
 * zahodí, generátor by ho stejně ignoroval. Společné pro zaměstnance (POST)
 * i vedení (PATCH): oba zápisy pouští přesně totéž. Typy se načítají jen
 * když v preferencích nějaké 'type:' vůbec je.
 */
async function ocistiPreference(teamId: number, month: string, raw: unknown): Promise<Record<string, string>> {
  if (!raw || typeof raw !== 'object') return {};
  const staticOk = (v: string) => ['off', 'morning', 'afternoon', 'flexible'].includes(v);
  const inMonth = vMesici(month);
  let viditelneTypy: Set<number> | null = null;
  if (Object.values(raw as Record<string, unknown>).some(v => /^type:\d+$/.test(String(v)))) {
    try {
      const tymy = await tymyCiselniku(teamId, 'typySmen');
      const rows = await sql`SELECT id FROM shift_types WHERE team_id = ANY(${tymy})`;
      viditelneTypy = new Set((rows as any[]).map(r => Number(r.id)));
    } catch { /* bez tabulky žádný typ neprojde */ }
  }
  const typeOk = (v: string) => {
    const m = /^type:(\d+)$/.exec(v);
    return !!m && !!viditelneTypy?.has(Number(m[1]));
  };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (inMonth(k) && (staticOk(String(v)) || typeOk(String(v)))) out[k] = String(v);
  }
  return out;
}

async function context() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const meId = parseInt((session.user as any).id);
  const role = (session.user as any).role as string;
  const [u] = await sql`SELECT team_id, name FROM users WHERE id = ${meId}`;
  return { meId, role, teamId: u?.team_id as number | undefined, name: u?.name as string | undefined };
}

// GET ?month=YYYY-MM
// employee → their own submission (or null)
// employer → all team submissions joined with employee name+avatar
export async function GET(req: Request) {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!ctx.teamId) return NextResponse.json(ctx.role === 'employer' ? { submissions: [] } : null);

  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month');
  if (!month) return NextResponse.json({ error: 'Chybí měsíc' }, { status: 400 });

  if (ctx.role === 'employer' && !searchParams.get('mine')) {
    const rows = await sql`
      SELECT a.id, a.employee_id, a.month, a.unavailable_dates, a.day_preferences, a.preferred_shift,
             a.max_shifts, a.note, a.status, a.created_at,
             u.name AS employee_name, u.avatar AS employee_avatar
      FROM availability_requests a
      JOIN users u ON u.id = a.employee_id
      WHERE a.team_id = ${ctx.teamId} AND a.month = ${month}
      ORDER BY u.name ASC`;
    const submissions = rows.map((r: any) => ({
      id: r.id,
      employeeId: r.employee_id,
      employeeName: r.employee_name,
      employeeAvatar: r.employee_avatar ?? '👤',
      month: r.month,
      unavailableDates: r.unavailable_dates ?? [],
      dayPreferences: r.day_preferences ?? {},
      preferredShift: r.preferred_shift,
      maxShifts: r.max_shifts,
      note: r.note,
      status: r.status,
      createdAt: r.created_at,
    }));
    return NextResponse.json({ submissions });
  }

  // employee — own submission
  const [r] = await sql`
    SELECT id, employee_id, month, unavailable_dates, day_preferences, preferred_shift, max_shifts, note, status, created_at
    FROM availability_requests
    WHERE team_id = ${ctx.teamId} AND employee_id = ${ctx.meId} AND month = ${month}
    LIMIT 1`;
  if (!r) return NextResponse.json(null);
  return NextResponse.json({
    id: r.id,
    employeeId: r.employee_id,
    month: r.month,
    unavailableDates: r.unavailable_dates ?? [],
    dayPreferences: r.day_preferences ?? {},
    preferredShift: r.preferred_shift,
    maxShifts: r.max_shifts,
    note: r.note,
    status: r.status,
    createdAt: r.created_at,
  });
}

// POST (employee) — upsert availability { month, unavailableDates, preferredShift, maxShifts, note }
export async function POST(req: Request) {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (ctx.role !== 'employee' && ctx.role !== 'employer') return NextResponse.json({ error: 'Pouze pro členy týmu' }, { status: 403 });
  if (!ctx.teamId) return NextResponse.json({ error: 'Bez týmu' }, { status: 400 });

  const body = await req.json();
  const month: string = body.month;
  const unavailableDates: string[] = Array.isArray(body.unavailableDates) ? body.unavailableDates : [];
  const preferredShift: string | null = body.preferredShift ?? null;
  const maxShifts: number | null =
    body.maxShifts === null || body.maxShifts === undefined || body.maxShifts === ''
      ? null
      : parseInt(body.maxShifts);
  const note: string | null = body.note ?? null;

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Neplatný měsíc' }, { status: 400 });
  }
  // Až po kontrole měsíce: filtr potřebuje vědět, do kterého měsíce dny patří.
  const dayPreferences = await ocistiPreference(ctx.teamId, month, body.dayPreferences);

  // delete existing for this employee+month, then insert
  await sql`
    DELETE FROM availability_requests
    WHERE team_id = ${ctx.teamId} AND employee_id = ${ctx.meId} AND month = ${month}`;

  const [inserted] = await sql`
    INSERT INTO availability_requests
      (team_id, employee_id, month, unavailable_dates, day_preferences, preferred_shift, max_shifts, note, status)
    VALUES
      (${ctx.teamId}, ${ctx.meId}, ${month}, ${JSON.stringify(unavailableDates)},
       ${JSON.stringify(dayPreferences)}, ${preferredShift}, ${maxShifts}, ${note}, 'submitted')
    RETURNING id`;

  // Notify the employer(s) of the team
  try {
    const employers = await sql`
      SELECT id FROM users WHERE team_id = ${ctx.teamId} AND role = 'employer' AND id <> ${ctx.meId}`;
    const [my, ye] = month.split('-');
    const monthLabel = new Date(parseInt(my), parseInt(ye) - 1, 1).toLocaleDateString('cs-CZ', {
      month: 'long',
      year: 'numeric',
    });
    await Promise.all(
      employers.map((e: any) =>
        notifyUser(e.id, {
          title: 'Zadaná dostupnost',
          body: `${ctx.name ?? 'Zaměstnanec'} zadal/a dostupnost na ${monthLabel}`,
          type: 'shift',
          category: 'shift',
          link: '/employer/overview?view=shifts',
        }),
      ),
    );
  } catch (e) {
    console.error('notify employer failed', e);
  }

  return NextResponse.json({ id: inserted.id, ok: true });
}


// PATCH (employer) — fix a member's availability in place. The employee typed
// it on a phone; when the employer spots a slip, they correct it here instead
// of chasing the person to resubmit. The employee gets told about the change.
// Body: { employeeId, month, unavailableDates?, dayPreferences?, preferredShift?, maxShifts?, note? }
export async function PATCH(req: Request) {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (ctx.role !== 'employer') return NextResponse.json({ error: 'Jen pro vedení' }, { status: 403 });
  if (!ctx.teamId) return NextResponse.json({ error: 'Bez týmu' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const employeeId = parseInt(body.employeeId);
  const month: string = String(body.month ?? '');
  if (!Number.isFinite(employeeId) || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Chybí zaměstnanec nebo měsíc' }, { status: 400 });
  }
  const [emp] = await sql`SELECT id, name, team_id FROM users WHERE id = ${employeeId}`;
  if (!emp || emp.team_id !== ctx.teamId) {
    return NextResponse.json({ error: 'Zaměstnanec není ve vašem týmu' }, { status: 404 });
  }

  const [existing] = await sql`
    SELECT unavailable_dates, day_preferences, preferred_shift, max_shifts, note
    FROM availability_requests
    WHERE team_id = ${ctx.teamId} AND employee_id = ${employeeId} AND month = ${month}
    LIMIT 1`;

  const inMonth = vMesici(month);
  const unavailableDates: string[] = Array.isArray(body.unavailableDates)
    ? Array.from(new Set(body.unavailableDates.filter(inMonth))).slice(0, 62) as string[]
    : (existing?.unavailable_dates ?? []);
  const dayPreferences: Record<string, string> = body.dayPreferences && typeof body.dayPreferences === 'object'
    ? await ocistiPreference(ctx.teamId, month, body.dayPreferences)
    : (existing?.day_preferences ?? {});
  const preferredShift = body.preferredShift !== undefined
    ? (['morning', 'afternoon', 'flexible'].includes(String(body.preferredShift)) ? String(body.preferredShift) : null)
    : (existing?.preferred_shift ?? null);
  const maxShifts = body.maxShifts !== undefined
    ? (body.maxShifts === null || body.maxShifts === '' ? null : Math.max(1, Math.min(31, parseInt(body.maxShifts) || 0)) || null)
    : (existing?.max_shifts ?? null);
  const note = body.note !== undefined
    ? (body.note ? String(body.note).slice(0, 500) : null)
    : (existing?.note ?? null);

  await sql`
    DELETE FROM availability_requests
    WHERE team_id = ${ctx.teamId} AND employee_id = ${employeeId} AND month = ${month}`;
  await sql`
    INSERT INTO availability_requests
      (team_id, employee_id, month, unavailable_dates, day_preferences, preferred_shift, max_shifts, note, status)
    VALUES
      (${ctx.teamId}, ${employeeId}, ${month}, ${JSON.stringify(unavailableDates)},
       ${JSON.stringify(dayPreferences)}, ${preferredShift}, ${maxShifts}, ${note}, 'submitted')`;

  // Hours are theirs — they must know the employer touched them.
  try {
    const [y, m] = month.split('-');
    const label = new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });
    await notifyUser(employeeId, {
      title: '🗓️ Upravená dostupnost',
      body: `Vedení ${existing ? 'upravilo' : 'vyplnilo'} tvou dostupnost na ${label} — mrkni, jestli sedí.`,
      type: 'info',
      category: 'shift',
      link: '/employee/shifts?view=availability',
    });
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true });
}
