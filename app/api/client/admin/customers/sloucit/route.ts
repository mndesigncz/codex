// Sloučení dvou členů, kteří jsou jeden člověk. Hlavní člen zůstane, duplicita do něj přejde.
import { NextRequest, NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { slucClena } from '@/lib/clenoveDb';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.sprava_clenu');
  if (jeOdpoved(ctx)) return ctx;
  const b = await req.json().catch(() => ({}));
  const r = await slucClena(ctx.teamId, Math.round(Number(b.hlavniId)), Math.round(Number(b.duplicitaId)), ctx.meId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, body: r.body, navstev: r.navstev, presunuto: r.presunuto });
}
