// POST /api/ucetni/poslat { od, do, mzdy? } — pošle účetní (e-mail z nastavení) odkaz na podklady.
// finance.exportovat; výplaty jen s finance.mzdy. E-mail nese podepsaný odkaz (14 dní) a součty.

import { NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { pozadujTarif } from '@/lib/tarifServer';
import { hit } from '@/lib/rateLimit';
import { overObdobi } from '@/lib/ucetniExport';
import { posliUcetni } from '@/lib/ucetniServer';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const c = await pozaduj('finance.exportovat');
  if (jeOdpoved(c)) return c;
  const tarif = await pozadujTarif(c.teamId, 'pro');
  if (tarif) return tarif;
  const b = await req.json().catch(() => ({}));
  const o = overObdobi(b?.od, b?.do);
  if (!o.ok) return NextResponse.json({ error: o.chyba }, { status: 400 });
  // Proti nechtěné záplavě schránky účetní: deset e-mailů za hodinu na podnik.
  const brana = await hit(`ucetni-poslat:${c.teamId}`, 10, 60 * 60);
  if (!brana.ok) return NextResponse.json({ error: 'Účetní už dostala dost e-mailů. Zkus to za chvíli znovu.' }, { status: 429 });
  const mzdy = b?.mzdy === true && c.role.opravneni.has('finance.mzdy');
  try {
    const r = await posliUcetni(c.teamId, o.od, o.do, mzdy, c.meId);
    if (!r.ok) return NextResponse.json({ error: r.chyba }, { status: r.status });
    return NextResponse.json({ ok: true, komu: r.komu, sMzdami: mzdy });
  } catch (e) {
    console.error('ucetni/poslat', e);
    return NextResponse.json({ error: 'E-mail účetní se nepodařilo odeslat. Zkus to znovu.' }, { status: 500 });
  }
}
