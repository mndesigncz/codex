// Napojení pokladny (Storyous). Tajemství nikdy neopustí server — GET vrací
// jen maskovaný stav. Kolo 67: čtení stavu a změna napojení jsou dvě
// oprávnění, protože odpojení přeruší tržby i odpisy skladu a to nemá umět
// každý, kdo stav jen vidí.

import { NextRequest, NextResponse } from 'next/server';
import { seal } from '@/lib/secretBox';
import { neon } from '@neondatabase/serverless';
import { getConnection, verifyConnection } from '@/lib/storyous';
import { runFullSync, rememberStock } from '@/lib/posMirror';
import { audit } from '@/lib/audit';
import { teamIsMax, MAX_ONLY_MSG } from '@/lib/planServer';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const sql = neon(process.env.DATABASE_URL!);

/** Kontext v dřívějším tvaru `u` (id, team_id), ať se tělo rout nemění. */
async function clen(klic: string) {
  const c = await pozaduj(klic);
  if (jeOdpoved(c)) return c;
  return { id: c.meId, team_id: c.teamId };
}

export async function GET() {
  const u = await clen('pokladna.stav');
  if (jeOdpoved(u)) return u;
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
  const u = await clen('pokladna.nastavit');
  if (jeOdpoved(u)) return u;
  if (!(await teamIsMax(u.team_id))) return NextResponse.json({ error: MAX_ONLY_MSG }, { status: 402 });
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
      VALUES (${u.team_id}, 'storyous', ${clientId}, ${seal(clientSecret)}, ${merchantId}, ${placeId}, ${probe.placeName ?? null})
      ON CONFLICT (team_id) DO UPDATE SET
        client_id = ${clientId}, client_secret = ${seal(clientSecret)},
        merchant_id = ${merchantId}, place_id = ${placeId}, place_name = ${probe.placeName ?? null}`;
    audit(u.team_id, u.id, 'pos.connect', 'pos', null, `Storyous · ${probe.placeName ?? placeId}`);
    // Nové připojení začíná načisto: kurzor pryč, historie se stáhne hned.
    try { await sql`UPDATE pos_connections SET bills_cursor = NULL, synced_from = NULL, backfill_until = NULL, sync_lock_at = NULL, last_error = NULL WHERE team_id = ${u.team_id}`; } catch { /* starší schéma */ }
    let first: any = null;
    try {
      const conn = await getConnection(u.team_id);
      if (conn) { await rememberStock(u.team_id, conn); first = await runFullSync(u.team_id, u.id, { force: true }); }
    } catch { /* tik to dožene */ }
    return NextResponse.json({ ok: true, placeName: probe.placeName ?? null, sync: first?.bills ?? null });
  } catch {
    return NextResponse.json({ error: 'Pokladna není dostupná — spusť /api/init.' }, { status: 400 });
  }
}

export async function DELETE() {
  const u = await clen('pokladna.nastavit');
  if (jeOdpoved(u)) return u;
  try { await sql`DELETE FROM pos_connections WHERE team_id = ${u.team_id}`; } catch {}
  audit(u.team_id, u.id, 'pos.disconnect', 'pos', null, 'Storyous');
  return NextResponse.json({ ok: true });
}
