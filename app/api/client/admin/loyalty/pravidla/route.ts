// Rozšířená pravidla bodů a úrovní: koncept, použití konceptu a verze s rozdílem před/po.
// Čtení smí kdokoli s přehledem věrnosti, měnit jen vernost.pravidla.
import { NextRequest, NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { teamIsMax, MAX_ONLY_MSG } from '@/lib/planServer';
import { stavPravidel, ulozKoncept, zahodKoncept, publikujKoncept, verziDoKonceptu } from '@/lib/bodyPravidlaDb';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET() {
  const ctx = await pozaduj('vernost.zobrazit');
  if (jeOdpoved(ctx)) return ctx;
  try {
    return NextResponse.json(await stavPravidel(ctx.teamId));
  } catch (e) {
    console.error('[vernost] pravidla', e);
    return NextResponse.json({ error: 'Pravidla se nepodařilo načíst.' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const ctx = await pozaduj('vernost.pravidla');
  if (jeOdpoved(ctx)) return ctx;
  if (!(await teamIsMax(ctx.teamId))) return NextResponse.json({ error: MAX_ONLY_MSG }, { status: 402 });
  const b = await req.json().catch(() => ({}));
  const akce = String(b?.action ?? '');
  try {
    if (akce === 'save') {
      const r = await ulozKoncept(ctx.teamId, b);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    } else if (akce === 'discard') {
      await zahodKoncept(ctx.teamId);
    } else if (akce === 'publish') {
      // Koncept se dá použít i s úpravou z formuláře: nejdřív se uloží, pak použije.
      if (b?.points_round !== undefined) {
        const s = await ulozKoncept(ctx.teamId, b);
        if (!s.ok) return NextResponse.json({ error: s.error }, { status: 400 });
      }
      const r = await publikujKoncept(ctx.teamId, ctx.meId, String(b?.note ?? '').trim().slice(0, 200) || null);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    } else if (akce === 'restore') {
      const r = await verziDoKonceptu(ctx.teamId, parseInt(String(b?.versionId), 10) || 0);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    } else {
      return NextResponse.json({ error: 'Neznámá akce.' }, { status: 400 });
    }
    return NextResponse.json({ ok: true, ...(await stavPravidel(ctx.teamId)) });
  } catch (e) {
    console.error('[vernost] pravidla uložení', e);
    return NextResponse.json({ error: 'Pravidla se nepodařilo uložit.' }, { status: 500 });
  }
}
