// Jedna fyzická karta: POST { akce: 'blokovat' } nebo { akce: 'nahradit', kod? }.
// Nahradit = host dostane novou kartu (kód opsaný z krabice, nebo bez kódu nová karta
// k vytištění), stará se zablokuje. Oprávnění zakaznici.sprava_clenu.

import { NextRequest, NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { zablokujKartu, nahradKartu } from '@/lib/kartyFyzickeDb';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await pozaduj('zakaznici.sprava_clenu');
  if (jeOdpoved(ctx)) return ctx;
  const id = parseInt((await params).id, 10);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Karta nenalezena.' }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  if (b.akce === 'blokovat') {
    const r = await zablokujKartu(ctx.teamId, ctx.meId, id);
    if (!r.ok) return NextResponse.json({ error: r.chyba }, { status: r.status });
    return NextResponse.json({ ok: true, message: `Karta ${r.kod} je zablokovaná.` });
  }
  if (b.akce === 'nahradit') {
    const kod = typeof b.kod === 'string' && b.kod.trim() ? b.kod.trim().slice(0, 60) : null;
    const r = await nahradKartu(ctx.teamId, ctx.meId, id, kod);
    if (!r.ok) return NextResponse.json({ error: r.chyba }, { status: r.status });
    return NextResponse.json({ ok: true, nova: r.nova, tisk: r.tisk, message: `Nová karta ${r.nova.kod} patří hostovi, stará je zablokovaná.` });
  }
  return NextResponse.json({ error: 'Neznámá akce.' }, { status: 400 });
}
