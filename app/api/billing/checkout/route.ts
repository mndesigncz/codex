import { NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { jazykPozadavku } from '@/lib/i18n/jazykPozadavku';
import { createCheckout, pripravPokladnu, souhlasVPokladne, NOT_CONFIGURED, stripe } from '@/lib/billing';
import { overPripravu, rezimZTela } from '@/lib/pokladnaRezim';
import { verejnaHlaska } from '@/lib/verejnaChyba';

export const dynamic = 'force-dynamic';

const HLASKA_ICO = 'IČO nesedí: má 8 číslic a platný kontrolní součet.';
const HLASKA_SOUHLAS = 'Bez souhlasu s obchodními podmínkami předplatné objednat nejde.';
const HLASKA_RELACE = 'Pokladna vypršela. Zavřete ji a otevřete znovu.';

// POST { plan: 'pro'|'max', interval: 'month'|'year', ui?: 'elements', embedded?: true }
// → { url } pro přesměrování na Stripe, { clientSecret, ui: 'elements', ico, firma,
// souhlas, trial } pro vlastní pokladnu v našem okně, nebo { clientSecret } pro starší
// vloženou stránku Stripe (embedded: true).
export async function POST(req: Request) {
  // Placení a změna tarifu hýbou penězi podniku — jen s oprávněním, ne podle typu účtu.
  const c = await pozaduj('predplatne.spravovat');
  if (jeOdpoved(c)) return c;
  if (!stripe()) return NextResponse.json({ error: NOT_CONFIGURED }, { status: 503 });
  const b = await req.json().catch(() => ({}));
  const plan = b.plan === 'max' ? 'max' : 'pro';
  const interval = b.interval === 'year' ? 'year' : 'month';
  try {
    const out = await createCheckout(c.teamId, plan, interval, rezimZTela(b), await jazykPozadavku());
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: verejnaHlaska(e, 'Pokladnu se nepodařilo otevřít.', '[billing] checkout') }, { status: 400 });
  }
}

// PATCH { sessionId, ico, souhlas } — vlastní pokladna těsně před potvrzením platby:
// ověří IČO (kontrolní součet) a souhlas s podmínkami a zapíše je do relace Stripe
// a na faktury zákazníka (lib/billing.ts → pripravPokladnu). Karta sem nikdy nejde.
export async function PATCH(req: Request) {
  const c = await pozaduj('predplatne.spravovat');
  if (jeOdpoved(c)) return c;
  if (!stripe()) return NextResponse.json({ error: NOT_CONFIGURED }, { status: 503 });
  const r = overPripravu(await req.json().catch(() => ({})), { souhlasPovinny: souhlasVPokladne() });
  if (!r.ok) {
    const error = r.chyba === 'ico' ? HLASKA_ICO : r.chyba === 'souhlas' ? HLASKA_SOUHLAS : HLASKA_RELACE;
    return NextResponse.json({ error }, { status: 400 });
  }
  try {
    const v = await pripravPokladnu(c.teamId, { sessionId: r.sessionId, ico: r.ico, souhlas: r.souhlas });
    if (v === 'cizi') return NextResponse.json({ error: HLASKA_RELACE }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: verejnaHlaska(e, 'Platbu se nepodařilo připravit. Zkuste to znovu.', '[billing] priprava') }, { status: 400 });
  }
}
