// Plastové karty hosta v aplikaci (Moje → Kartička).
//   GET              karty přiřazené přihlášenému hostovi
//   POST { kod }     připojit plastovou kartu opsanou z karty: nová karta se přiřadí,
//                    karta hosta bez aplikace se převezme i s body (lib/kartyFyzickeDb.ts)

import { NextRequest, NextResponse } from 'next/server';
import { customer } from '@/lib/client';
import { hit, clear } from '@/lib/rateLimit';
import { kartyHosta, pripojKartu } from '@/lib/kartyFyzickeDb';

// Co hostovi může přijít z pripojKartu (lib/kartyFyzicke.ts rozhodniPripojeni, lib/kartyFyzickeDb.ts).
// Aplikace hosta je ukazuje přes t(): slovník `api` je překládá a scripts/check-i18n.mjs bere věty
// z `error: '…'` hostovských rout — proto jsou vypsané tady. Test k90-karty-host hlídá, že tu je každá.
const HLASKY_PRIPOJENI = [
  { error: 'Kód karty má osm znaků, třeba ABCD-EFGH.' },
  { error: 'Takovou kartu neznáme. Zkontroluj kód.' },
  { error: 'Karta je zablokovaná.' },
  { error: 'Karta patří jinému účtu. Jestli je tvoje, ukaž ji u kasy.' },
  { error: 'Karta mezitím připadla někomu jinému.' },
  { error: 'Kartu se teď nepodařilo připojit. Zkus to za chvíli.' },
] as const;
const znamaHlaska = (t: string) => HLASKY_PRIPOJENI.some(h => h.error === t);

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET() {
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  return NextResponse.json({ karty: await kartyHosta(me.id) });
}

export async function POST(req: NextRequest) {
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  // Kód je dlouhý a náhodný, ale hádání se i tak brzdí: deset špatných kódů za hodinu.
  const klic = `karta-pripojit:${me.id}`;
  const brana = await hit(klic, 10, 60 * 60);
  if (!brana.ok) return NextResponse.json({ error: 'Moc pokusů. Zkus to znovu za hodinu.' }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  const r = await pripojKartu(me.id, String(b.kod ?? '').slice(0, 40));
  if (!r.ok) return NextResponse.json({ error: znamaHlaska(r.chyba) ? r.chyba : 'Kartu se teď nepodařilo připojit. Zkus to za chvíli.' }, { status: r.status });
  await clear(klic);
  return NextResponse.json({ ok: true, stav: r.stav, message: r.zprava, podnik: r.podnik, karty: await kartyHosta(me.id) });
}
