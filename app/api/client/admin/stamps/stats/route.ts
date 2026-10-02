// Statistika jedné razítkové kampaně: kolik odměn se uplatnilo, jak dlouho trvá
// dokončení karty, nejvěrnější hosté a rozpad po dnech.
import { NextRequest, NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { kampanTymu, statistikaKampane } from '@/lib/stampsAdmin';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('vernost.zobrazit');
  if (jeOdpoved(ctx)) return ctx;
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatná kampaň' }, { status: 400 });
  const c = await kampanTymu(ctx.teamId, id);
  if (!c) return NextResponse.json({ error: 'Kampaň nenalezena' }, { status: 404 });
  return NextResponse.json({ nazev: c.name, potrebnych: c.required_stamps, ...(await statistikaKampane(ctx.teamId, id)) });
}
