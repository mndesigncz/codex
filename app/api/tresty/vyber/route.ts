import { NextRequest, NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { clenovePodniku } from '@/lib/tenant';
import { pragueToday } from '@/lib/pragueTime';
import { osadkaSmeny } from '@/lib/trestyPenizeDb';

// GET /api/tresty/vyber?day=RRRR-MM-DD&closingId= (tresty.udelit) — kandidáti pro hromadný výběr v okně
// „Dát trest" a pro záskok (kolo 96): všichni lidé podniku (s rolí a pozicí pro filtr), kdo byl ten den
// na směně (plán i docházka) a kdo byl na uzávěrce. Odpověď { lide, smena: number[], uzaverka: number[] }.

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const c = await pozaduj(['tresty.udelit', 'finance.mzdy']);
  if (jeOdpoved(c)) return c;
  const q = req.nextUrl.searchParams;
  const den = /^\d{4}-\d{2}-\d{2}$/.test(q.get('day') ?? '') ? q.get('day')! : pragueToday();
  const n = Number(q.get('closingId'));
  const closingId = Number.isInteger(n) && n > 0 ? n : null;
  const lide = await clenovePodniku(c.teamId);
  const ids = new Set(lide.map(l => l.id));
  const o = await osadkaSmeny(c.teamId, den, closingId);
  return NextResponse.json({
    day: den,
    lide: lide.map(l => ({ id: l.id, name: l.name, avatar: l.avatar, role: l.role, jobTitle: l.jobTitle })),
    smena: o.smena.filter(id => ids.has(id)),
    uzaverka: o.uzaverka.filter(id => ids.has(id)),
  });
}
