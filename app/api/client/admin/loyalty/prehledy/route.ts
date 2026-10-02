// Přehledy věrnosti: top hosté, zdroje bodů, výnosnost a závazek v měně.
import { NextRequest, NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { prehledVernosti, type RazeniTop } from '@/lib/bodyPravidlaDb';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('vernost.zobrazit');
  if (jeOdpoved(ctx)) return ctx;
  const q = new URL(req.url).searchParams;
  const dny = [7, 30, 90, 365].includes(parseInt(String(q.get('dny')), 10)) ? parseInt(String(q.get('dny')), 10) : 30;
  const razeni: RazeniTop = q.get('razeni') === 'body' ? 'body' : q.get('razeni') === 'navstevy' ? 'navstevy' : 'utrata';
  try {
    return NextResponse.json(await prehledVernosti(ctx.teamId, dny, razeni));
  } catch (e) {
    console.error('[vernost] přehledy', e);
    return NextResponse.json({ error: 'Přehledy se nepodařilo načíst.' }, { status: 500 });
  }
}
