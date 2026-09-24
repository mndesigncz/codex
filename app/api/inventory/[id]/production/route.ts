import { NextResponse } from 'next/server';
import { recipeOf, saveRecipe } from '@/lib/production';
import { teamIsMax, MAX_ONLY_MSG } from '@/lib/planServer';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';

// GET: výrobní receptura položky včetně toho, co je ve skladu. Kolo 67:
// `vyroba.vyrabet` — mají ho všechny tři dnešní role, protože podle receptury
// se vyrábí i na tabletu. Odpověď nenese žádné ceny, takže `sklad.ceny`
// tu není co filtrovat.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const c = await pozaduj('vyroba.vyrabet');
  if (jeOdpoved(c)) return c;
  const id = parseInt(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });
  const r = await recipeOf(c.teamId, id);
  if (!r) return NextResponse.json({ error: 'Položka nenalezena' }, { status: 404 });
  return NextResponse.json(r);
}

// PUT: uložit recepturu — `vyroba.receptura` (dřív jen vedení). Tarif Max
// se hlídá až po oprávnění a na roli nezávisí.
export async function PUT(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const c = await pozaduj('vyroba.receptura');
  if (jeOdpoved(c)) return c;
  if (!(await teamIsMax(c.teamId))) return NextResponse.json({ error: MAX_ONLY_MSG }, { status: 402 });
  const id = parseInt(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  try {
    const r = await saveRecipe(c.teamId, id, b, c.meId);
    return NextResponse.json(r);
  } catch (e: any) {
    const msg = String(e?.message ?? '');
    if (msg.includes('nenalezena')) return NextResponse.json({ error: msg }, { status: 404 });
    return NextResponse.json({ error: 'Uložení se nepodařilo — databáze možná ještě nemá tabulku receptur (spusť /api/init).' }, { status: 500 });
  }
}
