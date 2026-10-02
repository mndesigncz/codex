// Za co host dostává body mimo kasu: objednávky od stolu (zapnout/vypnout) a rezervace (pevný počet bodů za rezervaci,
// která proběhla). Čtení vidí kdo smí do věrnosti (vernost.zobrazit), měnit smí kdo spravuje pravidla (vernost.pravidla),
// a jen v plánu Max jako ostatní pravidla věrnosti.
import { NextRequest, NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { teamIsMax, MAX_ONLY_MSG } from '@/lib/planServer';
import { normalizujZdroje } from '@/lib/bodyZdroje';
import { nactiZdroje, ulozZdroje } from '@/lib/bodyZdrojeDb';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET() {
  const ctx = await pozaduj(['vernost.zobrazit', 'vernost.pravidla']);
  if (jeOdpoved(ctx)) return ctx;
  return NextResponse.json({ zdroje: await nactiZdroje(ctx.teamId) });
}

export async function PUT(req: NextRequest) {
  const ctx = await pozaduj('vernost.pravidla');
  if (jeOdpoved(ctx)) return ctx;
  if (!(await teamIsMax(ctx.teamId))) return NextResponse.json({ error: MAX_ONLY_MSG }, { status: 402 });
  const b = await req.json().catch(() => ({}));
  const v = normalizujZdroje(b);
  if (!v.ok) return NextResponse.json({ error: v.chyba }, { status: 400 });
  try {
    if (!(await ulozZdroje(ctx.teamId, ctx.meId, v.zdroje))) return NextResponse.json({ error: 'Podnik nemá zapnutého klienta.' }, { status: 404 });
    return NextResponse.json({ ok: true, zdroje: v.zdroje });
  } catch (e) {
    console.error('[body-zdroje]', e);
    return NextResponse.json({ error: 'Nastavení se nepodařilo uložit. Zkus to za chvíli.' }, { status: 500 });
  }
}
