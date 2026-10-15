// Výchozí způsob počítání bodů podniku (kolo 91) pro editory položek: okno postupu a úkolu
// ukazují „Podle podniku: Za celý postup 10 b, za nedokončený krok −1 b“ a podle toho
// nabízí body kroku nebo srážku. Jen čtení, stačí být členem podniku.

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { normalizePoints } from '@/lib/rewardLevels';
import { nastaveniRezimu } from '@/lib/bodyRezim';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  let raw: any = null;
  try { const [t] = await sql`SELECT points_config FROM teams WHERE id = ${c.teamId}`; raw = t?.points_config ?? null; } catch { /* výchozí */ }
  const pt = normalizePoints(raw);
  const n = nastaveniRezimu(raw);
  return NextResponse.json({
    postupy: { ...n.postupy, zaklad: pt.procedure },
    ukoly: { ...n.ukoly, zaklad: pt.task },
    uzaverky: { ...n.uzaverky, zaklad: pt.closing },
    denniStrop: n.denniStrop,
    stropOd: n.stropOd,
  });
}
