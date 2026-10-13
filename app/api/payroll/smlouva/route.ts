import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { jeClenem } from '@/lib/tenant';
import { audit } from '@/lib/audit';
import { LIMIT_DPP_HODIN, nazevSmlouvy, normalizujSmlouvu } from '@/lib/dochazkaPrehled';

// Typ smlouvy člena a roční strop hodin (kolo 8, R8-1): HPP / DPČ / DPP / OSVČ na členství v podniku.
// U DPP hlídá Výplatní listina „Letos 262 / 300 h" a hranici odvodů. Mění, kdo smí měnit sazby.

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function PATCH(req: NextRequest) {
  const c = await pozaduj('finance.sazby_upravit');
  if (jeOdpoved(c)) return c;
  const b = await req.json().catch(() => ({}));
  const userId = parseInt(b.userId);
  if (!Number.isFinite(userId)) return NextResponse.json({ error: 'Chybí člověk.' }, { status: 400 });
  const typ = b.contractType === null || b.contractType === '' ? null : normalizujSmlouvu(b.contractType);
  if (typ === null && b.contractType != null && b.contractType !== '') return NextResponse.json({ error: 'Neznámý typ smlouvy.' }, { status: 400 });
  let limit: number | null = null;
  if (b.contractHoursYear != null && b.contractHoursYear !== '') {
    limit = Math.round(Number(b.contractHoursYear));
    if (!Number.isFinite(limit) || limit < 0 || limit > 5000) return NextResponse.json({ error: 'Roční limit hodin musí být číslo od 0 do 5000.' }, { status: 400 });
    if (limit === 0) limit = null;
  } else if (typ === 'DPP') limit = LIMIT_DPP_HODIN;
  if (!(await jeClenem(userId, c.teamId))) return NextResponse.json({ error: 'Člověk není v podniku.' }, { status: 404 });
  try {
    const done = await sql`UPDATE team_members SET contract_type = ${typ}, contract_hours_year = ${limit} WHERE team_id = ${c.teamId} AND user_id = ${userId} RETURNING id`;
    if (!done.length) return NextResponse.json({ error: 'Člověk nemá v podniku členství (jen zrcadlo) — smlouvu zatím nejde uložit.' }, { status: 409 });
  } catch {
    return NextResponse.json({ error: 'Smlouvu se nepodařilo uložit — databáze ještě není připravená.' }, { status: 503 });
  }
  await audit(c.teamId, c.meId, 'vyplata.smlouva', 'user', userId, `${typ ? nazevSmlouvy(typ) : 'bez typu'}${limit ? ` · ${limit} h/rok` : ''}`);
  return NextResponse.json({ ok: true, contractType: typ, contractHoursYear: limit });
}
