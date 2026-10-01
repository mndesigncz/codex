// Dárkové poukazy: seznam s hledáním a stránkováním, detail s historií, založení (i dávka do 100 kusů),
// zrušení, úprava platnosti a poznámky, vrácení omylem uplatněné částky a export CSV.
// Oprávnění: poukazy.zobrazit (čtení; detail i poukazy.uplatnit), poukazy.spravovat (vytvářet, rušit, upravovat, exportovat kódy).
// Uplatnění částky je zvlášť v ./redeem (poukazy.uplatnit, to má i obsluha).

import { NextRequest, NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { menaPodniku } from '@/lib/menaPodniku';
import { pragueToday } from '@/lib/pragueTime';
import { celaCastka, hodnotyDavky, jeDatum, poukazyCsv, DUVOD_TEXT, MAX_DAVKA } from '@/lib/poukazy';
import { seznamPoukazu, poukazPodleId, historiePoukazu, vytvorPoukazy, zrusPoukaz, upravPoukaz, vratPoukaz } from '@/lib/poukazyDb';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const id = (v: unknown) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 ? n : null; };
const nedostupne = (e: unknown) => { console.error('[poukazy]', e); return NextResponse.json({ error: 'Poukazy se teď nepodařilo načíst. Zkus to za chvíli.' }, { status: 500 }); };

export async function GET(req: NextRequest) {
  // Detail jednoho poukazu smí i obsluha, která poukazy jen uplatňuje (našla ho podle kódu); seznam jen kdo je smí vidět.
  const ctx = await pozaduj(['poukazy.zobrazit', 'poukazy.uplatnit']);
  if (jeOdpoved(ctx)) return ctx;
  const u = req.nextUrl.searchParams;
  const dnes = pragueToday();
  const jeden = id(u.get('id'));
  if (!jeden && !ctx.role.opravneni.has('poukazy.zobrazit')) return NextResponse.json({ error: 'Na tohle nemáš v tomto podniku oprávnění.' }, { status: 403 });
  try {
    if (jeden) {
      const poukaz = await poukazPodleId(ctx.teamId, jeden, dnes);
      if (!poukaz) return NextResponse.json({ error: 'Poukaz nenalezen.' }, { status: 404 });
      return NextResponse.json({ poukaz, historie: await historiePoukazu(ctx.teamId, jeden) });
    }
    if (u.get('export') === 'csv') {
      // Export nese všechny kódy najednou, a kdo kód zná, může s ním platit: jen správce.
      if (!ctx.role.opravneni.has('poukazy.spravovat')) return NextResponse.json({ error: 'Na tohle nemáš v tomto podniku oprávnění.' }, { status: 403 });
      const { poukazy } = await seznamPoukazu(ctx.teamId, { q: u.get('q') ?? '', stav: u.get('stav') ?? '', vse: true }, dnes);
      return new NextResponse(poukazyCsv(poukazy, dnes), {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="poukazy-${dnes}.csv"`, 'Cache-Control': 'private, no-store' },
      });
    }
    const r = await seznamPoukazu(ctx.teamId, { q: u.get('q') ?? '', stav: u.get('stav') ?? '', strana: Number(u.get('strana')) || 1, naStranu: Number(u.get('naStranu')) || 25 }, dnes);
    return NextResponse.json({ ...r, currency: (await menaPodniku(ctx.teamId)).currency, dnes });
  } catch (e) { return nedostupne(e); }
}

export async function POST(req: NextRequest) {
  const ctx = await pozaduj('poukazy.spravovat');
  if (jeOdpoved(ctx)) return ctx;
  const b = await req.json().catch(() => ({}));
  const dnes = pragueToday();
  const pocet = b.count == null ? 1 : Math.round(Number(b.count));
  if (!Number.isInteger(pocet) || pocet < 1 || pocet > MAX_DAVKA) return NextResponse.json({ error: `Počet poukazů je 1 až ${MAX_DAVKA}.` }, { status: 400 });
  const hodnoty = hodnotyDavky(b.values ?? b.value, pocet);
  if (!hodnoty) return NextResponse.json({ error: 'Hodnota poukazu je celé číslo větší než nula (nejvýš 1 000 000).' }, { status: 400 });
  let validUntil: string | null = null;
  if (b.validUntil) {
    if (!jeDatum(b.validUntil)) return NextResponse.json({ error: 'Platnost má být datum.' }, { status: 400 });
    if (b.validUntil < dnes) return NextResponse.json({ error: 'Platnost poukazu nemůže být v minulosti.' }, { status: 400 });
    validUntil = b.validUntil;
  }
  try {
    const mena = (await menaPodniku(ctx.teamId)).currency;
    const poukazy = await vytvorPoukazy(ctx.teamId, ctx.meId, mena, { hodnoty, validUntil, recipient: b.recipient, buyer: b.buyer, note: b.note }, dnes);
    return NextResponse.json({ ok: true, poukazy });
  } catch (e: any) {
    console.error('[poukazy] vytvoření', e);
    return NextResponse.json({ error: 'Poukazy se nepodařilo založit. Zkus to znovu.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const ctx = await pozaduj('poukazy.spravovat');
  if (jeOdpoved(ctx)) return ctx;
  const b = await req.json().catch(() => ({}));
  const dnes = pragueToday();
  const poukazId = id(b.id);
  if (!poukazId) return NextResponse.json({ error: 'Chybí poukaz.' }, { status: 400 });
  try {
    if (b.action === 'void') {
      const p = await zrusPoukaz(ctx.teamId, ctx.meId, poukazId, dnes, b.note);
      if (!p) return NextResponse.json({ error: 'Poukaz nenalezen.' }, { status: 404 });
      return NextResponse.json({ ok: true, poukaz: p });
    }
    if (b.action === 'refund') {
      const castka = celaCastka(b.amount);
      if (castka == null) return NextResponse.json({ error: DUVOD_TEXT.necela }, { status: 400 });
      const r = await vratPoukaz(ctx.teamId, ctx.meId, poukazId, castka, { note: b.note, ref: b.ref, dnes });
      if (!r.ok) return NextResponse.json({ error: r.duvod === 'souboh' ? 'Poukaz se mezitím změnil. Načti ho znovu.' : DUVOD_TEXT[r.duvod] }, { status: r.duvod === 'nenalezen' ? 404 : 409 });
      return NextResponse.json({ ok: true, poukaz: r.poukaz });
    }
    const zmeny: { validUntil?: string | null; note?: string | null; recipient?: string | null; buyer?: string | null } = {};
    if ('validUntil' in b) {
      if (b.validUntil) {
        if (!jeDatum(b.validUntil)) return NextResponse.json({ error: 'Platnost má být datum.' }, { status: 400 });
        if (b.validUntil < dnes) return NextResponse.json({ error: 'Platnost poukazu nemůže být v minulosti.' }, { status: 400 });
        zmeny.validUntil = b.validUntil;
      } else zmeny.validUntil = null;
    }
    if ('note' in b) zmeny.note = b.note;
    if ('recipient' in b) zmeny.recipient = b.recipient;
    if ('buyer' in b) zmeny.buyer = b.buyer;
    if (!Object.keys(zmeny).length) return NextResponse.json({ error: 'Není co měnit.' }, { status: 400 });
    const p = await upravPoukaz(ctx.teamId, ctx.meId, poukazId, zmeny, dnes);
    if (!p) return NextResponse.json({ error: 'Poukaz nenalezen, nebo je zrušený.' }, { status: 404 });
    return NextResponse.json({ ok: true, poukaz: p });
  } catch (e) { return nedostupne(e); }
}
