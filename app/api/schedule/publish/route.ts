// "Publikovat rozvrh" — tell everyone who has a shift that month that the
// schedule is out. Before this existed the button only showed a note and
// nobody was actually told anything.

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { notifyUsers } from '@/lib/push';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';

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
    return NextResponse.json({ ok: true, notified: ids.length });
  } catch {
    return NextResponse.json({ error: 'Publikování se nepodařilo' }, { status: 500 });
  }
}
