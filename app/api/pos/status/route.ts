// Zdraví propojení s pokladnou — pro Nastavení → Pokladna. Vedení vidí, od
// kdy jsou data, kolik účtenek je u nás, kdy proběhla poslední synchronizace
// a jestli něco selhalo. Odtud jde i ruční synchronizace a načtení historie.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { randomBytes } from 'crypto';
import { health, runFullSync, backfill, rememberStock } from '@/lib/posMirror';
import { getConnection } from '@/lib/storyous';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const sql = neon(process.env.DATABASE_URL!);

async function employer() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const id = parseInt((session.user as any).id);
  const [u] = await sql`SELECT id, role, team_id FROM users WHERE id = ${id}`;
  if (!u || u.role !== 'employer' || !u.team_id) return null;
  return u;
}

function webhookUrl(req: NextRequest, merchantId: string | null, placeId: string) {
  const origin = process.env.NEXTAUTH_URL?.replace(/\/$/, '') || new URL(req.url).origin;
  return `${origin}/api/pos/webhook/${merchantId ?? 'merchant'}/${placeId}`;
}

export async function GET(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const h = await health(u.team_id);
  const conn = h.connected ? await getConnection(u.team_id) : null;
  return NextResponse.json({
    ...h,
    webhookUrl: conn ? webhookUrl(req, conn.merchantId, conn.placeId) : null,
  });
}

export async function POST(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const action = String(b.action ?? '');
  try {
    if (action === 'sync') {
      const r = await runFullSync(u.team_id, u.id, { force: true });
      return NextResponse.json({ ok: r.bills.ok, ...r });
    }
    if (action === 'backfill') {
      const days = Math.max(7, Math.min(400, parseInt(String(b.days ?? '90'), 10) || 90));
      audit(u.team_id, u.id, 'pos.backfill', 'pos', null, `${days} dní`);
      const r = await backfill(u.team_id, days);
      return NextResponse.json({ ok: r.ok, bills: r });
    }
    if (action === 'webhook-secret') {
      // Nové tajemství pro DataSync; staré přestane platit okamžitě.
      const secret = randomBytes(24).toString('base64url');
      await sql`UPDATE pos_connections SET webhook_secret = ${secret} WHERE team_id = ${u.team_id}`;
      audit(u.team_id, u.id, 'pos.webhook', 'pos', null, 'nové tajemství');
      return NextResponse.json({ ok: true, webhookSecret: secret });
    }
    if (action === 'webhook-off') {
      await sql`UPDATE pos_connections SET webhook_secret = NULL WHERE team_id = ${u.team_id}`;
      return NextResponse.json({ ok: true });
    }
    if (action === 'stock') {
      const conn = await getConnection(u.team_id);
      if (!conn) return NextResponse.json({ error: 'Pokladna není připojená.' }, { status: 400 });
      const stockId = await rememberStock(u.team_id, conn);
      return NextResponse.json({ ok: true, stockId });
    }
    return NextResponse.json({ error: 'Neznámá akce' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String((e as any)?.message ?? 'Selhalo').slice(0, 160) }, { status: 502 });
  }
}
