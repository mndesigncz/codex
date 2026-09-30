// Blokace uživatele (Apple 1.2): zprávy zablokovaného autora se blokujícímu
// přestanou zobrazovat (GET zpráv je filtruje). Blokovat jde jen kolegu z vlastního
// podniku, ne sebe; odblokovat kdykoli.

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { smiZablokovat } from '@/lib/moderace';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  try {
    const rows = await sql`
      SELECT b.blocked_id AS id, u.name, u.avatar FROM user_blocks b JOIN users u ON u.id = b.blocked_id
      WHERE b.blocker_id = ${c.meId} ORDER BY b.created_at DESC`;
    return NextResponse.json({ blocked: rows });
  } catch {
    return NextResponse.json({ blocked: [] });
  }
}

export async function POST(request: Request) {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  const b = await request.json().catch(() => ({}));
  const cilId = Number(b?.userId);
  if (!smiZablokovat(c.meId, cilId)) return NextResponse.json({ error: 'Tohohle uživatele zablokovat nejde.' }, { status: 400 });
  try {
    // Jen kolega z téhož podniku: jinak by šlo zakládat řádky pro libovolná id.
    const [clen] = await sql`
      SELECT 1 AS ok FROM team_members WHERE user_id = ${cilId} AND team_id = ${c.teamId}
      UNION SELECT 1 FROM users WHERE id = ${cilId} AND team_id = ${c.teamId} LIMIT 1`;
    if (!clen) return NextResponse.json({ error: 'Uživatel není ve vašem podniku.' }, { status: 404 });
    await sql`INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (${c.meId}, ${cilId}) ON CONFLICT DO NOTHING`;
    await audit(c.teamId, c.meId, 'uzivatel.zablokovan', 'user', cilId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('blokace selhala', e);
    return NextResponse.json({ error: 'Blokaci se zatím nepodařilo uložit. Zkuste to znovu.' }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  const b = await request.json().catch(() => ({}));
  const cilId = Number(b?.userId);
  if (!Number.isInteger(cilId) || cilId <= 0) return NextResponse.json({ error: 'Neplatný uživatel.' }, { status: 400 });
  try {
    await sql`DELETE FROM user_blocks WHERE blocker_id = ${c.meId} AND blocked_id = ${cilId}`;
    await audit(c.teamId, c.meId, 'uzivatel.odblokovan', 'user', cilId);
  } catch { /* tabulka ještě není, není co odblokovat */ }
  return NextResponse.json({ ok: true });
}
