// Tiskový arch dávky fyzických karet (A4, 85 × 55 mm, ořezové značky): HTML k tisku nebo
// „Uložit jako PDF“. Tisknou se jen nepřiřazené karty — přiřazená karta by vytištěná znovu
// měla dvojníka u jiného hosta. Jednu kartu (poškozenou, náhradu) tiskne /api/client/cards/<id>/tisk.

import { NextRequest, NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { sql } from '@/lib/client';
import { kartyKTisku } from '@/lib/kartyFyzickeDb';
import { htmlArchuKaret, pocetKaret } from '@/lib/kartyFyzickeTisk';
import { qrKarty, denCesky } from '@/lib/kartyFyzickeQr';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const maxDuration = 60;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await pozaduj('zakaznici.sprava_clenu');
  if (jeOdpoved(ctx)) return ctx;
  const id = parseInt((await params).id, 10);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Dávka nenalezena.' }, { status: 404 });
  const { davka, kody, vynechano } = await kartyKTisku(ctx.teamId, id);
  if (!davka) return NextResponse.json({ error: 'Dávka nenalezena.' }, { status: 404 });
  if (!kody.length) return NextResponse.json({ error: 'V dávce už není žádná nepřiřazená karta k tisku.' }, { status: 409 });
  const [t] = await sql`SELECT name FROM teams WHERE id = ${ctx.teamId}`;
  const karty = await Promise.all(kody.map(async kod => ({ kod, svg: await qrKarty(kod) })));
  const html = htmlArchuKaret({
    karty, podnik: String(t?.name ?? ''), titulek: `Karty · ${davka.nazev}`,
    popis: `${davka.nazev} · ${pocetKaret(kody.length)}${vynechano ? ` (${vynechano} přiřazených vynecháno)` : ''} · založeno ${denCesky(davka.created_at)}`,
  });
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
