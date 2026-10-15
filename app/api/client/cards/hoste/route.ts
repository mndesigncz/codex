// Hledání hosta u kasy při přiřazení nové plastové karty: GET ?q= (jméno, telefon, e-mail).
// Členové podniku podle části jména či kontaktu; mimo členy jen přesná shoda e-mailu.
// Kontakt se vrací zakrytý. Oprávnění vernost.karta.

import { NextRequest, NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { dotazHledani } from '@/lib/kartyFyzicke';
import { hledejHosty } from '@/lib/kartyFyzickeDb';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('vernost.karta');
  if (jeOdpoved(ctx)) return ctx;
  const d = dotazHledani(new URL(req.url).searchParams.get('q'));
  if (!d) return NextResponse.json({ hoste: [] });
  return NextResponse.json({ hoste: await hledejHosty(ctx.teamId, d) });
}
