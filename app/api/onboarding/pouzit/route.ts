import { NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { hit } from '@/lib/rateLimit';
import { verejnaHlaska } from '@/lib/verejnaChyba';
import { nactiStav } from '@/lib/pruvodce/stav';
import { pouzijPruvodce } from '@/lib/pruvodce/pouzij';
import { POLOZKY_ID } from '@/lib/pruvodce/typy';

export const dynamic = 'force-dynamic';

// Sestavení podniku: provede to, co člověk potvrdil na Shrnutí. Idempotentní
// (ledger `pouzito` + dedupe podle názvu), jen přidává a každá operace běží
// ve vlastním try — odpověď říká pravdu o tom, co se povedlo, co se přeskočilo
// a co ne; finále průvodce přehrává přesně tohle.

export async function POST(request: Request) {
  const c = await pozaduj('podnik.nastaveni');
  if (jeOdpoved(c)) return c;
  const g = await hit(`onboarding-pouzit:${c.meId}`, 6, 10 * 60);
  if (!g.ok) {
    return NextResponse.json({ error: `Průvodce už běžel několikrát za sebou. Zkus to znovu za ${Math.ceil(g.retryAfter / 60)} min.` }, { status: 429, headers: { 'Retry-After': String(g.retryAfter) } });
  }
  const telo = await request.json().catch(() => ({})) as { vypnout?: unknown };
  const vypnout = Array.isArray(telo?.vypnout) ? telo.vypnout.filter((k): k is string => typeof k === 'string' && (POLOZKY_ID as readonly string[]).includes(k)) : [];
  try {
    const s = await nactiStav(c.teamId);
    if (!s.dostupne || !s.onboarding) return NextResponse.json({ error: 'Průvodce pro tenhle podnik není k dispozici.' }, { status: 404 });
    if (s.vlastnikId !== c.meId) return NextResponse.json({ error: 'Průvodce nastavením smí vést jen vlastník podniku.' }, { status: 403 });
    const v = await pouzijPruvodce({ teamId: c.teamId, meId: c.meId, onboarding: s.onboarding, vypnout });
    return NextResponse.json({ polozky: v.polozky, prehled: v.prehled });
  } catch (e) {
    return NextResponse.json({ error: verejnaHlaska(e, 'Podnik se nepodařilo sestavit. Zkus to znovu.', 'onboarding pouzit') }, { status: 500 });
  }
}
