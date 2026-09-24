import { NextResponse } from 'next/server';
import { checkCron } from '@/lib/cronAuth';
import { neon } from '@neondatabase/serverless';
import { notifyUser } from '@/lib/push';
import { windowOf } from '@/lib/shiftWindow';
import { clenoveSOpravnenim, maOpravneni } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// Daily cron (21:00 UTC): remind anyone whose shift today has ended but who
// hasn't submitted a cash closing yet, and nudge those who may approve
// (uzaverky.schvalovat) about closings still waiting for approval.
export async function GET(request: Request) {
  // Protected like the other crons: Vercel sends Authorization: Bearer $CRON_SECRET.
  const gate = checkCron(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const now = new Date();
  // Local (Europe/Prague) date + HH:MM for comparing against shift end_time.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  const today = `${get('year')}-${get('month')}-${get('day')}`;
  const nowHM = `${get('hour')}:${get('minute')}`;

  let reminded = 0;
  try {
    // Dnešní směny bez uzávěrky. Jestli už SKONČILY, rozhodne až okno směny
    // níž — porovnání `end_time <= nowHM` bylo textové, takže směna 18:00–02:00
    // měla ve 23:00 „02:00" menší než „23:00" a člověk uprostřed směny dostal
    // „tvoje směna skončila, vyplň uzávěrku".
    const due = await sql`
      SELECT s.employee_id AS id, s.team_id, s.date, s.start_time, s.end_time, u.name
      FROM shifts s
      JOIN users u ON u.id = s.employee_id
      WHERE s.date = ${today}
        AND NOT EXISTS (
          SELECT 1 FROM cash_closings cc
          WHERE cc.created_by = s.employee_id AND COALESCE(cc.shift_date, cc.date) = ${today}
        )`;
    // De-dupe employees (one nudge even with multiple shifts).
    const seen = new Set<number>();
    for (const r of due) {
      const w = windowOf(r as any, today);
      // Bez čitelných časů se řídíme starým pravidlem (textově), ať se
      // připomínka neztratí; jinak jen po skutečném konci směny.
      const skoncila = w ? now.getTime() >= w.end.getTime() : String(r.end_time ?? '') <= nowHM;
      if (!skoncila) continue;
      if (seen.has(r.id)) continue;
      // Připomínat uzávěrku tomu, kdo ji podle své role vyplnit nesmí (třeba
      // Kuchař), by jen otravovalo — kolo 67. Vedení i Barista ji smí, pro ně
      // se nic nemění. Směna bez podniku (stará data) jde postaru.
      if (r.team_id != null && !(await maOpravneni(Number(r.id), Number(r.team_id), 'uzaverky.vytvorit'))) continue;
      seen.add(r.id);
      try {
        await notifyUser(r.id, {
          title: '📊 Nezapomeň na uzávěrku',
          body: 'Tvoje směna skončila — vyplň prosím uzávěrku kasy.',
          type: 'warning',
          link: '/employee/shifts?view=closing',
        });
        reminded++;
      } catch { /* best-effort */ }
    }
  } catch (e) {
    console.error('closing remind failed', e);
  }

  // Closings waiting for approval — one nudge per team per run.
  let nudgedEmployers = 0;
  try {
    const pending = await sql`
      SELECT cc.team_id, COUNT(*)::int AS n
      FROM cash_closings cc
      WHERE cc.approved = FALSE
      GROUP BY cc.team_id`;
    for (const t of pending as any[]) {
      if (!t.team_id || !t.n) continue;
      // Kolo 62: podle členství — provozovatel přepnutý do jiného podniku
      // o čekajících uzávěrkách dřív nedostal ani slovo. Kolo 67: příjemce
      // určuje oprávnění uzaverky.schvalovat, ne typ účtu.
      const employers = await clenoveSOpravnenim(Number(t.team_id), 'uzaverky.schvalovat');
      for (const eid of employers) {
        try {
          await notifyUser(eid, {
            title: '⚠️ Uzávěrky ke schválení',
            body: `${t.n} ${t.n === 1 ? 'uzávěrka čeká' : t.n <= 4 ? 'uzávěrky čekají' : 'uzávěrek čeká'} na tvoje schválení.`,
            type: 'warning',
            link: '/employer/overview?view=reports',
          });
          nudgedEmployers++;
        } catch { /* best-effort */ }
      }
    }
  } catch { /* approved column may not exist yet */ }

  return NextResponse.json({ ok: true, reminded, nudgedEmployers });
}
