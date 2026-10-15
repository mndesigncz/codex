import { NextResponse } from 'next/server';
import { checkCron } from '@/lib/cronAuth';
import { retenceZapnuta } from '@/lib/retence';
import { spustRetenci } from '@/lib/retenceDb';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Denně: retence osobních údajů (spuštění, balík G; lhůty v lib/retence.ts). Bez RETENCE_ZAPNUTA=1
// jen NÁHLED — spočítá, co by smazal, a zapíše to do retence_behy (správa platformy → Retence).
export async function GET(request: Request) {
  const gate = checkCron(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const s = await spustRetenci({ ostry: retenceZapnuta(), rozpocetMs: 50_000 });
  return NextResponse.json({ ok: true, rezim: s.rezim, hoste: s.hoste, auditLog: s.auditLog, oznameni: s.oznameni, podniky: s.podniky, chyb: s.chyby.length });
}
