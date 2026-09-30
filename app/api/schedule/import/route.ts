import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { idClenu } from '@/lib/tenant';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { platnyCas, platneDatum } from '@/lib/rozvrhCsv';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// POST — { month, rows: [{employeeId, date, startTime, endTime, type}] }
// Rows are already parsed client-side from CSV; this just persists them.
export async function POST(req: Request) {
  // Import je jen hromadné přidání směn — stejný klíč jako ruční přidání.
  const ctx = await pozaduj('rozvrh.upravit');
  if (jeOdpoved(ctx)) return ctx;

  const body = await req.json();
  const rows: any[] = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) return NextResponse.json({ inserted: 0 });

  // Členství jednou před cyklem (kolo 62): člen přepnutý jinam dřív dostal
  // „není v týmu" a jeden dotaz na řádek CSV byl zbytečný.
  const clenove = new Set(await idClenu(ctx.teamId));
  let inserted = 0;
  const errors: string[] = [];
  for (const r of rows) {
    const employeeId = parseInt(r.employeeId);
    if (!employeeId || !r.date || !r.startTime || !r.endTime) {
      errors.push(`Přeskočen neúplný řádek: ${JSON.stringify(r)}`);
      continue;
    }
    if (!clenove.has(employeeId)) {
      errors.push(`Zaměstnanec #${employeeId} není v týmu`);
      continue;
    }
    // Klient čas ověřuje, ale API je volatelné i mimo něj: nečitelný čas by v
    // pokrytí tiše vypadl z výpočtu děr (toMinutes → null).
    const od = platnyCas(r.startTime), doCasu = platnyCas(r.endTime);
    if (!platneDatum(r.date) || !od || !doCasu) {
      errors.push(`Přeskočen řádek s neplatným datem nebo časem: ${JSON.stringify(r)}`);
      continue;
    }
    await sql`
      INSERT INTO shifts (team_id, employee_id, date, start_time, end_time, type)
      VALUES (${ctx.teamId}, ${employeeId}, ${r.date}, ${od}, ${doCasu}, ${String(r.type ?? 'flexible').slice(0, 60)})`;
    inserted++;
  }
  return NextResponse.json({ inserted, errors });
}
