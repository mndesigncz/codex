import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { jeClenem } from '@/lib/tenant';
import { audit } from '@/lib/audit';
import { menaPodniku } from '@/lib/menaPodniku';
import { normalizujSlozku, popisSlozky } from '@/lib/trestyPenize';
import { slozkaClena } from '@/lib/trestyPenizeDb';

// Nenároková složka výplaty člena (kolo 96, lib/trestyPenize.ts, docs/TRESTY-PENIZE.md): jaká část výplaty je
// nenároková prémie — % ze mzdy za období, Kč za hodinu, nebo Kč za měsíc; součást dnešní sazby (výplata
// se nezmění, jen rozdělí) nebo navíc. Jen z ní (a z nenárokových prémií) smí trest krátit.
//
//   GET ?userId=              (finance.mzdy)            → { userId, slozka: { typ, hodnota, vSazbe } | null }
//   PUT { userId, typ, hodnota, vSazbe }  (finance.sazby_upravit — mění, kdo smí měnit sazby)
//       typ: 'pct' | 'kc_hod' | 'kc_mesic' | null (null / '' = složku zrušit) → { ok, slozka }

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(req: NextRequest) {
  const c = await pozaduj('finance.mzdy');
  if (jeOdpoved(c)) return c;
  const userId = parseInt(req.nextUrl.searchParams.get('userId') ?? '');
  if (!Number.isFinite(userId)) return NextResponse.json({ error: 'Chybí člověk.' }, { status: 400 });
  return NextResponse.json({ userId, slozka: await slozkaClena(c.teamId, userId) });
}

export async function PUT(req: NextRequest) {
  const c = await pozaduj('finance.sazby_upravit');
  if (jeOdpoved(c)) return c;
  const b = await req.json().catch(() => ({}));
  const userId = parseInt(b.userId);
  if (!Number.isFinite(userId)) return NextResponse.json({ error: 'Chybí člověk.' }, { status: 400 });
  const v = normalizujSlozku(b);
  if (!v.ok) return NextResponse.json({ error: v.chyba }, { status: 400 });
  if (!(await jeClenem(userId, c.teamId))) return NextResponse.json({ error: 'Člověk není v podniku.' }, { status: 404 });
  const s = v.slozka;
  try {
    const done = await sql`
      UPDATE team_members SET nenarokova_typ = ${s?.typ ?? null}, nenarokova_hodnota = ${s?.hodnota ?? null}, nenarokova_v_sazbe = ${s?.vSazbe ?? true}
      WHERE team_id = ${c.teamId} AND user_id = ${userId} RETURNING id`;
    if (!done.length) return NextResponse.json({ error: 'Člověk nemá v podniku členství (jen zrcadlo) — složku zatím nejde uložit.' }, { status: 409 });
  } catch {
    return NextResponse.json({ error: 'Nenárokovou složku se nepodařilo uložit — databáze ještě není připravená.' }, { status: 503 });
  }
  const mena = await menaPodniku(c.teamId);
  await audit(c.teamId, c.meId, 'vyplata.slozka', 'user', userId, popisSlozky(s, mena.money));
  return NextResponse.json({ ok: true, userId, slozka: s });
}
