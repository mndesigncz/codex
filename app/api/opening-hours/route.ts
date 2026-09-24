import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// Otevírací dobu čte každý člen. Uložit ji smí podnik.oteviraci_doba —
// oponentura kola 67 ji oddělila od podnik.nastaveni (měna, formát čísel),
// protože na ní stojí rozvrh a potřebuje ji i Provozní.

// Default: open 08:00–20:00 all week
function defaults() {
  const oh: Record<string, { open: string; close: string; closed: boolean }> = {};
  for (let d = 0; d <= 6; d++) oh[String(d)] = { open: '08:00', close: '20:00', closed: false };
  return oh;
}

// GET — team opening_hours (JSONB) keyed by weekday 0=Mon..6=Sun
export async function GET() {
  const ctx = await pozaduj(null);
  if (jeOdpoved(ctx)) return ctx;

  const [team] = await sql`SELECT opening_hours FROM teams WHERE id = ${ctx.teamId}`;
  const openingHours = team?.opening_hours && Object.keys(team.opening_hours).length > 0 ? team.opening_hours : defaults();
  return NextResponse.json({ openingHours });
}

// PUT — save whole opening_hours object
export async function PUT(req: Request) {
  const ctx = await pozaduj('podnik.oteviraci_doba');
  if (jeOdpoved(ctx)) return ctx;

  const body = await req.json();
  const raw = body.openingHours ?? body;

  // Normalize to 0..6 keys with open/close/closed
  const clean: Record<string, { open: string; close: string; closed: boolean }> = {};
  for (let d = 0; d <= 6; d++) {
    const key = String(d);
    const v = raw?.[key] ?? {};
    clean[key] = {
      open: /^\d{2}:\d{2}$/.test(v.open) ? v.open : '08:00',
      close: /^\d{2}:\d{2}$/.test(v.close) ? v.close : '20:00',
      closed: !!v.closed,
    };
  }

  await sql`UPDATE teams SET opening_hours = ${JSON.stringify(clean)} WHERE id = ${ctx.teamId}`;
  return NextResponse.json({ ok: true, openingHours: clean });
}
