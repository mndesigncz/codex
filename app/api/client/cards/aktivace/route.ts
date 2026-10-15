// Nová plastová karta u kasy → přiřadit hostovi.
//   POST { kod, customerId }                         existující host (vyhledaný v /api/client/cards/hoste)
//   POST { kod, novy: { jmeno, telefon?, email? } }  host bez aplikace (účet založí obsluha)
// Oprávnění vernost.karta (obsluha u kasy). Host se stane členem podniku; vrací se, co čtečka
// potřebuje k dalšímu kroku (jméno hosta), a karta se pak čte jako každá jiná.

import { NextRequest, NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { hit } from '@/lib/rateLimit';
import { overNovehoHosta, zobrazitelnyKod } from '@/lib/kartyFyzicke';
import { aktivujKartu, zalozHostaBezAplikace } from '@/lib/kartyFyzickeDb';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(req: NextRequest) {
  const ctx = await pozaduj('vernost.karta');
  if (jeOdpoved(ctx)) return ctx;
  const b = await req.json().catch(() => ({}));
  const kod = String(b.kod ?? '').slice(0, 60);
  let customerId = Math.round(Number(b.customerId));
  if (b.novy) {
    const h = overNovehoHosta(b.novy);
    if (!h.ok) return NextResponse.json({ error: h.chyba }, { status: 400 });
    // Zakládání účtů u kasy: strop proti smyčce, ne proti rušnému večeru.
    const brana = await hit(`karty-host:${ctx.teamId}`, 120, 60 * 60);
    if (!brana.ok) return NextResponse.json({ error: 'Hostů je teď založeno moc najednou. Zkus to za chvíli.' }, { status: 429 });
    const z = await zalozHostaBezAplikace(ctx.teamId, ctx.meId, h.host);
    if (!z.ok) return NextResponse.json({ error: z.chyba }, { status: z.status });
    customerId = z.host.id;
  }
  if (!Number.isInteger(customerId) || customerId <= 0) return NextResponse.json({ error: 'Vyber hosta, nebo založ nového.' }, { status: 400 });
  const r = await aktivujKartu(ctx.teamId, ctx.meId, kod, customerId);
  if (!r.ok) return NextResponse.json({ error: r.chyba }, { status: r.status });
  return NextResponse.json({ ok: true, customer: r.host, kod: zobrazitelnyKod(r.kod), message: `Karta ${zobrazitelnyKod(r.kod)} patří hostovi ${r.host.name}.` });
}
