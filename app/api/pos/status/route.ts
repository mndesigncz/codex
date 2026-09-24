// Zdraví propojení s pokladnou — pro Nastavení → Pokladna. Vedení vidí, od
// kdy jsou data, kolik účtenek je u nás, kdy proběhla poslední synchronizace
// a jestli něco selhalo. Odtud jde i ruční synchronizace a načtení historie.
//
// Kolo 67: jedna routa, dvě úrovně. Stav a ruční synchronizace jsou provoz
// (`pokladna.stav`, `pokladna.synchronizovat`); tajemství webhooku je
// konfigurace (`pokladna.nastavit`) — kdo ho zná, může pokladně podstrčit
// falešné volání, proto ho GET bez toho oprávnění nevrací.

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { randomBytes } from 'crypto';
import { health, runFullSync, backfill, rememberStock } from '@/lib/posMirror';
import { getConnection } from '@/lib/storyous';
import { audit } from '@/lib/audit';
import { verejnaHlaska } from '@/lib/verejnaChyba';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const sql = neon(process.env.DATABASE_URL!);

/** Které oprávnění potřebuje která akce POSTu. */
const KLIC_AKCE: Record<string, string> = {
  sync: 'pokladna.synchronizovat',
  backfill: 'pokladna.synchronizovat',
  stock: 'pokladna.synchronizovat',
  'webhook-secret': 'pokladna.nastavit',
  'webhook-off': 'pokladna.nastavit',
};

function webhookUrl(req: NextRequest, merchantId: string | null, placeId: string) {
  const origin = process.env.NEXTAUTH_URL?.replace(/\/$/, '') || new URL(req.url).origin;
  return `${origin}/api/pos/webhook/${merchantId ?? 'merchant'}/${placeId}`;
}

export async function GET(req: NextRequest) {
  const c = await pozaduj('pokladna.stav');
  if (jeOdpoved(c)) return c;
  const h = await health(c.teamId);
  const conn = h.connected ? await getConnection(c.teamId) : null;
  return NextResponse.json({
    ...h,
    webhookSecret: c.role.opravneni.has('pokladna.nastavit') ? h.webhookSecret : null,
    webhookUrl: conn ? webhookUrl(req, conn.merchantId, conn.placeId) : null,
  });
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const action = String(b.action ?? '');
  const klic = KLIC_AKCE[action];
  // Neznámou akci odmítne až po přihlášení — cizímu nemá prozradit, co existuje.
  const c = await pozaduj(klic ?? 'pokladna.synchronizovat');
  if (jeOdpoved(c)) return c;
  if (!klic) return NextResponse.json({ error: 'Neznámá akce' }, { status: 400 });
  const u = { id: c.meId, team_id: c.teamId };
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
    return NextResponse.json({ error: verejnaHlaska(e, 'Spojení s pokladnou selhalo.', '[pos/status]') }, { status: 502 });
  }
}
