// Koncept a verze pravidel věrnosti. GET vrací platná pravidla, koncept (je-li) s rozdílem před → po
// a seznam verzí; PUT { action: 'save' | 'publish' | 'discard' }: uloží koncept (hosté o něm nevědí),
// použije ho (stejnou cestou jako přímé uložení v /api/client/admin/profile), nebo ho zahodí.
import { NextRequest, NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { stavPravidel, ulozKoncept, zahodKoncept } from '@/lib/pravidlaVerze';
import { KLICE_KONCEPTU } from '@/lib/bodyPravidla';
import { teamIsMax, MAX_ONLY_MSG } from '@/lib/planServer';
import { PUT as ulozPravidlaProfilu } from '../../profile/route';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET() {
  const ctx = await pozaduj('vernost.zobrazit');
  if (jeOdpoved(ctx)) return ctx;
  return NextResponse.json(await stavPravidel(ctx.teamId));
}

export async function PUT(req: NextRequest) {
  const ctx = await pozaduj('vernost.pravidla');
  if (jeOdpoved(ctx)) return ctx;
  if (!(await teamIsMax(ctx.teamId))) return NextResponse.json({ error: MAX_ONLY_MSG }, { status: 402 });
  const b = await req.json().catch(() => ({}));
  const action = String(b.action ?? '');

  if (action === 'save') {
    const r = await ulozKoncept(ctx.teamId, b);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    await audit(ctx.teamId, ctx.meId, 'client.pravidla.koncept', 'client', null, 'koncept pravidel uložen');
    return NextResponse.json({ ok: true, ...(await stavPravidel(ctx.teamId)) });
  }

  if (action === 'discard') {
    await zahodKoncept(ctx.teamId);
    await audit(ctx.teamId, ctx.meId, 'client.pravidla.koncept', 'client', null, 'koncept pravidel zahozen');
    return NextResponse.json({ ok: true, ...(await stavPravidel(ctx.teamId)) });
  }

  if (action === 'publish') {
    const stav = await stavPravidel(ctx.teamId);
    if (!stav.koncept || stav.konceptZmeny.length === 0) {
      return NextResponse.json({ error: 'Není co použít. Nejdřív ulož koncept se změnou.' }, { status: 400 });
    }
    // Použití konceptu = přímé uložení pravidel (jedna kontrola, jeden zápis, historie změn); verze nese poznámku.
    const telo: Record<string, unknown> = { _verze: { zdroj: 'koncept', poznamka: String(b.note ?? '').slice(0, 200) } };
    for (const k of KLICE_KONCEPTU) if (stav.koncept[k] !== undefined) telo[k] = stav.koncept[k];
    const odpoved = await ulozPravidlaProfilu(new NextRequest(new URL('/api/client/admin/profile', req.url), { method: 'PUT', body: JSON.stringify(telo), headers: { 'Content-Type': 'application/json' } }));
    if (!odpoved.ok) return odpoved;
    await zahodKoncept(ctx.teamId);
    return NextResponse.json({ ok: true, ...(await stavPravidel(ctx.teamId)) });
  }

  return NextResponse.json({ error: 'Neznámá akce.' }, { status: 400 });
}
