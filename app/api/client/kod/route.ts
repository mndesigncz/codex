// Jedno pole „Mám kód“: POST { kod } → { typ: 'promo' | 'poukaz' | 'karta' | 'podnik', … } (lib/klient/kod.ts).
// Hádání kódů brzdí limit pokusů na hosta (stejný strop jako promo kódy).
import { NextRequest, NextResponse } from 'next/server';
import { customer } from '@/lib/client';
import { hit } from '@/lib/rateLimit';
import { rozpoznejKod } from '@/lib/klient/kod';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(req: NextRequest) {
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Přihlas se jako host.' }, { status: 401 });
  const brana = await hit(`client-kod:${me.id}`, 15, 3600, { failClosed: true });
  if (!brana.ok) return NextResponse.json({ error: 'Moc pokusů. Zkus to za hodinu.' }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  try {
    const r = await rozpoznejKod(me, b.kod);
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    console.error('[mám kód]', e);
    return NextResponse.json({ error: 'Kód se teď nepodařilo ověřit. Zkus to za chvíli.' }, { status: 503 });
  }
}
