// Export deníku věrnosti za období do CSV (body, kredit, zdroj, poznámka).
// Je to hromadný výpis jmen hostů a jejich pohybů, proto ho smí jen ten, kdo spravuje pravidla věrnosti.
import { NextRequest, NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { obdobiZDotazu, denikProExport, MAX_RADKU_EXPORTU } from '@/lib/bodyPrehledy';
import { denikCsv, cisloCs } from '@/lib/bodyPravidla';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('vernost.pravidla');
  if (jeOdpoved(ctx)) return ctx;
  const q = new URL(req.url).searchParams;
  const obdobi = obdobiZDotazu(q.get('od'), q.get('do'));
  if ('chyba' in obdobi) return NextResponse.json({ error: obdobi.chyba }, { status: 400 });
  try {
    const { radky, prebyva } = await denikProExport(ctx.teamId, obdobi);
    // Raději srozumitelná odmítnutí než tiše uříznutý soubor, ze kterého by součty nesedly.
    if (prebyva) return NextResponse.json({ error: `Za tohle období je v deníku víc než ${cisloCs(MAX_RADKU_EXPORTU)} řádků. Zkrať ho.` }, { status: 413 });
    audit(ctx.teamId, ctx.meId, 'client.export', 'client', null, `deník věrnosti ${obdobi.od} až ${obdobi.do}: ${radky.length} řádků`);
    return new NextResponse(denikCsv(radky), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="denik-vernosti-${obdobi.od}-${obdobi.do}.csv"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    console.error('[vernost] export deníku selhal', e);
    return NextResponse.json({ error: 'Export se teď nepodařilo vytvořit. Zkus to za chvíli.' }, { status: 500 });
  }
}
