// Fyzické kartičky ve správě podniku (Client → Kartičky).
//   GET  ?davka=&stav=&q=&offset=  dávky, počty podle stavu a seznam karet (vernost.zobrazit)
//   POST { pocet, nazev }           nová tisková dávka 10–500 karet (zakaznici.sprava_clenu)
// Tisk dávky: GET /api/client/cards/davky/<id>/tisk. Blokace a náhrada: POST /api/client/cards/<id>.

import { NextRequest, NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { hit } from '@/lib/rateLimit';
import { overPocet, nazevDavky, STAVY_KARTY, type StavKarty } from '@/lib/kartyFyzicke';
import { seznamDavek, seznamKaret, vytvorDavku } from '@/lib/kartyFyzickeDb';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('vernost.zobrazit');
  if (jeOdpoved(ctx)) return ctx;
  const q = new URL(req.url).searchParams;
  const davka = parseInt(String(q.get('davka') ?? ''), 10);
  const stav = String(q.get('stav') ?? '');
  const offset = parseInt(String(q.get('offset') ?? '0'), 10);
  const [d, k] = await Promise.all([
    seznamDavek(ctx.teamId),
    seznamKaret(ctx.teamId, {
      davkaId: Number.isFinite(davka) && davka > 0 ? davka : null,
      stav: (STAVY_KARTY as string[]).includes(stav) ? (stav as StavKarty) : null,
      q: q.get('q'), offset: Number.isFinite(offset) ? offset : 0,
    }),
  ]);
  return NextResponse.json({ ...d, ...k, smiSpravovat: ctx.role.opravneni.has('zakaznici.sprava_clenu') });
}

export async function POST(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.sprava_clenu');
  if (jeOdpoved(ctx)) return ctx;
  const b = await req.json().catch(() => ({}));
  const p = overPocet(b.pocet);
  if (!p.ok) return NextResponse.json({ error: p.chyba }, { status: 400 });
  // Pojistka proti smyčce: deset dávek za hodinu je i na velký podnik víc než dost.
  const brana = await hit(`karty-davka:${ctx.teamId}`, 10, 60 * 60);
  if (!brana.ok) return NextResponse.json({ error: 'Dávek je teď moc najednou. Zkus to za chvíli.' }, { status: 429 });
  const d = await vytvorDavku(ctx.teamId, ctx.meId, p.pocet, nazevDavky(b.nazev));
  return NextResponse.json({ ok: true, davka: d });
}
