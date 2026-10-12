// "Publikovat rozvrh" — tell everyone who has a shift that month that the
// schedule is out. Before this existed the button only showed a note and
// nobody was actually told anything.
//
// Kolo 7 (R7-1): publikování se pamatuje — schedule_publications (podnik × měsíc) dostane
// čas, autora, počet směn a otisk směn měsíce. Otisk je TENTÝŽ výraz jako `verze` v GET
// /api/schedule (a v generate/route.ts), ať plánovač pozná „Změněno od publikování".

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { notifyUsers } from '@/lib/push';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { parseDbTime } from '@/lib/pragueTime';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function POST(req: NextRequest) {
  // Dřív se tu četlo zrcadlo users.role; teď oprávnění z členství v aktivním podniku.
  const c = await pozaduj('rozvrh.publikovat');
  if (jeOdpoved(c)) return c;
  const { meId, teamId } = c;

  const b = await req.json().catch(() => ({}));
  const month = String(b.month ?? ''); // "YYYY-MM"
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: 'Neplatný měsíc' }, { status: 400 });

  try {
    const rows = await sql`
      SELECT DISTINCT s.employee_id AS id
      FROM shifts s JOIN users u ON u.id = s.employee_id
      WHERE s.team_id = ${teamId} AND s.date LIKE ${month + '-%'} AND s.employee_id <> ${meId}`;
    const ids = (rows as any[]).map(r => Number(r.id)).filter(Number.isFinite);
    const label = new Date(month + '-01T00:00:00').toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });
    if (ids.length) {
      await notifyUsers(ids, {
        title: '📅 Rozvrh je venku',
        body: `Rozvrh na ${label} je hotový — mrkni na své směny.`,
        type: 'shift',
        category: 'shift',
        link: '/employee/shifts?view=my-shifts',
      });
    }
    // Stav publikování. Prázdný měsíc se nezapisuje (není co publikovat — Chip by tvrdil
    // „Publikováno" nad prázdnou mřížkou). Selhání zápisu (tabulka před migrací) publikování
    // nezvrátí: lidé už upozornění dostali.
    let publishedAt: string | null = null;
    try {
      const [o] = await sql`
        SELECT md5(COALESCE(string_agg(id::text || '|' || employee_id::text || '|' || date || '|' || start_time || '|' || end_time, ',' ORDER BY id), '')) AS verze,
               COUNT(*)::int AS n
        FROM shifts WHERE team_id = ${teamId} AND date >= ${month + '-01'} AND date <= ${month + '-31'}` as any[];
      const n = Number(o?.n) || 0;
      if (n > 0) {
        const [p] = await sql`
          INSERT INTO schedule_publications (team_id, month, published_at, created_by, shift_count, shifts_hash)
          VALUES (${teamId}, ${month}, NOW(), ${meId}, ${n}, ${o?.verze ?? null})
          ON CONFLICT (team_id, month) DO UPDATE
            SET published_at = NOW(), created_by = EXCLUDED.created_by, shift_count = EXCLUDED.shift_count, shifts_hash = EXCLUDED.shifts_hash
          RETURNING published_at` as any[];
        publishedAt = parseDbTime(p?.published_at ?? null)?.toISOString() ?? null;
        await audit(teamId, meId, 'rozvrh.publikovat', 'schedule', null, `${month}: ${n} směn, upozornění ${ids.length}`);
      }
    } catch (e) { console.error('schedule_publications: zápis se nepovedl', e); }
    return NextResponse.json({ ok: true, notified: ids.length, publishedAt });
  } catch {
    return NextResponse.json({ error: 'Publikování se nepodařilo' }, { status: 500 });
  }
}
