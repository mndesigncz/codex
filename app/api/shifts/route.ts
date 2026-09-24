import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { tymyCiselniku, jeClenem } from '@/lib/tenant';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

const LEGACY_LABEL: Record<string, string> = { morning: 'Ranní', afternoon: 'Odpolední', flexible: 'Vlastní' };

// Resolve a shift's display name + colour from the team's configured shift
// types (by name, then by exact times), falling back to the legacy labels.
// Typy ze zdrojového podniku organizace (kolo 60) jdou za vlastními, takže
// lokální stejnojmenný typ vyhraje.
async function typeResolver(teamId: number | null) {
  let types: any[] = [];
  if (teamId) {
    try {
      const tymy = await tymyCiselniku(teamId, 'typySmen');
      types = await sql`
        SELECT name, start_time, end_time, color FROM shift_types WHERE team_id = ANY(${tymy})
        ORDER BY (team_id = ${teamId}) DESC, position ASC, id ASC`;
    } catch { /* table issue */ }
  }
  return (r: any): { label: string; color: string } => {
    const byName = types.find((t) => t.name === r.type);
    if (byName) return { label: byName.name, color: byName.color || '#64748B' };
    const byTime = types.find((t) => t.start_time === r.start_time && t.end_time === r.end_time);
    if (byTime) return { label: byTime.name, color: byTime.color || '#64748B' };
    const legacy = LEGACY_LABEL[r.type as string];
    if (legacy) return { label: legacy, color: r.type === 'morning' ? '#C8F542' : r.type === 'afternoon' ? '#3B82F6' : '#64748B' };
    return { label: r.type || 'Směna', color: '#64748B' };
  };
}

const shape = (r: any, resolve?: (r: any) => { label: string; color: string }) => {
  const rt = resolve ? resolve(r) : null;
  return {
    id: r.id, teamId: r.team_id, employeeId: r.employee_id, date: r.date,
    startTime: r.start_time, endTime: r.end_time, type: r.type,
    start_time: r.start_time, end_time: r.end_time,
    typeLabel: rt?.label ?? r.type, typeColor: rt?.color ?? '#64748B',
  };
};

// GET — vlastní směny má každý člen; celý tým jen s plánovačem rozvrhu.
export async function GET(req: NextRequest) {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  const opr = c.role.opravneni;

  const { searchParams } = new URL(req.url);
  const employeeIdParam = searchParams.get('employeeId');

  if (employeeIdParam) {
    // Vlastní směny každý; cizí jen s plánovačem rozvrhu — nebo s hodnocením
    // směn, jehož detail (ShiftReviewModal) si směny člověka načítá.
    const employeeId = parseInt(employeeIdParam);
    const cizi = employeeId !== c.meId;
    if (cizi && !opr.has('rozvrh.zobrazit') && !opr.has('hodnoceni.zobrazit')) {
      return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
    }
    if (cizi) {
      // Členství, ne zrcadlo (kolo 62): směny člena přepnutého jinam nesou team_id tohohle podniku.
      if (!(await jeClenem(employeeId, c.teamId))) return NextResponse.json([]);
    }
    const resolve = await typeResolver(c.teamId);
    // Filtr týmu: člověk ve dvou podnicích má směny v obou a vedení A nemá
    // vidět jeho rozvrh v B (ani on sám ho tady, kde je přepnutý do A).
    const rows = await sql`SELECT * FROM shifts WHERE employee_id = ${employeeId} AND team_id = ${c.teamId} ORDER BY date ASC`;
    return NextResponse.json(rows.map((r: any) => shape(r, resolve)));
  }

  // Náhled rozvrhu celého týmu — jen jména a časy, bez sazeb a bez čehokoli,
  // co do rozvrhu nepatří. Dřívější přepínač show_team_schedule teď znamená
  // roli bez rozvrh.nahled (řeší roleClena), takže stačí kontrolovat klíč.
  // Bez něj tvar „vypnuto", ne 403 — obrazovka Rozvrh týmu na něj umí odpovědět.
  if (searchParams.get('team') === '1') {
    if (!opr.has('rozvrh.nahled')) return NextResponse.json({ shifts: [], people: [], enabled: false });
    const resolveTeam = await typeResolver(c.teamId);
    const month = searchParams.get('month');
    const rows = /^\d{4}-\d{2}$/.test(String(month))
      ? await sql`
          SELECT s.*, u.name AS employee_name, u.avatar AS employee_avatar
          FROM shifts s JOIN users u ON u.id = s.employee_id
          WHERE s.team_id = ${c.teamId}
            AND to_char(s.date::date, 'YYYY-MM') = ${month}
          ORDER BY s.date ASC, s.start_time ASC`
      : await sql`
          SELECT s.*, u.name AS employee_name, u.avatar AS employee_avatar
          FROM shifts s JOIN users u ON u.id = s.employee_id
          WHERE s.team_id = ${c.teamId}
          ORDER BY s.date ASC, s.start_time ASC`;
    return NextResponse.json({
      enabled: true,
      shifts: (rows as any[]).map(r => ({
        ...shape(r, resolveTeam),
        employeeName: r.employee_name,
        employeeAvatar: r.employee_avatar,
        isMine: r.employee_id === c.meId,
      })),
    });
  }

  const resolve = await typeResolver(c.teamId);
  if (opr.has('rozvrh.zobrazit')) {
    const rows = await sql`
      SELECT s.* FROM shifts s
      JOIN users u ON u.id = s.employee_id
      WHERE s.team_id = ${c.teamId}
      ORDER BY s.date ASC`;
    return NextResponse.json({ shifts: rows.map((r: any) => shape(r, resolve)), requests: [] });
  }

  const rows = await sql`SELECT * FROM shifts WHERE employee_id = ${c.meId} ORDER BY date ASC`;
  return NextResponse.json({ shifts: rows.map((r: any) => shape(r, resolve)), requests: [] });
}

// POST — create a shift for a team member.
export async function POST(req: NextRequest) {
  const c = await pozaduj('rozvrh.upravit');
  if (jeOdpoved(c)) return c;

  const b = await req.json().catch(() => ({}));
  const employeeId = parseInt(b.employeeId);
  if (!Number.isFinite(employeeId)) return NextResponse.json({ error: 'Chybí zaměstnanec' }, { status: 400 });

  // Členství, ne zrcadlo (kolo 62); tablet směnu nedostane.
  if (!(await jeClenem(employeeId, c.teamId))) {
    return NextResponse.json({ error: 'Zaměstnanec není ve vašem týmu' }, { status: 400 });
  }

  const [row] = await sql`
    INSERT INTO shifts (team_id, employee_id, date, start_time, end_time, type)
    VALUES (${c.teamId}, ${employeeId}, ${b.date}, ${b.startTime}, ${b.endTime}, ${b.type ?? 'custom'})
    RETURNING *`;
  return NextResponse.json(shape(row));
}
