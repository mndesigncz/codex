// Tisk jedné fyzické karty (poškozená karta, náhrada za ztracenou): stejný arch jako dávka,
// jen s jednou kartou v levém horním rohu. Zablokovaná karta se netiskne.

import { NextRequest, NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { sql } from '@/lib/client';
import { kartaKTisku } from '@/lib/kartyFyzickeDb';
import { htmlArchuKaret } from '@/lib/kartyFyzickeTisk';
import { qrKarty } from '@/lib/kartyFyzickeQr';
import { pragueToday } from '@/lib/pragueTime';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await pozaduj('zakaznici.sprava_clenu');
  if (jeOdpoved(ctx)) return ctx;
  const id = parseInt((await params).id, 10);
  const kod = Number.isInteger(id) && id > 0 ? await kartaKTisku(ctx.teamId, id) : null;
  if (!kod) return NextResponse.json({ error: 'Kartu nejde vytisknout (neexistuje, je zablokovaná, nebo je to číslo staré karty).' }, { status: 404 });
  const [t] = await sql`SELECT name FROM teams WHERE id = ${ctx.teamId}`;
  const d = pragueToday();
  const html = htmlArchuKaret({
    karty: [{ kod, svg: await qrKarty(kod) }], podnik: String(t?.name ?? ''), titulek: `Karta ${kod}`,
    popis: `karta ${kod} · vytištěno ${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}`,
  });
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
