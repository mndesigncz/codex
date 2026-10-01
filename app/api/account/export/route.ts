import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { hit } from '@/lib/rateLimit';
import { sestavExport, nazevExportu } from '@/lib/exportUctu';

export const dynamic = 'force-dynamic';

// „Stáhnout moje data" (Nastavení → Data a soukromí). Osobní věc účtu: žádná brána oprávněním,
// jen přihlášení. KAŽDÝ dotaz je omezený na vlastní id přihlášeného (employee_id / sender_id /
// user_id = me), takže v souboru nejsou cizí směny ani cizí zprávy ani data podniku.
// Sekce, kterou databáze (ještě) nemá, se vynechá a jmenuje se v `nedostupne`.

const sql = neon(process.env.DATABASE_URL!);
const STROP = 20000;

async function sekce<T>(f: () => Promise<T>): Promise<T | null> {
  try { return await f(); } catch { return null; }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const id = parseInt((session.user as any).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });

  // Export je drahý dotaz a obsahuje osobní údaje: pár stažení za hodinu stačí.
  const brana = await hit(`export-dat:${id}`, 6, 60 * 60, { failClosed: true });
  if (!brana.ok) return NextResponse.json({ error: 'Příliš mnoho stažení. Zkus to později.' }, { status: 429 });

  const [ucet, nastaveni, clenstvi, smeny, dochazka, volno, dostupnost, zpravy] = await Promise.all([
    sekce(async () => {
      const [u] = await sql`SELECT id, name, email, avatar, phone, job_title, shift_preference, theme, role, created_at FROM users WHERE id = ${id}`;
      return (u ?? null) as Record<string, unknown> | null;
    }),
    sekce(async () => {
      const [u] = await sql`SELECT lang, notif_prefs FROM users WHERE id = ${id}`;
      return u ? { jazyk: u.lang ?? null, preference: u.notif_prefs ?? {} } : null;
    }),
    sekce(async () => await sql`
      SELECT tm.team_id, t.name AS podnik, tm.role, tm.job_title, tm.created_at
      FROM team_members tm JOIN teams t ON t.id = tm.team_id
      WHERE tm.user_id = ${id} ORDER BY tm.team_id` as Record<string, unknown>[]),
    sekce(async () => await sql`
      SELECT id, team_id, date, start_time, end_time, type
      FROM shifts WHERE employee_id = ${id} ORDER BY date, id LIMIT ${STROP}` as Record<string, unknown>[]),
    sekce(async () => await sql`
      SELECT id, team_id, clock_in, clock_out, source, note
      FROM time_entries WHERE employee_id = ${id} ORDER BY clock_in, id LIMIT ${STROP}` as Record<string, unknown>[]),
    sekce(async () => await sql`
      SELECT id, team_id, from_date, to_date, type, note, status, created_at
      FROM time_off_requests WHERE employee_id = ${id} ORDER BY id LIMIT ${STROP}` as Record<string, unknown>[]),
    sekce(async () => await sql`
      SELECT id, team_id, month, unavailable_dates, preferred_shift, max_shifts, note, status, created_at
      FROM availability_requests WHERE employee_id = ${id} ORDER BY id LIMIT ${STROP}` as Record<string, unknown>[]),
    // Jen zprávy, které jsem napsal já (sender_id = me): cizí slova patří jejich autorům.
    sekce(async () => await sql`
      SELECT m.id, m.conversation_id, c.team_id, m.content, m.attachment_name, m.created_at
      FROM chat_messages m LEFT JOIN conversations c ON c.id = m.conversation_id
      WHERE m.sender_id = ${id} ORDER BY m.id LIMIT ${STROP}` as Record<string, unknown>[]),
  ]);

  const ted = new Date();
  const dokument = sestavExport({ ucet, nastaveni, clenstvi, smeny, dochazka, volno, dostupnost, zpravy }, ted);
  return new NextResponse(JSON.stringify(dokument, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nazevExportu(ted)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
