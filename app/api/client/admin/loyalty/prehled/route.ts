// Přehledy věrnosti: závazek (body a kredit), rozpad zdrojů bodů za období a top hosté.
// Čte jen to, co věrnost už eviduje (deník, členství, kupony); nic nepřepisuje.
import { NextRequest, NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { obdobiZDotazu, prehledBodu, jeRazeni } from '@/lib/bodyPrehledy';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('vernost.zobrazit');
  if (jeOdpoved(ctx)) return ctx;
  const q = new URL(req.url).searchParams;
  const obdobi = obdobiZDotazu(q.get('od'), q.get('do'));
  if ('chyba' in obdobi) return NextResponse.json({ error: obdobi.chyba }, { status: 400 });
  const razeniRaw = q.get('razeni');
  if (razeniRaw && !jeRazeni(razeniRaw)) return NextResponse.json({ error: 'Řadit jde podle útraty, bodů nebo návštěv.' }, { status: 400 });
  try {
    return NextResponse.json(await prehledBodu(ctx.teamId, obdobi, jeRazeni(razeniRaw) ? razeniRaw : 'utrata', 10));
  } catch (e) {
    console.error('[vernost] přehled se nenačetl', e);
    return NextResponse.json({ error: 'Přehled se teď nepodařilo načíst. Zkus to za chvíli.' }, { status: 500 });
  }
}
