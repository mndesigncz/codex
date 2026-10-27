// Aktivita hosta (schránka): GET → { polozky, neprecteno, videno }; ?pocet=1 → jen { neprecteno } (odznak v doku).
// POST → host schránku otevřel (odznak zmizí). Skládá lib/klient/aktivita.ts.
import { NextRequest, NextResponse } from 'next/server';
import { customer } from '@/lib/client';
import { aktivitaHosta, oznacVideno, pocetNovych } from '@/lib/klient/aktivita';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest) {
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const { polozky, videno } = await aktivitaHosta(me.id);
  const neprecteno = pocetNovych(polozky, videno);
  if (req.nextUrl.searchParams.get('pocet')) return NextResponse.json({ neprecteno });
  return NextResponse.json({ polozky, neprecteno, videno });
}

export async function POST() {
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  try { await oznacVideno(me.id); } catch { /* odznak zůstane, nic se nerozbije */ }
  return NextResponse.json({ ok: true });
}
