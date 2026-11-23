// GET /api/ucetni/export?od=RRRR-MM-DD&do=RRRR-MM-DD[&mzdy=1] — ZIP s podklady pro účetní (proud).
//
// Oprávnění finance.exportovat; výplaty a jména lidí jen s finance.mzdy a výslovným `mzdy=1`.
// ZIP se skládá za běhu (fotky po kouscích z úložiště), nikdy celý v paměti — lib/ucetniZip.ts.

import { NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { pozadujTarif } from '@/lib/tarifServer';
import { hit } from '@/lib/rateLimit';
import { overObdobi } from '@/lib/ucetniExport';
import { odpovedSeZipem } from '@/lib/ucetniServer';

export const dynamic = 'force-dynamic';
// Rok fotek z úložiště se stahuje postupně — default 10 s by nestačilo.
export const maxDuration = 300;

export async function GET(req: Request) {
  const c = await pozaduj('finance.exportovat');
  if (jeOdpoved(c)) return c;
  const tarif = await pozadujTarif(c.teamId, 'pro');
  if (tarif) return tarif;
  const q = new URL(req.url).searchParams;
  const o = overObdobi(q.get('od'), q.get('do'));
  if (!o.ok) return NextResponse.json({ error: o.chyba }, { status: 400 });
  // Skládání je drahé (fotky z úložiště): pár desítek stažení za hodinu stačí.
  const brana = await hit(`ucetni-export:${c.meId}`, 30, 60 * 60);
  if (!brana.ok) return NextResponse.json({ error: 'Příliš mnoho stažení. Zkus to za chvíli znovu.' }, { status: 429 });
  const mzdy = q.get('mzdy') === '1' && c.role.opravneni.has('finance.mzdy');
  try {
    const r = await odpovedSeZipem(c.teamId, o.od, o.do, { mzdy, kdo: c.meId, zdroj: 'aplikace' });
    return r ?? NextResponse.json({ error: 'Podnik nenalezen.' }, { status: 404 });
  } catch (e) {
    console.error('ucetni/export', e);
    return NextResponse.json({ error: 'Podklady se nepodařilo připravit. Zkus to znovu.' }, { status: 500 });
  }
}
