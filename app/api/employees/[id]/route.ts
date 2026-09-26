import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { normalizeLevels, normalizePoints, standingForPoints, PointsConfig } from '@/lib/rewardLevels';
import { pragueToday, pragueHM } from '@/lib/pragueTime';
import { clenPodniku } from '@/lib/tenant';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { rozeberZaznam } from '@/lib/dochazkaPrehled';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// GET — everything the employer needs about one employee in a single view:
// identity, level & points, shifts (upcoming + recent, with review status),
// reviews and per-item feedback, attendance hours and closings.
//
// Kolo 67: profil otevírá tym.profil (body, úroveň, směny, odpracované
// hodiny, dochvilnost — tak ho popisuje katalog). Citlivé části jen
// s vlastním oprávněním: sazba (finance.mzdy), e-mail a telefon
// (tym.kontakty), hodnocení směn, výtky a body z hodnocení
// (hodnoceni.zobrazit). Vedení má všechno, pro něj se nic nemění.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const c = await pozaduj('tym.profil');
  if (jeOdpoved(c)) return c;
  const teamId = c.teamId;
  const ma = (k: string) => c.role.opravneni.has(k);
  const hodnoceni = ma('hodnoceni.zobrazit');

  const employeeId = parseInt(params.id);
  if (!Number.isFinite(employeeId)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });

  // Členství NEBO zrcadlo (kolo 62): člen přepnutý do jiného podniku dřív
  // dostal 404. Pozice a sazba jsou z členství v TOMHLE podniku, ne ze
  // zrcadla podniku, kam je právě přepnutý. Tablet helper vylučuje sám.
  const emp = await clenPodniku(employeeId, teamId);
  if (!emp) {
    return NextResponse.json({ error: 'Zaměstnanec nenalezen' }, { status: 404 });
  }

  // Level & points — same signals as /api/rewards.
  let levelsRaw: any = [], pointsRaw: any = {};
  try {
    const [t] = await sql`SELECT levels_config, points_config FROM teams WHERE id = ${teamId}`;
    levelsRaw = t?.levels_config; pointsRaw = t?.points_config;
  } catch { /* not migrated */ }
  const levels = normalizeLevels(levelsRaw);
  const points: PointsConfig = normalizePoints(pointsRaw);

  let tasksDone = 0, procedures = 0, closingsTotal = 0, reviewPoints = 0, autoPoints = 0, itemPoints = 0, flagged = 0, ratedShifts = 0;
  try {
    const [r] = await sql`SELECT COUNT(*)::int AS n FROM tasks WHERE completed_by = ${employeeId} AND status = 'done'`;
    tasksDone = r?.n ?? 0;
  } catch { /* ignore */ }
  try {
    const [r] = await sql`SELECT COUNT(*)::int AS n FROM procedure_runs WHERE user_id = ${employeeId} AND status = 'completed'`;
    procedures = r?.n ?? 0;
  } catch { /* ignore */ }
  try {
    const [r] = await sql`SELECT COUNT(*)::int AS n FROM cash_closings WHERE created_by = ${employeeId} AND covered_by IS NULL`;
    closingsTotal = r?.n ?? 0;
  } catch {
    try {
      const [r] = await sql`SELECT COUNT(*)::int AS n FROM cash_closings WHERE created_by = ${employeeId}`;
      closingsTotal = r?.n ?? 0;
    } catch { /* ignore */ }
  }
  try {
    const [r] = await sql`
      SELECT COALESCE(SUM(points),0)::int AS pts, COALESCE(SUM(auto_points),0)::int AS auto,
             COUNT(*)::int AS n, COUNT(*) FILTER (WHERE flagged)::int AS flg
      FROM shift_reviews WHERE employee_id = ${employeeId} AND team_id = ${teamId}`;
    reviewPoints = r?.pts ?? 0; autoPoints = r?.auto ?? 0; ratedShifts = r?.n ?? 0; flagged = r?.flg ?? 0;
  } catch {
    try {
      const [r] = await sql`SELECT COALESCE(SUM(points),0)::int AS pts, COUNT(*)::int AS n FROM shift_reviews WHERE employee_id = ${employeeId} AND team_id = ${teamId}`;
      reviewPoints = r?.pts ?? 0; ratedShifts = r?.n ?? 0;
    } catch { /* ignore */ }
  }
  try {
    const [r] = await sql`
      SELECT COALESCE(SUM(points),0)::int AS pts, COUNT(*) FILTER (WHERE flagged)::int AS flg
      FROM shift_review_items WHERE employee_id = ${employeeId} AND team_id = ${teamId}`;
    itemPoints = r?.pts ?? 0; flagged += r?.flg ?? 0;
  } catch { /* ignore */ }

  const totalPoints = tasksDone * points.task + procedures * points.procedure + closingsTotal * points.closing
    + reviewPoints + autoPoints + itemPoints;
  const st = standingForPoints(levels, totalPoints);

  const today = pragueToday();
  const monthKey = today.slice(0, 7);

  // Shifts with their review status (rating/flag per work date).
  let shiftRows: any[] = [];
  try {
    shiftRows = await sql`
      SELECT s.id, s.date, s.start_time, s.end_time, s.type,
             r.rating AS review_rating, r.flagged AS review_flagged, r.points AS review_points
      FROM shifts s
      LEFT JOIN shift_reviews r ON r.employee_id = s.employee_id AND r.work_date = s.date
      WHERE s.employee_id = ${employeeId}
      ORDER BY s.date DESC LIMIT 90`;
  } catch {
    try {
      shiftRows = await sql`
        SELECT id, date, start_time, end_time, type FROM shifts
        WHERE employee_id = ${employeeId} ORDER BY date DESC LIMIT 90`;
    } catch { shiftRows = []; }
  }
  const shapeShift = (r: any) => ({
    id: r.id, date: r.date, startTime: r.start_time, endTime: r.end_time, type: r.type,
    // Hodnocení směny bez hodnoceni.zobrazit nejde ani naznačit (nehodnoceno
    // vs. výtka) — směna se ukáže jako prostá směna.
    reviewed: hodnoceni && r.review_rating !== undefined && r.review_rating !== null,
    rating: hodnoceni ? (r.review_rating ?? 0) : 0,
    flagged: hodnoceni && r.review_flagged === true,
    reviewPoints: hodnoceni ? (r.review_points ?? 0) : 0,
  });
  const upcoming = shiftRows.filter((r: any) => r.date >= today).map(shapeShift).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 14);
  const recent = shiftRows.filter((r: any) => r.date < today).map(shapeShift).slice(0, 30);

  // Reviews + per-item feedback (reminders / things to fix included).
  let reviews: any[] = [];
  try {
    reviews = await sql`
      SELECT work_date, rating, note, points, auto_points AS "autoPoints", flagged, scope, seen_at
      FROM shift_reviews WHERE employee_id = ${employeeId} AND team_id = ${teamId}
      ORDER BY work_date DESC LIMIT 30`;
  } catch {
    try {
      reviews = await sql`
        SELECT work_date, rating, note, points FROM shift_reviews
        WHERE employee_id = ${employeeId} AND team_id = ${teamId} ORDER BY work_date DESC LIMIT 30`;
    } catch { reviews = []; }
  }
  let items: any[] = [];
  try {
    const taskItems = await sql`
      SELECT i.work_date, i.kind, i.ref_id, i.points, i.note, i.flagged, t.title AS label
      FROM shift_review_items i LEFT JOIN tasks t ON t.id = i.ref_id
      WHERE i.employee_id = ${employeeId} AND i.team_id = ${teamId} AND i.kind = 'task'
      ORDER BY i.work_date DESC LIMIT 30`;
    const procItems = await sql`
      SELECT i.work_date, i.kind, i.ref_id, i.points, i.note, i.flagged, p.name AS label
      FROM shift_review_items i
      LEFT JOIN procedure_runs r ON r.id = i.ref_id
      LEFT JOIN procedures p ON p.id = r.procedure_id
      WHERE i.employee_id = ${employeeId} AND i.team_id = ${teamId} AND i.kind = 'procedure'
      ORDER BY i.work_date DESC LIMIT 30`;
    const closingItems = await sql`
      SELECT i.work_date, i.kind, i.ref_id, i.points, i.note, i.flagged, cc.shift_label AS label
      FROM shift_review_items i LEFT JOIN cash_closings cc ON cc.id = i.ref_id
      WHERE i.employee_id = ${employeeId} AND i.team_id = ${teamId} AND i.kind = 'closing'
      ORDER BY i.work_date DESC LIMIT 30`;
    items = [...taskItems, ...procItems, ...closingItems]
      .map((r: any) => ({
        workDate: r.work_date, kind: r.kind, refId: r.ref_id,
        label: r.label ?? (r.kind === 'task' ? 'Úkol' : r.kind === 'procedure' ? 'Postup' : 'Uzávěrka'),
        points: r.points ?? 0, note: r.note ?? null, flagged: r.flagged === true,
      }))
      .sort((a, b) => String(b.workDate).localeCompare(String(a.workDate)))
      .slice(0, 40);
  } catch { items = []; }

  // Odpracováno tento měsíc — stejná pravidla jako Docházka a Domů
  // (lib/dochazkaPrehled, kolo 69): jen záznamy z TOHOTO podniku,
  // zapomenutý odchod ani záznam nad 24 h se nepočítá. Dřív tu zapomenuté
  // odpíchnutí přidalo třicet hodin a profil ukazoval jiné číslo než Docházka.
  let monthMs = 0;
  try {
    const entries = await sql`
      SELECT clock_in, clock_out FROM time_entries
      WHERE employee_id = ${employeeId} AND (team_id = ${teamId} OR team_id IS NULL)
        AND to_char((clock_in AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM') = ${monthKey}`;
    const nowMs = Date.now();
    monthMs = entries.reduce((sum: number, e: any) =>
      sum + rozeberZaznam({ clockIn: e.clock_in, clockOut: e.clock_out }, nowMs).ms, 0);
  } catch { /* ignore */ }

  // Punctuality, last 30 days: first clock-in of a day vs the planned start.
  // Late = more than 10 minutes after. Days without a plan don't count.
  let punctuality: { checked: number; late: number } | null = null;
  try {
    const rows = await sql`
      SELECT s.date, s.start_time,
             (SELECT MIN(te.clock_in) FROM time_entries te
              WHERE te.employee_id = ${employeeId}
                AND to_char((te.clock_in AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') = s.date) AS first_in
      FROM shifts s
      WHERE s.employee_id = ${employeeId} AND s.start_time IS NOT NULL
        AND s.date >= to_char((NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague' - INTERVAL '30 days', 'YYYY-MM-DD')
        AND s.date <= to_char((NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD')`;
    let checked = 0, late = 0;
    for (const r of rows as any[]) {
      if (!r.first_in) continue;
      checked++;
      const [ph, pm] = String(r.start_time).split(':').map(Number);
      // clock_in is stored as UTC; the planned start is Prague wall clock —
      // compare both in Prague or everyone is "late" by the UTC offset.
      const raw = String(r.first_in);
      const inD = new Date(/Z|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : raw.replace(' ', 'T') + 'Z');
      const [ih, im] = pragueHM(inD).split(':').map(Number);
      const inMin = ih * 60 + im;
      if (inMin - (ph * 60 + pm) > 10) late++;
    }
    if (checked > 0) punctuality = { checked, late };
  } catch { /* ignore */ }

  let closingsMonth = 0;
  try {
    const [r] = await sql`
      SELECT COUNT(*)::int AS n FROM cash_closings
      WHERE created_by = ${employeeId} AND covered_by IS NULL AND date LIKE ${monthKey + '%'}`;
    closingsMonth = r?.n ?? 0;
  } catch { /* ignore */ }

  const kontakty = ma('tym.kontakty');
  return NextResponse.json({
    employee: {
      id: emp.id, name: emp.name, avatar: emp.avatar,
      email: kontakty ? (emp.email ?? null) : null, phone: kontakty ? (emp.phone ?? null) : null,
      jobTitle: emp.jobTitle, hourlyRate: ma('finance.mzdy') ? emp.hourlyRate : null,
    },
    standing: {
      points: totalPoints,
      levelName: st.level.name, levelIndex: st.levelIndex, perks: st.level.perks,
      next: st.next, pctToNext: st.pctToNext, pointsIntoLevel: st.pointsIntoLevel, pointsForNext: st.pointsForNext,
    },
    levels,
    // Celkové body a úroveň (standing) zůstávají — body jsou vidět i
    // v žebříčku. Z čeho se skládají hodnocení, jen s hodnoceni.zobrazit.
    breakdown: hodnoceni
      ? { tasks: tasksDone, procedures, closings: closingsTotal, reviewPoints, autoPoints, itemPoints, ratedShifts, flagged }
      : { tasks: tasksDone, procedures, closings: closingsTotal, reviewPoints: null, autoPoints: null, itemPoints: null, ratedShifts: null, flagged: null },
    shifts: { upcoming, recent },
    reviews: hodnoceni ? reviews : [], items: hodnoceni ? items : [],
    month: { hoursMs: monthMs, shifts: recent.filter(sh => sh.date.startsWith(monthKey)).length + upcoming.filter(sh => sh.date.startsWith(monthKey)).length, closings: closingsMonth },
    punctuality,
  });
}
