import { NextRequest, NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// GET ?date=YYYY-MM-DD&exclude=ID — team members who don't yet have their own
// closing that day, so one person can close for them. Each is flagged whether
// they actually had a shift; someone without one can still be added manually.
export async function GET(req: NextRequest) {
  // Spolupracovníky dne vidí, kdo vyplňuje uzávěrku (kolo 67).
  const c = await pozaduj('uzaverky.vytvorit');
  if (jeOdpoved(c)) return c;
  const meId = c.meId;
  const teamId = c.teamId;

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ coworkers: [] });
  const exclude = parseInt(searchParams.get('exclude') ?? '') || meId;

  // A closing covers the whole shift, so someone already listed in an existing
  // closing's shift_employees is done too — not just its author.
  // Kolo 62: kolega je ten, kdo má v podniku členství NEBO zrcadlo, a jeho
  // směna se hledá jen v tomhle podniku — jinak by „měl směnu" podle podniku B.
  // Filtr na typ účtu (employee/employer, bez tabletu) říká, koho se
  // uzávěrka týká, ne co kdo smí — proto zůstává i po kole 67.
  try {
    const rows = await sql`
      SELECT u.id, u.name, u.avatar,
             sh.start_time AS "startTime", sh.end_time AS "endTime",
             (sh.id IS NOT NULL) AS "hadShift"
      FROM users u
      LEFT JOIN team_members m ON m.user_id = u.id AND m.team_id = ${teamId}
      LEFT JOIN LATERAL (
        SELECT id, start_time, end_time FROM shifts
        WHERE employee_id = u.id AND date = ${date} AND team_id = ${teamId}
        ORDER BY start_time ASC LIMIT 1
      ) sh ON TRUE
      WHERE (m.user_id IS NOT NULL OR u.team_id = ${teamId})
        AND COALESCE(m.role, u.role) IN ('employee','employer')
        AND u.id <> ${exclude}
        AND NOT EXISTS (
          SELECT 1 FROM cash_closings cc
          WHERE COALESCE(cc.shift_date, cc.date) = ${date} AND cc.team_id = ${teamId}
            AND (cc.created_by = u.id OR cc.shift_employees @> to_jsonb(u.id))
        )
      ORDER BY (sh.id IS NULL), u.name ASC`;
    return NextResponse.json({ coworkers: rows });
  } catch {
    try {
      // shift_employees not migrated yet — per-author attribution only.
      const rows = await sql`
        SELECT u.id, u.name, u.avatar,
               sh.start_time AS "startTime", sh.end_time AS "endTime",
               (sh.id IS NOT NULL) AS "hadShift"
        FROM users u
        LEFT JOIN team_members m ON m.user_id = u.id AND m.team_id = ${teamId}
        LEFT JOIN LATERAL (
          SELECT id, start_time, end_time FROM shifts
          WHERE employee_id = u.id AND date = ${date} AND team_id = ${teamId}
          ORDER BY start_time ASC LIMIT 1
        ) sh ON TRUE
        WHERE (m.user_id IS NOT NULL OR u.team_id = ${teamId})
          AND COALESCE(m.role, u.role) IN ('employee','employer')
          AND u.id <> ${exclude}
          AND NOT EXISTS (
            SELECT 1 FROM cash_closings cc
            WHERE cc.created_by = u.id AND cc.date = ${date}
          )
        ORDER BY (sh.id IS NULL), u.name ASC`;
      return NextResponse.json({ coworkers: rows });
    } catch {
      return NextResponse.json({ coworkers: [] });
    }
  }
}
