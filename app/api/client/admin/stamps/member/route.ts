// Razítka jednoho člena v administraci: karty a poslední změny (GET), ruční
// připsání / odebrání s důvodem a storno poslední akce (POST). Totéž hromadně
// (action „bulk“: vybraní hosté nebo celá skupina). Mimo CardScan — u kasy se
// razítka dávají jen běžnou cestou.
import { NextRequest, NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { sql } from '@/lib/client';
import { kartyClena, stornoPosledni, upravRazitka } from '@/lib/stampsAdmin';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('vernost.zobrazit');
  if (jeOdpoved(ctx)) return ctx;
  const cid = parseInt(new URL(req.url).searchParams.get('customerId') ?? '');
  if (!Number.isFinite(cid)) return NextResponse.json({ error: 'Neplatný host' }, { status: 400 });
  return NextResponse.json(await kartyClena(ctx.teamId, cid));
}

export async function POST(req: NextRequest) {
  const ctx = await pozaduj('vernost.razitka_upravit');
  if (jeOdpoved(ctx)) return ctx;
  const b = await req.json().catch(() => ({}));
  if (b.action === 'bulk') return hromadne(ctx, b);
  const customerId = parseInt(b.customerId); const campaignId = parseInt(b.campaignId);
  if (!Number.isFinite(customerId) || !Number.isFinite(campaignId)) return NextResponse.json({ error: 'Vyber hosta a kartičku.' }, { status: 400 });
  if (b.action === 'undo') {
    const r = await stornoPosledni({ teamId: ctx.teamId, campaignId, customerId, ocekavanaUdalost: Number(b.eventId) || null, staffId: ctx.meId });
    if ('chyba' in r) return NextResponse.json({ error: r.chyba }, { status: r.status });
    audit(ctx.teamId, ctx.meId, 'client.stamps.undo', 'client', customerId, r.veta);
    return NextResponse.json({ ok: true, message: r.veta });
  }
  const r = await upravRazitka({ teamId: ctx.teamId, campaignId, customerId, delta: Number(b.delta), duvod: String(b.reason ?? ''), staffId: ctx.meId });
  if ('chyba' in r) return NextResponse.json({ error: r.chyba }, { status: r.status });
  audit(ctx.teamId, ctx.meId, 'client.stamps.adjust', 'client', customerId, `${r.veta} · ${String(b.reason ?? '').trim().slice(0, 120)}`);
  return NextResponse.json({ ok: true, message: r.veta });
}

const MAX_HROMADNE = 200;
const cislo = (v: unknown) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 ? n : null; };

/** Ruční připsání / odebrání razítek vybraným hostům nebo celé skupině; každému zvlášť, přeskočení má důvod. */
async function hromadne(ctx: { teamId: number; meId: number }, b: any) {
  const campaignId = cislo(b.campaignId);
  const delta = Math.round(Number(b.delta));
  if (!campaignId) return NextResponse.json({ error: 'Vyber kartičku.' }, { status: 400 });
  let ids: number[] = Array.isArray(b.customerIds) ? b.customerIds.map(cislo).filter((x: number | null): x is number => x != null) : [];
  const skupina = cislo(b.groupId);
  if (skupina) {
    const g = await sql`SELECT customer_id FROM client_group_members WHERE team_id = ${ctx.teamId} AND group_id = ${skupina}` as any[];
    ids.push(...g.map(r => Number(r.customer_id)));
  }
  ids = Array.from(new Set(ids));
  if (!ids.length) return NextResponse.json({ error: 'Vyber hosta nebo skupinu.' }, { status: 400 });
  if (ids.length > MAX_HROMADNE) return NextResponse.json({ error: `Najednou nejvýš ${MAX_HROMADNE} hostů.` }, { status: 400 });
  let upraveno = 0; const preskoceno: { id: number; proc: string }[] = [];
  for (const cid of ids) {
    try {
      const r = await upravRazitka({ teamId: ctx.teamId, campaignId, customerId: cid, delta, duvod: String(b.reason ?? ''), staffId: ctx.meId });
      if ('chyba' in r) { if (ids.length === 1) return NextResponse.json({ error: r.chyba }, { status: r.status }); preskoceno.push({ id: cid, proc: r.chyba }); } else upraveno++;
    } catch (e: any) { preskoceno.push({ id: cid, proc: e?.message || 'Nepovedlo se.' }); }
  }
  audit(ctx.teamId, ctx.meId, 'client.stamps.adjust', 'client', null, `${delta > 0 ? '+' : ''}${delta} razítek × ${upraveno} hostů · ${String(b.reason ?? '').trim().slice(0, 120)}`);
  return NextResponse.json({ ok: upraveno > 0, upraveno, preskoceno });
}
