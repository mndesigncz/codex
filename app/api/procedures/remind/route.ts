import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { notifyUser } from '@/lib/push';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function currentUser() {
  const s = await getServerSession(authOptions);
  if (!s?.user) return null;
  const id = parseInt((s.user as any).id);
  const role = (s.user as any).role as string;
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${id}`;
  return { id, role, teamId: u?.team_id as number | null };
}

// POST { procedureId } → fire the "je čas na …" push/in-app notification.
// Called by the client's ReminderWatcher when a scheduled reminder becomes due,
// so the push goes out even if the tab is backgrounded.
export async function POST(request: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!me.teamId) return NextResponse.json({ error: 'Nejste členem žádného týmu' }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const procedureId = parseInt(body.procedureId);
  if (!procedureId) return NextResponse.json({ error: 'Chybí ID postupu' }, { status: 400 });

  const [proc] = await sql`
    SELECT id, team_id, name FROM procedures WHERE id = ${procedureId}`;
  if (!proc || proc.team_id !== me.teamId) {
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
