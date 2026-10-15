// Přepočítat zpětně body (kolo 91, balík body-R).
//
// GET                    → historie přepočtů podniku (posledních 10), vrátit jde poslední
// POST { rozsah, pravidla, nahled: true }  → náhled dopadu („Změní se 23 záznamů u 6 lidí,
//                          celkem −84 b“ + lidé, kterým by zůstatek klesl pod nulu); nic nezapíše
// POST { rozsah, pravidla, nahled: false } → uloží pravidlo, přepočítá řádky, zapíše body_prepocty + audit
// POST { vratit: id }    → vrátí poslední přepočet (staré hodnoty řádků i pravidla) + audit
//
// rozsah: { typ: 'podnik', druhy: ['postupy'|'ukoly'|'uzaverky'], zpetneStrop } | { typ: 'postup'|'ukol', id }
// Oprávnění: odmeny.nastaveni (kdo smí měnit nastavení bodů) — i u přepočtu jedné položky.

import { NextRequest, NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { clenovePodniku } from '@/lib/tenant';
import { historiePrepoctu, provedPrepocet, rozsahZTela, spocitejPrepocet, vratPrepocet } from '@/lib/bodyPrepocetDb';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  const c = await pozaduj('odmeny.nastaveni');
  if (jeOdpoved(c)) return c;
  return NextResponse.json({ historie: await historiePrepoctu(c.teamId) });
}

export async function POST(req: NextRequest) {
  const c = await pozaduj('odmeny.nastaveni');
  if (jeOdpoved(c)) return c;
  const b = await req.json().catch(() => ({}));

  if (b.vratit != null) {
    const id = parseInt(String(b.vratit));
    if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID přepočtu' }, { status: 400 });
    try {
      const r = await vratPrepocet(c.teamId, c.meId, id);
      if (!r.ok) return NextResponse.json({ error: r.chyba }, { status: 409 });
      await audit(c.teamId, c.meId, 'points.prepocet_vracen', 'body_prepocty', id, `${r.radku} záznamů`);
      return NextResponse.json({ ok: true, historie: await historiePrepoctu(c.teamId) });
    } catch {
      return NextResponse.json({ error: 'Přepočet se nepodařilo vrátit. Spusť /api/init.' }, { status: 500 });
    }
  }

  const rozsah = rozsahZTela(b.rozsah);
  if (!rozsah) return NextResponse.json({ error: 'Chybí, co přepočítat.' }, { status: 400 });
  const pravidla = b.pravidla && typeof b.pravidla === 'object' ? b.pravidla : {};

  let v;
  try {
    v = await spocitejPrepocet(c.teamId, rozsah, pravidla);
  } catch (e) {
    const zprava = e instanceof Error && /nenalezen/.test(e.message) ? e.message : 'Přepočet se nepodařilo spočítat. Spusť /api/init.';
    return NextResponse.json({ error: zprava }, { status: /nenalezen/.test(zprava) ? 404 : 500 });
  }

  // Jména k lidem v náhledu (do minusu a největší změny).
  const clenove = await clenovePodniku(c.teamId);
  const jmeno = (id: number) => clenove.find(m => m.id === id)?.name ?? null;
  const nahled = {
    zaznamu: v.souhrn.zaznamu,
    lidi: v.souhrn.lidi,
    celkem: v.souhrn.celkem,
    hodnoceni: v.hodnoceni ?? 0,
    doMinusu: v.souhrn.doMinusu.map(d => ({ ...d, jmeno: jmeno(d.uid) })),
    clenove: v.souhrn.clenove.sort((a, b) => Math.abs(b.po - b.pred) - Math.abs(a.po - a.pred)).slice(0, 12).map(d => ({ ...d, jmeno: jmeno(d.uid) })),
  };
  if (b.nahled !== false) return NextResponse.json({ nahled });

  try {
    const id = await provedPrepocet(c.teamId, c.meId, rozsah, pravidla, v);
    const znamenko = nahled.celkem > 0 ? '+' : '';
    await audit(c.teamId, c.meId, 'points.prepocet', 'body_prepocty', id,
      `${rozsah.typ === 'podnik' ? 'výchozí podniku' : rozsah.typ === 'postup' ? `postup #${rozsah.id}` : `úkol #${rozsah.id}`}: ${nahled.zaznamu} záznamů, ${nahled.lidi} lidí, ${znamenko}${nahled.celkem} b${nahled.hodnoceni ? `, ${nahled.hodnoceni} starších hodnocení nahrazuje` : ''}`);
    return NextResponse.json({ ok: true, id, nahled, historie: await historiePrepoctu(c.teamId) });
  } catch {
    return NextResponse.json({ error: 'Přepočet se nepodařilo uložit. Spusť /api/init.' }, { status: 500 });
  }
}
