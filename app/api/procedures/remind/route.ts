import { NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { neon } from '@neondatabase/serverless';
import { notifyUser } from '@/lib/push';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// POST { procedureId } → fire the "je čas na …" push/in-app notification.
// Called by the client's ReminderWatcher when a scheduled reminder becomes due,
// so the push goes out even if the tab is backgrounded.
export async function POST(request: Request) {
  // Upozornění jde jen volajícímu samotnému, proto stačí členství v podniku.
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  const me = { id: c.meId, teamId: c.teamId };

  const body = await request.json().catch(() => ({}));
  const procedureId = parseInt(body.procedureId);
  if (!procedureId) return NextResponse.json({ error: 'Chybí ID postupu' }, { status: 400 });

  const [proc] = await sql`
    SELECT id, team_id, name FROM procedures WHERE id = ${procedureId}`;
  if (!proc || Number(proc.team_id) !== me.teamId) {
    return NextResponse.json({ error: 'Postup nenalezen' }, { status: 404 });
  }

  await notifyUser(me.id, {
    title: `Je čas na ${proc.name}`,
    body: 'Spusť postup podle seznamu',
    type: 'shift',
    link: '/',
  });

  return NextResponse.json({ ok: true });
}
