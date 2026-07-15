import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function context() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const meId = parseInt((session.user as any).id);
  const role = (session.user as any).role as string;
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  return { meId, role, teamId: u?.team_id as number | undefined };
}

// POST (employer) — { month, rows: [{employeeId, date, startTime, endTime, type}] }
// Rows are already parsed client-side from CSV; this just persists them.
export async function POST(req: Request) {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (ctx.role !== 'employer') return NextResponse.json({ error: 'Pouze pro zaměstnavatele' }, { status: 403 });
  if (!ctx.teamId) return NextResponse.json({ error: 'Bez týmu' }, { status: 400 });

  const body = await req.json();
  const rows: any[] = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) return NextResponse.json({ inserted: 0 });

  let inserted = 0;
  const errors: string[] = [];
  for (const r of rows) {
    const employeeId = parseInt(r.employeeId);
    if (!employeeId || !r.date || !r.startTime || !r.endTime) {
      errors.push(`Přeskočen neúplný řádek: ${JSON.stringify(r)}`);
      continue;
    }
    // ensure the employee belongs to this team
    const [emp] = await sql`SELECT id FROM users WHERE id = ${employeeId} AND team_id = ${ctx.teamId}`;
    if (!emp) {
      errors.push(`Zaměstnanec #${employeeId} není v týmu`);
      continue;
    }
    await sql`
      INSERT INTO shifts (team_id, employee_id, date, start_time, end_time, type)
      VALUES (${ctx.teamId}, ${employeeId}, ${r.date}, ${r.startTime}, ${r.endTime}, ${r.type ?? 'flexible'})`;
    inserted++;
  }
  return NextResponse.json({ inserted, errors });
}
