import { NextResponse } from 'next/server';
import { audit } from '@/lib/audit';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { notifyUser } from '@/lib/push';
import { getConnection, daySummary } from '@/lib/storyous';
import { normalizeHandover, normalizeMovements } from '@/lib/closing';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const sql = neon(process.env.DATABASE_URL!);

// GET — jedna uzávěrka se vším, co k ní patří.
//
// Seznam uzávěrek ukazuje shrnutí, protože jich je na obrazovce dvacet. Když
// si ale vedení jednu rozklikne, chce vidět všechno, co do ní kdo vyplnil —
// a hlavně to, co se ten den doopravdy stalo: co říká pokladna, kdo byl
// odpíchnutý, jaké postupy proběhly, jaké účtenky přibyly. Sbírá se to tady na
// serveru, aby si klient nemusel skládat obraz dne z pěti requestů.
//
// Všechno kolem uzávěrky je best-effort: chybějící migrace ani nedostupná
// pokladna nesmí shodit detail. Když se něco nepodaří, řekne se to (`notes`),
// místo aby tam tiše chyběla čísla.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const meId = parseInt((session.user as any).id);
  const role = (session.user as any).role as string;
  if (role === 'kiosk') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const id = parseInt(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });

  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  if (!u?.team_id) return NextResponse.json({ error: 'Bez týmu' }, { status: 400 });

  const [c] = await sql`
    SELECT cc.*, us.name AS author_name, us.avatar AS author_avatar
    FROM cash_closings cc LEFT JOIN users us ON us.id = cc.created_by
    WHERE cc.id = ${id} AND cc.team_id = ${u.team_id}`;
  if (!c) return NextResponse.json({ error: 'Uzávěrka nenalezena' }, { status: 404 });
  // Zaměstnanec vidí jen svoji.
  if (role !== 'employer' && c.created_by !== meId) {
    return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  }

  const teamId = u.team_id as number;
  const day: string = String(c.shift_date || c.date);
  const notes: string[] = [];
  // Kontext celého dne — tržba z pokladny, docházka týmu, účtenky — je pohled
  // vedení. Zaměstnanci se vrací jeho vlastní uzávěrka a nic navíc.
  const full = role === 'employer';

  // --- lidé: kdo na směně byl a kdo uzávěrku pokrývá ---
  const people = new Map<number, { id: number; name: string; avatar: string | null }>();
  try {
    for (const p of await sql`SELECT id, name, avatar FROM users WHERE team_id = ${teamId}` as any[]) {
      people.set(p.id, { id: p.id, name: p.name, avatar: p.avatar ?? null });
    }
  } catch { /* nepodstatné */ }
  const person = (pid: any) => people.get(Number(pid)) ?? null;

  const crew = (Array.isArray(c.shift_employees) ? c.shift_employees : [])
    .map((x: any) => person(x)).filter(Boolean);
  if (!crew.some((p: any) => p?.id === c.created_by)) {
    const a = person(c.created_by);
    if (a) crew.unshift(a);
  }

  // Uzávěrky kolegů, které tahle pokrývá (stub řádky s covered_by).
  let covered: any[] = [];
  try {
    covered = (await sql`
      SELECT cc.id, cc.created_by, cc.self_payout, us.name AS author_name, us.avatar AS author_avatar
      FROM cash_closings cc LEFT JOIN users us ON us.id = cc.created_by
      WHERE cc.covered_by = ${id}` as any[]).map(r => ({
        id: r.id, employeeId: r.created_by, name: r.author_name, avatar: r.author_avatar,
        selfPayout: Number(r.self_payout) || 0,
      }));
  } catch { /* sloupec ještě není */ }

  // --- plánovaná směna a kdo měl ten den službu ---
  let planned: any[] = [];
  if (full) try {
    planned = (await sql`
      SELECT s.employee_id, s.start_time, s.end_time, s.type, s.auto_created
      FROM shifts s WHERE s.team_id = ${teamId} AND s.date = ${day}
      ORDER BY s.start_time` as any[]).map(s => ({
        employee: person(s.employee_id), startTime: s.start_time, endTime: s.end_time,
        type: s.type, autoCreated: !!s.auto_created,
      }));
  } catch { /* nepodstatné */ }

  // --- docházka: kdo byl doopravdy odpíchnutý ---
  // Obchodní den končí po půlnoci, takže se berou i záznamy z noci na další den.
  let attendance: any[] = [];
  if (full) try {
    attendance = (await sql`
      SELECT te.id, te.employee_id, te.clock_in, te.clock_out, te.source, te.note
      FROM time_entries te
      WHERE te.team_id = ${teamId}
        AND to_char((te.clock_in AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') = ${day}
      ORDER BY te.clock_in` as any[]).map(t => ({
        id: t.id, employee: person(t.employee_id),
        clockIn: t.clock_in, clockOut: t.clock_out, source: t.source, note: t.note,
        minutes: t.clock_out
          ? Math.max(0, Math.round((new Date(t.clock_out).getTime() - new Date(t.clock_in).getTime()) / 60000))
          : null,
      }));
  } catch { /* nepodstatné */ }

  // --- postupy dokončené ten den ---
  let procedures: any[] = [];
  if (full) try {
    procedures = (await sql`
      SELECT pr.id, pr.user_id, pr.status, pr.completed_at, pr.duration_seconds,
             pr.total_items, pr.checked_items, p.name, p.require_before_closing
      FROM procedure_runs pr JOIN procedures p ON p.id = pr.procedure_id
      WHERE pr.team_id = ${teamId}
        AND to_char((COALESCE(pr.completed_at, pr.started_at) AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') = ${day}
      ORDER BY pr.completed_at NULLS LAST` as any[]).map(p => ({
        id: p.id, name: p.name, employee: person(p.user_id), status: p.status,
        completedAt: p.completed_at, durationSeconds: p.duration_seconds,
        done: Array.isArray(p.checked_items) ? p.checked_items.length : 0,
        total: Number(p.total_items) || 0,
        required: !!p.require_before_closing,
      }));
  } catch { /* nepodstatné */ }

  // Povinné postupy, které ten den nikdo nedokončil — uzávěrka na ně čeká.
  let missingProcedures: string[] = [];
  if (full) try {
    missingProcedures = (await sql`
      SELECT p.name FROM procedures p
      WHERE p.team_id = ${teamId} AND p.require_before_closing = TRUE
        AND NOT EXISTS (
          SELECT 1 FROM procedure_runs r
          WHERE r.procedure_id = p.id AND r.status = 'completed'
            AND to_char((r.completed_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') = ${day})` as any[])
      .map(r => String(r.name));
  } catch { /* nepodstatné */ }

  // --- úkoly odškrtnuté ten den ---
  let tasks: any[] = [];
  if (full) try {
    tasks = (await sql`
      SELECT t.id, t.title, t.completed_by, t.completed_at, t.priority
      FROM tasks t
      WHERE t.completed_at IS NOT NULL
        AND to_char((t.completed_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') = ${day}
        AND t.assigned_to IN (SELECT id FROM users WHERE team_id = ${teamId})
      ORDER BY t.completed_at` as any[]).map(t => ({
        id: t.id, title: t.title, employee: person(t.completed_by),
        completedAt: t.completed_at, priority: t.priority,
      }));
  } catch { /* nepodstatné */ }

  // --- účtenky vyfocené ten den ---
  let receipts: any[] = [];
  if (full) try {
    receipts = (await sql`
      SELECT r.id, r.user_id, r.photo_url, r.supplier, r.amount, r.note, r.created_at
      FROM receipts r
      WHERE r.team_id = ${teamId}
        AND to_char((r.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') = ${day}
      ORDER BY r.created_at` as any[]).map(r => ({
        id: r.id, employee: person(r.user_id), photoUrl: r.photo_url,
        supplier: r.supplier, amount: Number(r.amount) || 0, note: r.note, createdAt: r.created_at,
      }));
  } catch { /* nepodstatné */ }

  // --- pokladna: co říká Storyous o tomtéž dni ---
  // Tohle je ta nejdůležitější kontrola, takže se nesmí tvářit, že sedí, když
  // nesedí. Buď přijdou čísla, nebo důvod, proč nejsou.
  let pos: any = null;
  if (full) try {
    const conn = await getConnection(teamId);
    if (!conn) {
      notes.push('Pokladna není připojená, takže není s čím tržbu porovnat.');
    } else {
      const s = await daySummary(conn, day);
      // Ostatní uzávěrky téhož dne — porovnávat jednu směnu proti celodenní
      // tržbě by hlásilo rozdíl, který si aplikace vyrobila sama.
      let dayCash = Number(c.cash_revenue) || 0;
      let dayCard = Number(c.card_revenue) || 0;
      let siblings = 0;
      try {
        const rows = await sql`
          SELECT cash_revenue, card_revenue FROM cash_closings
          WHERE team_id = ${teamId} AND COALESCE(shift_date, date) = ${day}
            AND id <> ${id} AND covered_by IS NULL`;
        for (const r of rows as any[]) {
          siblings++;
          dayCash += Number(r.cash_revenue) || 0;
          dayCard += Number(r.card_revenue) || 0;
        }
      } catch { /* nepodstatné */ }
      pos = {
        bills: s.bills, total: s.total, cash: s.cash, card: s.card, other: s.other,
        tips: s.tips, tipsCash: s.tipsCash, tipsCard: s.tipsCard, tipsOther: s.tipsOther,
        siblingClosings: siblings,
        dayCash, dayCard,
        diffCash: Math.round(dayCash - s.cash),
        diffCard: Math.round(dayCard - s.card),
      };
      if (s.bills === 0) {
        notes.push('Pokladna za tenhle den nevrátila ani jednu účtenku — buď se ten den neprodávalo přes kasu, nebo je jinde nastavená provozovna.');
      }
      if (siblings > 0) {
        notes.push(`K tomuhle dni je uzávěrek ${siblings + 1}, takže se pokladna porovnává proti jejich součtu, ne proti téhle jedné.`);
      }
      if (s.other > 0) {
        notes.push(`${Math.round(s.other).toLocaleString('cs-CZ')} Kč z pokladny má jiný způsob platby než hotovost nebo kartu — v uzávěrce pro to není kolonka, takže se to v rozdílu projeví.`);
      }
      if (s.tipsOther > 0) {
        notes.push('U části spropitného se nedá vyčíst, jestli přišlo hotově nebo kartou — počítá se zvlášť, ne odhadem do jedné strany.');
      }
    }
  } catch {
    notes.push('Data z pokladny se teď nepodařilo načíst. Čísla z uzávěrky jsou platná, jen chybí kontrola proti kase.');
  }

  // --- prodané produkty toho dne (z naší tabulky, bez volání kasy) ---
  let products: any[] = [];
  if (full) try {
    products = (await sql`
      SELECT product_name AS name, qty::float AS qty FROM pos_sales
      WHERE team_id = ${teamId} AND date = ${day}
      ORDER BY qty DESC LIMIT 40` as any[]).map(p => ({ name: p.name, qty: p.qty }));
  } catch { /* nepodstatné */ }

  return NextResponse.json({
    closing: {
      ...c,
      shiftEmployees: crew,
      handover: normalizeHandover(c.handover),
      movements: normalizeMovements(c.movements),
      approvedByName: c.approved_by ? (person(c.approved_by)?.name ?? null) : null,
    },
    crew, covered, planned, attendance, procedures, missingProcedures,
    tasks, receipts, pos, products, notes, day,
  });
}

