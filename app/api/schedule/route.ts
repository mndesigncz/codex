import { NextResponse } from 'next/server';
import { coverageGaps, missingSlots } from '@/lib/coverage';
import { audit } from '@/lib/audit';
import { neon } from '@neondatabase/serverless';
import { tymyCiselniku, idClenu } from '@/lib/tenant';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// GET ?month=YYYY-MM — all shifts in month for the team, joined with employee name+avatar
// Plánovač rozvrhu (kolo 67): dřív ho API vydalo komukoli z podniku, i když
// zaměstnanci vidí jen náhled přes /api/shifts?team=1 (a ten jde vypnout).
// Poptávka z rezervací jsou jen počty na den, proto nevyžaduje rezervace.zobrazit.
export async function GET(req: Request) {
  const ctx = await pozaduj('rozvrh.zobrazit');
  if (jeOdpoved(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month');
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Neplatný měsíc' }, { status: 400 });
  }

  const rows = await sql`
    SELECT s.id, s.employee_id, s.date, s.start_time, s.end_time, s.type,
           u.name AS employee_name, u.avatar AS employee_avatar
    FROM shifts s
    JOIN users u ON u.id = s.employee_id
    WHERE s.team_id = ${ctx.teamId} AND to_char(s.date::date, 'YYYY-MM') = ${month}
    ORDER BY s.date ASC, s.start_time ASC`;

  const shifts = rows.map((r: any) => ({
    id: r.id,
    employeeId: r.employee_id,
    employeeName: r.employee_name,
    employeeAvatar: r.employee_avatar ?? '👤',
    date: typeof r.date === 'string' ? r.date : new Date(r.date).toISOString().split('T')[0],
    startTime: r.start_time,
    endTime: r.end_time,
    type: r.type,
  }));
  // Díry v pokrytí se počítají i pro uložený rozvrh — vzniknou i ruční
  // úpravou, ne jen generováním, a vedení je musí vidět hned.
  let gaps: { date: string; from: string; to: string; minutes: number }[] = [];
  let understaffed: { date: string; shiftTypeName: string }[] = [];
  try {
    const [team] = await sql`SELECT opening_hours FROM teams WHERE id = ${ctx.teamId}`;
    const oh = team?.opening_hours;
    if (oh && typeof oh === 'object') {
      const byDate = new Map<string, { start: string; end: string; type: string }[]>();
      for (const sh of shifts) {
        const list = byDate.get(sh.date) ?? [];
        list.push({ start: sh.startTime, end: sh.endTime, type: sh.type });
        byDate.set(sh.date, list);
      }
      // Kontrolují se jen dny, na které je něco naplánované — prázdný budoucí
      // měsíc by jinak svítil celý červeně.
      const dates = Array.from(byDate.keys()).sort();
      gaps = coverageGaps(oh as any, byDate, dates);
      // I typy ze zdrojového podniku organizace (kolo 60) — obsazují se
      // podle otevírací doby TOHOHLE podniku.
      const tymy = await tymyCiselniku(ctx.teamId, 'typySmen');
      const types = await sql`
        SELECT name, start_time, end_time, starts_at_open, ends_at_close
        FROM shift_types WHERE team_id = ANY(${tymy})
        ORDER BY (team_id = ${ctx.teamId}) DESC, position ASC, id ASC` as any[];
      understaffed = missingSlots(oh as any, types as any, byDate, dates);
    }
  } catch { /* bez otevírací doby se pokrytí neřeší */ }

  // Poptávka na den z Managero client: potvrzené rezervace a kolik lidí
  // v nich je. Rozvrh se jinak plánuje naslepo, přestože podnik už ví, kolik
  // hostů na ten den čeká.
  let demand: Record<string, { reservations: number; guests: number }> = {};
  try {
    const rows = await sql`
      SELECT date, COUNT(*)::int AS n, COALESCE(SUM(party), 0)::int AS guests
      FROM client_reservations
      WHERE team_id = ${ctx.teamId} AND status IN ('confirmed', 'seated')
        AND to_char(date::date, 'YYYY-MM') = ${month}
      GROUP BY date` as any[];
    for (const r of rows) {
      const day = typeof r.date === 'string' ? r.date : new Date(r.date).toISOString().split('T')[0];
      demand[day] = { reservations: Number(r.n) || 0, guests: Number(r.guests) || 0 };
    }
  } catch { /* Managero client nemusí být zapnutý */ }

  return NextResponse.json({ shifts, gaps, understaffed, demand });
}

// POST (employer) — { shifts: [{employeeId, date, startTime, endTime, type}] } bulk append
export async function POST(req: Request) {
  const ctx = await pozaduj('rozvrh.upravit');
  if (jeOdpoved(ctx)) return ctx;

  const body = await req.json();
  const list: any[] = Array.isArray(body.shifts) ? body.shifts : [];
  if (list.length === 0) return NextResponse.json({ inserted: 0 });

  // Kdo z týmu smí dostat směnu — načteno jednou. Bez téhle kontroly by šlo
  // uhádnutým employeeId založit směnu cizímu uživateli (jeho jméno pak uniká
  // do rozvrhu týmu A a oběti se objeví fantomová směna v jejím rozvrhu/docházce).
  // Podle členství (kolo 62), ať člen přepnutý jinam není tiše přeskočen.
  const memberIds = new Set(await idClenu(ctx.teamId));

  let inserted = 0;
  for (const s of list) {
    const employeeId = parseInt(s.employeeId);
    if (!employeeId || !s.date || !s.startTime || !s.endTime) continue;
    if (!memberIds.has(employeeId)) continue; // cizí zaměstnanec — přeskoč
    await sql`
      INSERT INTO shifts (team_id, employee_id, date, start_time, end_time, type)
      VALUES (${ctx.teamId}, ${employeeId}, ${s.date}, ${s.startTime}, ${s.endTime}, ${s.type ?? 'flexible'})`;
    inserted++;
  }
  return NextResponse.json({ inserted });
}

// DELETE ?id= (single) or ?month= (clear month)
// Smazání jedné směny je běžná úprava; vymazání celého měsíce je hromadná
// nevratná akce, proto má vlastní klíč (Provozní ho nemá).
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const month = searchParams.get('month');
  const ctx = await pozaduj(id ? 'rozvrh.upravit' : 'rozvrh.mazat_mesic');
  if (jeOdpoved(ctx)) return ctx;

  if (id) {
    await sql`DELETE FROM shifts WHERE id = ${parseInt(id)} AND team_id = ${ctx.teamId}`;
    return NextResponse.json({ ok: true });
  }
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    await sql`
      DELETE FROM shifts
      WHERE team_id = ${ctx.teamId} AND to_char(date::date, 'YYYY-MM') = ${month}`;
    audit(ctx.teamId, ctx.meId, 'schedule.clearMonth', 'schedule', null, month);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Chybí id nebo měsíc' }, { status: 400 });
}
