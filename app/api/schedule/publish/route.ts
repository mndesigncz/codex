// "Publikovat rozvrh" — tell everyone who has a shift that month that the
// schedule is out. Before this existed the button only showed a note and
// nobody was actually told anything.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { notifyUsers } from '@/lib/push';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const meId = parseInt((session.user as any).id);
  const [me] = await sql`SELECT id, role, team_id FROM users WHERE id = ${meId}`;
  if (!me || me.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const month = String(b.month ?? ''); // "YYYY-MM"
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: 'Neplatný měsíc' }, { status: 400 });

  try {
    const rows = await sql`
      SELECT DISTINCT s.employee_id AS id
      FROM shifts s JOIN users u ON u.id = s.employee_id
      WHERE u.team_id = ${me.team_id} AND s.date LIKE ${month + '-%'} AND s.employee_id <> ${meId}`;
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
