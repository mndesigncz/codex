import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { jeStavSrazky } from '@/lib/trestyPenize';
import { parseDbTime } from '@/lib/pragueTime';
import { predMigraci } from '../_spolecne';

// GET /api/tresty/srazky?scope=mine|team&stav=ceka|uplatneno|nesouhlas|zruseno&userId=
//   Seznam srážek z výplaty (kolo 96): fronta „čeká na souhlas" / „nesouhlasí" pro vedení (scope=team,
//   jen finance.mzdy) a vlastní srážky zaměstnance (mine, výchozí). Detail i se zněním dohody je
//   u trestu (GET /api/tresty → item.penize). Odpověď { items: [...] }, kontrakt docs/TRESTY-PENIZE.md.

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(req: NextRequest) {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  const q = req.nextUrl.searchParams;
  const tym = q.get('scope') === 'team';
  if (tym && !c.role.opravneni.has('finance.mzdy')) return NextResponse.json({ error: 'Na tohle nemáš v tomto podniku oprávnění.' }, { status: 403 });
  const stav = q.get('stav');
  if (stav && !jeStavSrazky(stav)) return NextResponse.json({ error: 'Neznámý stav.' }, { status: 400 });
  const n = Number(q.get('userId'));
  const userId = tym ? (Number.isInteger(n) && n > 0 ? n : null) : c.meId;
  try {
    const rows = await sql`
      SELECT d.id, d.penalty_id, d.user_id, d.kind, d.amount, d.installments, d.status, d.day, d.reason, d.refuse_note, d.refused_at,
        d.consent_at, d.created_at, u.name AS user_name, u.avatar AS user_avatar, p.status AS trest_status
      FROM wage_deductions d
      JOIN penalties p ON p.id = d.penalty_id AND p.team_id = d.team_id
      LEFT JOIN users u ON u.id = d.user_id
      WHERE d.team_id = ${c.teamId}
        AND (${userId}::int IS NULL OR d.user_id = ${userId})
        AND (${stav}::text IS NULL OR d.status = ${stav})
      ORDER BY CASE d.status WHEN 'nesouhlas' THEN 0 WHEN 'ceka' THEN 1 ELSE 2 END, d.day DESC, d.id DESC
      LIMIT 300`;
    const iso = (v: unknown) => parseDbTime(v as string)?.toISOString() ?? null;
    return NextResponse.json({
      items: (rows as any[]).map(r => ({
        id: Number(r.id), penaltyId: Number(r.penalty_id), userId: Number(r.user_id), userName: String(r.user_name ?? ''), userAvatar: r.user_avatar ?? null,
        druh: r.kind === 'nahrada' ? 'nahrada' : 'srazka', castka: Number(r.amount) || 0, splatky: Number(r.installments) || 1,
        stav: r.status, day: String(r.day).slice(0, 10), text: String(r.reason ?? ''), trestPlati: r.trest_status === 'plati',
        nesouhlasDuvod: r.refuse_note ?? null, nesouhlasAt: iso(r.refused_at), souhlasAt: iso(r.consent_at), createdAt: iso(r.created_at),
      })),
    });
  } catch (e) {
    if (predMigraci(e)) return NextResponse.json({ items: [] });
    console.error('srážky GET', e);
    return NextResponse.json({ error: 'Srážky se nenačetly.' }, { status: 500 });
  }
}
