// Razítka jednoho člena v administraci: karty a poslední změny (GET), ruční
// připsání / odebrání s důvodem a storno poslední akce (POST). Mimo CardScan —
// u kasy se razítka dávají jen běžnou cestou.
import { NextRequest, NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
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
