// Poslat kupon hostům: konkrétnímu hostovi, skupině, nebo všem členům.
// `zkouska: true` nic nezapíše a vrátí, kolik hostů by kupon dostalo a koho a proč se přeskočí.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { posliKupon } from '@/lib/kuponyRozeslani';
import { cistiPublikum } from '@/lib/kuponyPublikum';
import { jeVidetelnyHostum, stavKuponu } from '@/lib/kuponyPravidla';
import { pragueToday } from '@/lib/pragueTime';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** Hledání člena podle jména pro ruční výběr příjemce (jen jméno, e-mail se tu nevydává). */
export async function GET(req: NextRequest) {
  const ctx = await pozaduj('kupony.spravovat');
  if (jeOdpoved(ctx)) return ctx;
  const q = String(new URL(req.url).searchParams.get('q') ?? '').trim().toLowerCase().slice(0, 60);
  const like = '%' + q.replace(/[\\%_]/g, ch => '\\' + ch) + '%';
  const hoste = await sql`
    SELECT m.customer_id AS id, us.name FROM client_memberships m JOIN users us ON us.id = m.customer_id
    WHERE m.team_id = ${ctx.teamId} AND (${q} = '' OR LOWER(us.name) LIKE ${like} ESCAPE '\\')
    ORDER BY m.last_visit_at DESC NULLS LAST, us.name LIMIT 20`;
  return NextResponse.json({ hoste: (hoste as any[]).map(h => ({ id: Number(h.id), name: String(h.name ?? '') })) });
}

export async function POST(req: NextRequest) {
  const ctx = await pozaduj('kupony.spravovat');
  if (jeOdpoved(ctx)) return ctx;
  const b = await req.json().catch(() => ({}));
  const id = parseInt(String(b.id), 10);
  const [c] = await sql`SELECT * FROM client_coupons WHERE id = ${id} AND team_id = ${ctx.teamId} AND kind = 'offer'`;
  if (!c) return NextResponse.json({ error: 'Kupon nenalezen' }, { status: 404 });
  if (!jeVidetelnyHostum(c)) return NextResponse.json({ error: 'Koncept, archivovaný nebo vypnutý kupon se hostům neposílá. Nejdřív ho zveřejni.' }, { status: 409 });
  const stav = stavKuponu(c, pragueToday());
  if (stav === 'vyprselo') return NextResponse.json({ error: 'Kupon už skončil. Prodluž mu platnost, než ho pošleš.' }, { status: 409 });
  const pub = cistiPublikum(b.publikum);
  if ('chyba' in pub) return NextResponse.json({ error: pub.chyba }, { status: 400 });
  const zprava = String(b.zprava ?? '').trim().slice(0, 140);
  const zkouska = b.zkouska === true;
  const [p] = await sql`SELECT slug FROM client_profiles WHERE team_id = ${ctx.teamId}`;
  const v = await posliKupon(ctx.teamId, c, pub.publikum, { zkouska, zprava, slug: p?.slug ?? null });
  if (!zkouska) {
    const komu = pub.publikum.druh === 'vsichni' ? 'všem členům' : pub.publikum.druh === 'skupina' ? 'skupině hostů' : `${pub.publikum.hostIds.length} vybraným hostům`;
    await audit(ctx.teamId, ctx.meId, 'client.kupon.odeslan', 'client_coupon', id, `${c.title}: poslán ${komu} (dostalo ${v.poslano} z ${v.celkem})`);
  }
  return NextResponse.json({ ok: true, zkouska, ...v });
}
