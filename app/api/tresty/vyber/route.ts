import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { clenovePodniku } from '@/lib/tenant';
import { pragueToday } from '@/lib/pragueTime';
import { normalizujSmlouvu } from '@/lib/dochazkaPrehled';
import { osadkaSmeny } from '@/lib/trestyPenizeDb';

// GET /api/tresty/vyber?day=RRRR-MM-DD&closingId= (tresty.udelit) — kandidáti pro hromadný výběr v okně
// „Dát trest" a pro záskok (kolo 96): všichni lidé podniku (s rolí a pozicí pro filtr), kdo byl ten den
// na směně (plán i docházka) a kdo byl na uzávěrce. Odpověď { lide, smena: number[], uzaverka: number[] }.
// S finance.mzdy nese každý člověk i `smlouva` (HPP / DPP / DPC / OSVC / null) — okno podle ní řekne,
// jestli srážka počká na souhlas, a souhrn sedí se serverem i bez práva na docházku.

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

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
  // Typ smlouvy jen pro toho, kdo smí peníze (stejná pravidla jako srážka: neznámý typ = čeká na souhlas).
  let smlouvy: Map<number, string | null> | null = null;
  if (c.role.opravneni.has('finance.mzdy')) {
    smlouvy = new Map();
    try {
      const rows = await sql`SELECT user_id, contract_type FROM team_members WHERE team_id = ${c.teamId}`;
      for (const r of rows as { user_id: unknown; contract_type: unknown }[]) smlouvy.set(Number(r.user_id), normalizujSmlouvu(r.contract_type));
    } catch { /* před migrací: bez smluv, okno řekne obecnou větu */ smlouvy = null; }
  }
  return NextResponse.json({
    day: den,
    lide: lide.map(l => ({ id: l.id, name: l.name, avatar: l.avatar, role: l.role, jobTitle: l.jobTitle, ...(smlouvy ? { smlouva: smlouvy.get(l.id) ?? null } : {}) })),
    smena: o.smena.filter(id => ids.has(id)),
    uzaverka: o.uzaverka.filter(id => ids.has(id)),
  });
}
