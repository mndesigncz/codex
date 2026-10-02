// Export deníku věrnosti do CSV (Excel): body, kredit, útrata a poznámky za zvolené období.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { denikCsv } from '@/lib/bodyPravidla';
import { rozsahExportu, zajistiBodyPravidla } from '@/lib/bodyPravidlaDb';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** Nejvíc řádků v jednom souboru; delší období se rozdělí. */
const MAX_RADKU = 50000;

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('vernost.zobrazit');
  if (jeOdpoved(ctx)) return ctx;
  const q = new URL(req.url).searchParams;
  const { od, do: doDne } = rozsahExportu(q.get('od'), q.get('do'));
  const cid = parseInt(String(q.get('customerId')), 10) || null;
  // Kontakt hosta jen s přístupem ke kontaktům (jako seznam zákazníků).
  const kontakty = ctx.role.opravneni.has('zakaznici.kontakty');
  try {
    await zajistiBodyPravidla();
    // Pražské dny jako hranice: den začíná o jednu až dvě hodiny dřív než v UTC.
    const rows = await sql`
      SELECT l.created_at, u.name, u.email, l.kind, l.delta, l.credit_delta, l.amount, l.note, l.ref
      FROM client_loyalty_ledger l JOIN users u ON u.id = l.customer_id
      WHERE l.team_id = ${ctx.teamId}
        AND (l.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Prague')::date >= ${od}::date
        AND (l.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Prague')::date <= ${doDne}::date
        AND (${cid}::int IS NULL OR l.customer_id = ${cid}::int)
      ORDER BY l.created_at DESC, l.id DESC LIMIT ${MAX_RADKU}` as any[];
    const csv = denikCsv(rows.map(r => ({ ...r, email: kontakty ? r.email : null })));
    audit(ctx.teamId, ctx.meId, 'client.export', 'client', cid, `deník věrnosti ${od} až ${doDne}: ${rows.length} řádků`);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="vernost-denik-${od}_${doDne}.csv"`,
        'Cache-Control': 'no-store',
        'X-Radku': String(rows.length), 'X-Zkraceno': rows.length >= MAX_RADKU ? '1' : '0',
      },
    });
  } catch (e) {
    console.error('[vernost] export', e);
    return NextResponse.json({ error: 'Export se nepovedl.' }, { status: 500 });
  }
}
