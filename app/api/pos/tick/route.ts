// Tik: aplikace se sama postará o čerstvá data z pokladny.
//
// Hobby plán Vercelu pustí cron jen jednou denně, jenže tržby se mění po
// minutách. Tenhle endpoint volá každé otevřené okno aplikace (vedení,
// zaměstnanec i kiosk na baru) — a kiosk běží celý den, takže se pokladna
// synchronizuje průběžně bez toho, aby na to někdo myslel. Škrticí klapka
// je uvnitř syncBills: kdo přijde do pěti minut po posledním běhu, dostane
// „přeskočeno" a pokladnu neobtěžuje.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { runFullSync } from '@/lib/posMirror';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const meId = parseInt((session.user as any).id);
  const role = (session.user as any).role as string;
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  if (!u?.team_id) return NextResponse.json({ connected: false });
  try {
    const r = await runFullSync(Number(u.team_id), role === 'employer' ? meId : null, { force: false });
    return NextResponse.json({ connected: r.bills.skipped !== 'not-connected', sync: r.bills, writeOff: r.writeOff ?? null });
  } catch {
    return NextResponse.json({ connected: true, error: 'Synchronizace se nepodařila.' }, { status: 502 });
  }
}
