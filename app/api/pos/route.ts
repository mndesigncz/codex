// POS connection management (Storyous). Employer only; the secret never
// leaves the server — GET returns just a masked status.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { getConnection, verifyConnection } from '@/lib/storyous';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function employer() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const id = parseInt((session.user as any).id);
  const [u] = await sql`SELECT id, role, team_id FROM users WHERE id = ${id}`;
  if (!u || u.role !== 'employer' || !u.team_id) return null;
  return u;
}

export async function GET() {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const conn = await getConnection(u.team_id);
  if (!conn) return NextResponse.json({ connected: false });
  return NextResponse.json({
    connected: true,
    placeName: conn.placeName,
    merchantId: conn.merchantId,
    clientIdMasked: conn.clientId.slice(0, 4) + '…' + conn.clientId.slice(-4),
  });
}

export async function POST(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const clientId = String(b.clientId ?? '').trim();
  const clientSecret = String(b.clientSecret ?? '').trim();
  const merchantId = String(b.merchantId ?? '').trim();
  const placeId = String(b.placeId ?? '').trim();
  if (!clientId || !clientSecret || !merchantId || !placeId) {
    return NextResponse.json({ error: 'Vyplň všechna čtyři pole.' }, { status: 400 });
  }
  const probe = await verifyConnection({ teamId: u.team_id, clientId, clientSecret, merchantId, placeId, placeName: null });
  if (!probe.ok) return NextResponse.json({ error: probe.error ?? 'Připojení se nepodařilo ověřit.' }, { status: 400 });
  try {
    await sql`
      INSERT INTO pos_connections (team_id, provider, client_id, client_secret, merchant_id, place_id, place_name)
      VALUES (${u.team_id}, 'storyous', ${clientId}, ${clientSecret}, ${merchantId}, ${placeId}, ${probe.placeName ?? null})
      ON CONFLICT (team_id) DO UPDATE SET
        client_id = ${clientId}, client_secret = ${clientSecret},
        merchant_id = ${merchantId}, place_id = ${placeId}, place_name = ${probe.placeName ?? null}`;
    audit(u.team_id, u.id, 'pos.connect', 'pos', null, `Storyous · ${probe.placeName ?? placeId}`);
    return NextResponse.json({ ok: true, placeName: probe.placeName ?? null });
  } catch {
    return NextResponse.json({ error: 'Pokladna není dostupná — spusť /api/init.' }, { status: 400 });
  }
}

export async function DELETE() {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  try { await sql`DELETE FROM pos_connections WHERE team_id = ${u.team_id}`; } catch {}
  audit(u.team_id, u.id, 'pos.disconnect', 'pos', null, 'Storyous');
  return NextResponse.json({ ok: true });
}
