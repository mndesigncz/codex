// Uplatnění dárkového poukazu u kasy. GET ?code= ukáže zůstatek a platnost (nic nemění),
// POST { code, amount, ref?, note? } odečte část nebo celý zůstatek atomicky (lib/poukazyDb.ts uplatniPoukaz:
// `UPDATE ... WHERE balance >= amount RETURNING`), takže dvě zařízení najednou neutratí víc, než poukaz má.
// `ref` dělá volání idempotentní (dvojklik, opakování po výpadku sítě). Oprávnění poukazy.uplatnit (i obsluha).

import { NextRequest, NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { menaPodniku } from '@/lib/menaPodniku';
import { pragueToday } from '@/lib/pragueTime';
import { hit } from '@/lib/rateLimit';
import { overKod, celaCastka, DUVOD_TEXT } from '@/lib/poukazy';
import { poukazPodleKodu, historiePoukazu, uplatniPoukaz } from '@/lib/poukazyDb';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const CHYBA_KODU = 'Takový kód poukazu není. Zkontroluj opsané znaky (DP-XXXX-XXXX).';

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('poukazy.uplatnit');
  if (jeOdpoved(ctx)) return ctx;
  const kod = overKod(req.nextUrl.searchParams.get('code'));
  if (!kod) return NextResponse.json({ error: CHYBA_KODU }, { status: 400 });
  try {
    const p = await poukazPodleKodu(ctx.teamId, kod, pragueToday());
    if (!p) return NextResponse.json({ error: 'Poukaz nenalezen.' }, { status: 404 });
    // Obsluha vidí i zrušený a vyčerpaný poukaz se stavem, ať ví, proč nejde uplatnit.
    return NextResponse.json({ poukaz: p, historie: (await historiePoukazu(ctx.teamId, p.id)).slice(0, 5) });
  } catch (e) {
    console.error('[poukazy] náhled', e);
    return NextResponse.json({ error: 'Poukaz se teď nepodařilo načíst. Zkus to za chvíli.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const ctx = await pozaduj('poukazy.uplatnit');
  if (jeOdpoved(ctx)) return ctx;
  const b = await req.json().catch(() => ({}));
  const kod = overKod(b.code);
  if (!kod) return NextResponse.json({ error: CHYBA_KODU }, { status: 400 });
  const castka = celaCastka(b.amount);
  if (castka == null) return NextResponse.json({ error: Number(b.amount) < 0 ? DUVOD_TEXT.zaporna : DUVOD_TEXT.necela }, { status: 400 });
  // Kdyby se přihlášený účet obsluhy zneužil k hádání kódů, zastaví se to; běžná obsluha se k limitu nepřiblíží.
  const brana = await hit(`poukaz-uplatneni:${ctx.teamId}:${ctx.meId}`, 120, 60 * 60);
  if (!brana.ok) return NextResponse.json({ error: 'Moc pokusů za hodinu. Zkus to za chvíli.' }, { status: 429 });
  try {
    const mena = (await menaPodniku(ctx.teamId)).currency;
    const r = await uplatniPoukaz(ctx.teamId, ctx.meId, kod, castka, { ref: b.ref, note: b.note, mena, dnes: pragueToday() });
    if (!r.ok) {
      const text = r.duvod === 'souboh' ? 'Poukaz se právě změnil. Načti ho znovu.' : DUVOD_TEXT[r.duvod];
      return NextResponse.json({ error: text, poukaz: r.poukaz }, { status: r.duvod === 'nenalezen' ? 404 : 409 });
    }
    return NextResponse.json({ ok: true, poukaz: r.poukaz, castka: r.castka, opakovani: r.opakovani });
  } catch (e) {
    console.error('[poukazy] uplatnění', e);
    return NextResponse.json({ error: 'Poukaz se nepodařilo uplatnit. Zkontroluj zůstatek a zkus to znovu: opakování téhož uplatnění se neodečte dvakrát.' }, { status: 500 });
  }
}
