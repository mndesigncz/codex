// Host: „Pošli mi kód“ — POST { email } → vždy { ok: true } (i pro neznámý e-mail), 429 při limitu.
// Ověření kódu dělá NextAuth (provider `host-kod`, lib/auth.ts).
import { NextRequest, NextResponse } from 'next/server';
import { posliKod } from '@/lib/klient/prihlaseniKodem';
import { klientIp } from '@/lib/klientIp';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  try {
    const r = await posliKod(b.email, klientIp(req.headers));
    if (!r.ok) return NextResponse.json({ error: 'Moc pokusů. Zkus to za hodinu.' }, { status: 429 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[kód hosta]', e);
    return NextResponse.json({ error: 'Kód se teď nepodařilo poslat. Zkus to za chvíli, nebo se přihlas heslem.' }, { status: 503 });
  }
}
