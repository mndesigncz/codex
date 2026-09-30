// The employer's answer to "kdo to změnil?" — recent audit entries, newest first.
import { NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { neon } from '@neondatabase/serverless';
import { popisAkce, detailAkce } from '@/lib/auditPopisky';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  // Historie změn prozrazuje, kdo co mazal a měnil — jen s oprávněním,
  // podnik z databáze (ne z role v tokenu).
  const c = await pozaduj('audit.zobrazit');
  if (jeOdpoved(c)) return c;
  const u = { team_id: c.teamId };
  try {
    const rows = await sql`
      SELECT a.*, us.name AS user_name, us.avatar AS user_avatar
      FROM audit_log a LEFT JOIN users us ON us.id = a.user_id
      WHERE a.team_id = ${u.team_id}
      ORDER BY a.created_at DESC LIMIT 100`;
    return NextResponse.json({
      entries: (rows as any[]).map(r => ({
        id: r.id,
        label: popisAkce(r.action),
        detail: detailAkce(r.action, r.detail),
        userName: r.user_name ?? 'Systém',
        userAvatar: r.user_avatar ?? '⚙️',
        createdAt: r.created_at,
      })),
    });
  } catch {
    // Dřív { entries: [] }: výpadek databáze vypadal jako „zatím nic nezměněno“
    // a klient ukázal prázdný stav, který není pravda. Chyba musí být chyba.
    return NextResponse.json({ error: 'Historii změn se nepodařilo načíst.' }, { status: 500 });
  }
}
