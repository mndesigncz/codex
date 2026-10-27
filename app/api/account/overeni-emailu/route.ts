// Ověření e-mailu vedení (spuštění, balík S): stav pro banner a „Poslat znovu".
// Nic neblokuje — neověřený e-mail je jen banner (lib/overeniEmailu.ts).

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { hit } from '@/lib/rateLimit';
import { OVERENI_ZNOVU_ZA_HODINU } from '@/lib/overeniEmailu';
import { posliOvereni, stavOvereniUctu } from '@/lib/overeniEmailuDb';

export const dynamic = 'force-dynamic';

async function ja(): Promise<{ id: number; role: string } | null> {
  const session = await getServerSession(authOptions);
  const id = Number((session?.user as { id?: unknown } | undefined)?.id);
  return session?.user && Number.isFinite(id) ? { id, role: String((session.user as { role?: unknown }).role ?? '') } : null;
}

// GET → { stav: 'overeno' | 'ceka' | 'nenabizi' | 'nezahajeno', email }
export async function GET() {
  const me = await ja();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  // Ověřuje se jen vedení (registrace podniku); ostatním se nic nenabízí.
  if (me.role !== 'employer') return NextResponse.json({ stav: 'nenabizi', email: null });
  return NextResponse.json(await stavOvereniUctu(me.id));
}

// POST → pošle nový odkaz (3× za hodinu).
export async function POST() {
  const me = await ja();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (me.role !== 'employer') return NextResponse.json({ error: 'Ověření e-mailu je jen pro vedení podniku.' }, { status: 403 });
  const brana = await hit(`overeni-email:${me.id}`, OVERENI_ZNOVU_ZA_HODINU, 60 * 60);
  if (!brana.ok) return NextResponse.json({ error: 'Odkaz jsme poslali už několikrát. Zkus to za hodinu.' }, { status: 429 });
  const r = await posliOvereni(me.id);
  if (r.odeslano) return NextResponse.json({ ok: true });
  if (r.duvod === 'overeno') return NextResponse.json({ ok: true, overeno: true });
  if (r.duvod === 'nenabizi') return NextResponse.json({ error: 'Odesílání e-mailů není nastavené.' }, { status: 503 });
  return NextResponse.json({ error: 'E-mail se nepodařilo odeslat. Zkus to později.' }, { status: 502 });
}
