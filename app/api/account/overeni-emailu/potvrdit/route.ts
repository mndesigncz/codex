// Ověření e-mailu, krok 2: odkaz z e-mailu (token). Bez přihlášení — odkaz se
// často otevře na jiném zařízení než aplikace. Token je jednorázový, 48 h.

import { NextResponse } from 'next/server';
import { hit } from '@/lib/rateLimit';
import { klientIp } from '@/lib/klientIp';
import { vypadaJakoToken } from '@/lib/jednorazovyToken';
import { potvrdOvereni } from '@/lib/overeniEmailuDb';

export const dynamic = 'force-dynamic';

const NEPLATNY = 'Odkaz už neplatí. V aplikaci si pošlete nový.';

export async function POST(request: Request) {
  const ip = await hit(`overeni-email-ip:${klientIp(request.headers)}`, 20, 15 * 60, { failClosed: true });
  if (!ip.ok) return NextResponse.json({ error: 'Příliš mnoho pokusů. Zkuste to později.' }, { status: 429 });
  const b = await request.json().catch(() => ({}));
  if (!vypadaJakoToken(b?.token)) return NextResponse.json({ error: NEPLATNY }, { status: 400 });
  try {
    if (await potvrdOvereni(b.token)) return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('ověření e-mailu: potvrzení selhalo', e);
  }
  return NextResponse.json({ error: NEPLATNY }, { status: 400 });
}
