// Vyřízení nahlášení vedením: odstranit obsah, označit za vyřízené, zamítnout.
// Smí jen ten, kdo smí odebírat členy (tym.odebrat), a jen u nahlášení svého podniku.

import { NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { stavPoAkci } from '@/lib/moderace';
import { vyridNahlaseni } from '@/lib/moderaceDb';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const reportId = parseInt(id);
  if (!Number.isInteger(reportId) || reportId <= 0) return NextResponse.json({ error: 'Neplatné nahlášení.' }, { status: 400 });
  const c = await pozaduj('tym.odebrat');
  if (jeOdpoved(c)) return c;
  const body = await request.json().catch(() => ({}));
  const novyStav = stavPoAkci(body?.akce);
  if (!novyStav) return NextResponse.json({ error: 'Neznámá akce.' }, { status: 400 });
  try {
    // Obsah i stav jen u nahlášení TOHOHLE podniku (vyridNahlaseni s teamId).
    const r = await vyridNahlaseni(reportId, novyStav, c.meId, c.teamId);
    if (!r) return NextResponse.json({ error: 'Nahlášení nenalezeno.' }, { status: 404 });
    await audit(c.teamId, c.meId, 'nahlaseni.vyreseno', 'content_report', reportId, novyStav);
    return NextResponse.json({ ok: true, status: novyStav });
  } catch (e) {
    console.error('vyřízení nahlášení selhalo', e);
    return NextResponse.json({ error: 'Nahlášení se nepodařilo vyřídit.' }, { status: 500 });
  }
}
