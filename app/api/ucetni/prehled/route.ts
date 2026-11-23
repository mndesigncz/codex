// GET /api/ucetni/prehled?od&do[&mzdy=1] — náhled podkladů pro účetní: počty, součty, fotky, varování.
// Fotky se tu nestahují; počítá se z řádků a záznamů nahraných souborů podniku.

import { NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { nazevZipu, overObdobi, posPoDnech } from '@/lib/ucetniExport';
import { nahledPodkladu } from '@/lib/ucetniServer';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const c = await pozaduj('finance.exportovat');
  if (jeOdpoved(c)) return c;
  const q = new URL(req.url).searchParams;
  const o = overObdobi(q.get('od'), q.get('do'));
  if (!o.ok) return NextResponse.json({ error: o.chyba }, { status: 400 });
  const smiMzdy = c.role.opravneni.has('finance.mzdy');
  const mzdy = q.get('mzdy') === '1' && smiMzdy;
  try {
    const n = await nahledPodkladu(c.teamId, o.od, o.do, mzdy);
    if (!n) return NextResponse.json({ error: 'Podnik nenalezen.' }, { status: 404 });
    const { data, souhrn } = n;
    return NextResponse.json({
      od: o.od, do: o.do, mena: data.podnik.mena, smiMzdy, sMzdami: mzdy,
      nazevSouboru: nazevZipu(data.podnik.nazev, o.od, o.do),
      podnik: { nazev: data.podnik.nazev, ico: data.podnik.ico, dic: data.podnik.dic },
      pocty: {
        uctenky: data.uctenky.length, prijemky: data.prijemky.length, uzaverky: data.uzaverky.length,
        dnyPokladny: posPoDnech(data.pos).length, vyplaty: data.vyplaty ? data.vyplaty.length : null,
      },
      souhrn,
    });
  } catch (e) {
    console.error('ucetni/prehled', e);
    return NextResponse.json({ error: 'Náhled se nepodařilo načíst. Zkus to znovu.' }, { status: 500 });
  }
}