// PATCH — employer approves a pending closing.
export async function PATCH(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const meId = parseInt((session.user as any).id);
  const role = (session.user as any).role as string;
  if (role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const id = parseInt(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });

  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  const [row] = await sql`SELECT created_by, team_id, date FROM cash_closings WHERE id = ${id}`;
  if (!row || row.team_id !== u?.team_id) return NextResponse.json({ error: 'Uzávěrka nenalezena' }, { status: 404 });

  try {
    await sql`UPDATE cash_closings SET approved = TRUE, approved_by = ${meId} WHERE id = ${id}`;
  } catch {
    return NextResponse.json({ error: 'Schválení není dostupné (chybí migrace).' }, { status: 400 });
  }
  try {
    await notifyUser(row.created_by, { title: 'Uzávěrka schválena ✓', body: 'Vedení schválilo tvou uzávěrku.', type: 'info', link: '/employee/shifts?view=closing' });
  } catch { /* best-effort */ }
  return NextResponse.json({ ok: true });
}

// DELETE — remove a closing. Author may delete their own; employer may delete any in the team.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const meId = parseInt((session.user as any).id);
  const role = (session.user as any).role as string;
  const id = parseInt(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });

  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  const teamId = u?.team_id;
  const [row] = await sql`SELECT created_by, team_id, date FROM cash_closings WHERE id = ${id}`;
  if (!row) return NextResponse.json({ error: 'Uzávěrka nenalezena' }, { status: 404 });

  const isOwnerOfTeam = role === 'employer' && row.team_id === teamId;
  const isAuthor = row.created_by === meId;
  if (!isOwnerOfTeam && !isAuthor) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  await sql`DELETE FROM cash_closings WHERE id = ${id}`;
  audit(row.team_id, meId, 'closing.delete', 'closing', id, `uzávěrka ${row?.date ?? ''}`);
  return NextResponse.json({ ok: true });
}
