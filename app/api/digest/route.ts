// Evening digest: one message per employer per day — revenue, drawer, who
// worked, procedures, and what's running low. All of it already lives in the
// app; this just serves it without being asked.
// Protected like the other crons: Vercel sends Authorization: Bearer $CRON_SECRET.

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { notifyUser } from '@/lib/push';
import { sendDigestEmail } from '@/lib/email';
import { cashDifference, czk } from '@/lib/closing';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

function pragueToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  const key = new URL(request.url).searchParams.get('key');
  const secret = process.env.CRON_SECRET;
  const authorized = !secret || auth === `Bearer ${secret}` || key === secret;
  if (!authorized) return NextResponse.json({ error: 'Neautorizováno' }, { status: 401 });

  const today = pragueToday();
  const dateLabel = new Date(today + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
  let sent = 0;

  try {
    const teams = await sql`SELECT id, name FROM teams ORDER BY id`;
    for (const team of teams as any[]) {
      const employers = await sql`
        SELECT id, email FROM users WHERE team_id = ${team.id} AND role = 'employer'`;
      if (!employers.length) continue;

      // --- closings today ---
      let closings: any[] = [];
      try {
        closings = await sql`SELECT * FROM cash_closings WHERE team_id = ${team.id} AND date = ${today}`;
      } catch { /* ignore */ }
      const revenue = closings.reduce((s, c) => s + (Number(c.cash_revenue) || 0) + (Number(c.card_revenue) || 0), 0);
      const diff = closings.reduce((s, c) => s + cashDifference(c as any), 0);

      // --- who worked (completed entries today) ---
      let worked: { name: string; hours: number }[] = [];
      try {
        const rows = await sql`
          SELECT u.name, SUM(EXTRACT(EPOCH FROM (te.clock_out - te.clock_in))) AS secs
          FROM time_entries te JOIN users u ON u.id = te.employee_id
          WHERE te.team_id = ${team.id} AND te.clock_out IS NOT NULL
            AND to_char(te.clock_in, 'YYYY-MM-DD') = ${today}
          GROUP BY u.name ORDER BY u.name`;
        worked = (rows as any[]).map(r => ({ name: r.name, hours: Math.round((Number(r.secs) || 0) / 360) / 10 }));
      } catch { /* ignore */ }

      // --- required procedures ---
      let procsMissing: string[] = [];
      try {
        const rows = await sql`
          SELECT p.name FROM procedures p
          WHERE p.team_id = ${team.id} AND p.require_before_closing = TRUE
            AND NOT EXISTS (
              SELECT 1 FROM procedure_runs r
              WHERE r.procedure_id = p.id AND r.status = 'completed'
                AND to_char(r.completed_at, 'YYYY-MM-DD') = ${today})`;
        procsMissing = (rows as any[]).map(r => r.name);
      } catch { /* ignore */ }

      // --- stock running low ---
      let lowCount = 0;
      try {
        const [r] = await sql`
          SELECT COUNT(*)::int AS n FROM inventory_items
          WHERE team_id = ${team.id} AND archived IS NOT TRUE
            AND (approved IS DISTINCT FROM FALSE) AND quantity <= min_quantity`;
        lowCount = Number(r?.n) || 0;
      } catch { /* ignore */ }

      // --- tomorrow's events ---
      let tomorrowEvents: any[] = [];
      try {
        const t = new Date(today + 'T12:00:00'); t.setDate(t.getDate() + 1);
        const tomorrow = t.toISOString().slice(0, 10);
        tomorrowEvents = await sql`
          SELECT title, start_time, location FROM events
          WHERE team_id = ${team.id} AND date = ${tomorrow} AND status <> 'cancelled'`;
      } catch { /* ignore */ }

      // Nothing at all happened and nothing needs eyes — stay silent.
      if (closings.length === 0 && worked.length === 0 && procsMissing.length === 0 && lowCount === 0 && tomorrowEvents.length === 0) continue;

      const verdict = closings.length === 0
        ? 'uzávěrka chybí'
        : diff === 0 ? 'kasa sedí ✓' : diff > 0 ? `přebytek +${czk(diff)}` : `manko ${czk(diff)}`;
      const pushBody = [
        closings.length ? `Tržba ${czk(revenue)} · ${verdict}` : 'Bez uzávěrky',
        worked.length ? `${worked.length} lidí odpracovalo ${worked.reduce((s, w) => s + w.hours, 0).toFixed(1)} h` : null,
        procsMissing.length ? `⚠️ nedokončené postupy: ${procsMissing.join(', ')}` : null,
        lowCount ? `${lowCount} položek dochází` : null,
        tomorrowEvents.length ? `Zítra: ${tomorrowEvents.map((e: any) => `${e.title}${e.start_time ? ` od ${String(e.start_time).slice(0, 5)}` : ''}`).join(', ')}` : null,
      ].filter(Boolean).join(' · ');

      const emailHtml = `
        <table style="width:100%; border-collapse: collapse; font-size: 15px;">
          <tr><td style="padding:8px 0; color:#666;">Tržba</td><td style="text-align:right; font-weight:700;">${czk(revenue)}</td></tr>
          <tr><td style="padding:8px 0; color:#666;">Kasa</td><td style="text-align:right; font-weight:700;">${verdict}</td></tr>
          <tr><td style="padding:8px 0; color:#666;">Na směně</td><td style="text-align:right;">${worked.length ? worked.map(w => `${w.name} (${w.hours} h)`).join(', ') : '—'}</td></tr>
          <tr><td style="padding:8px 0; color:#666;">Povinné postupy</td><td style="text-align:right;">${procsMissing.length ? '⚠️ chybí: ' + procsMissing.join(', ') : 'hotové ✓'}</td></tr>
          <tr><td style="padding:8px 0; color:#666;">Docházející zásoby</td><td style="text-align:right;">${lowCount ? lowCount + ' položek' : 'nic ✓'}</td></tr>
          ${tomorrowEvents.length ? `<tr><td style="padding:8px 0; color:#666;">Zítra akce</td><td style="text-align:right;">${tomorrowEvents.map((e: any) => `${e.title}${e.start_time ? ' od ' + String(e.start_time).slice(0, 5) : ''}`).join(', ')}</td></tr>` : ''}
        </table>`;

      for (const e of employers as any[]) {
        try {
          await notifyUser(e.id, {
            title: `🌙 Souhrn dne — ${verdict}`,
            body: pushBody,
            type: diff < 0 || procsMissing.length ? 'warning' : 'info',
            link: '/employer/overview?view=reports',
          });
          if (e.email) await sendDigestEmail(e.email, team.name ?? 'Pangea', dateLabel, emailHtml);
          sent++;
        } catch { /* best-effort per employer */ }
      }
    }
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
  return NextResponse.json({ ok: true, sent, date: today });
}
