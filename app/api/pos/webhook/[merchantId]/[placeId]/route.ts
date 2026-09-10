// Webhook pro Storyous DataSync.
//
// Storyous umí sám poslat změněná data na naši adresu — zapíná to jejich
// podpora pro provozovnu, potřebují k tomu URL a tajemství, které posílají
// v hlavičce Authorization. Adresa i tajemství jsou v Nastavení → Pokladna.
//
// Payload se záměrně nerozebírá: schéma domén se v dokumentaci liší od
// toho, co API vrací, a špatně přečtená účtenka by byla horší než žádná.
// Webhook je budíček — po něm se hned spustí přírůstková synchronizace
// přes API, jehož tvar známe naživo. Výsledek je stejný: data do minuty.

import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { neon } from '@neondatabase/serverless';
import { runFullSync } from '@/lib/posMirror';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const sql = neon(process.env.DATABASE_URL!);

function same(a: string, b: string) {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  if (ba.length !== bb.length) { timingSafeEqual(ba, ba); return false; }
  return timingSafeEqual(ba, bb);
}

async function handle(request: Request, params: { merchantId: string; placeId: string }) {
  let conn: any;
  try {
    [conn] = await sql`
      SELECT team_id, webhook_secret FROM pos_connections
      WHERE merchant_id = ${params.merchantId} AND place_id = ${params.placeId}`;
  } catch { return NextResponse.json({ error: 'Nedostupné' }, { status: 503 }); }
  if (!conn?.webhook_secret) return NextResponse.json({ error: 'Webhook není zapnutý' }, { status: 404 });

  const auth = request.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  if (!token || !same(token, String(conn.webhook_secret))) {
    return NextResponse.json({ error: 'Neautorizováno' }, { status: 401 });
  }

  let domain = 'unknown';
  try { const body = await request.json(); domain = String(body?.dataDomain ?? 'unknown'); } catch { /* prázdné tělo je v pořádku */ }
  const teamId = Number(conn.team_id);
  try { await sql`UPDATE pos_connections SET last_webhook_at = NOW() WHERE team_id = ${teamId}`; } catch { /* nic */ }

  // Změna účtenek nebo položek → synchronizovat hned; ostatní domény stačí zaznamenat.
  if (['bills', 'billCosts', 'items', 'placeItems', 'itemCategories', 'unknown'].includes(domain)) {
    try { await runFullSync(teamId, null, { force: true }); } catch { /* další tik to dožene */ }
  }
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: Request, ctx: { params: { merchantId: string; placeId: string } }) {
  return handle(request, ctx.params);
}
export async function PUT(request: Request, ctx: { params: { merchantId: string; placeId: string } }) {
  return handle(request, ctx.params);
}
