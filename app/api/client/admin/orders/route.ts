// Historie objednávek od stolu pro vedení (Client › Objednávky › Historie, kolo 7).
//
// Fronta (/api/client/staff/inbox) drží jen rozpracované a poslední tři hodiny; tady je
// zvolené období (nejvýš 92 dní) se souhrnem: kolik objednávek přišlo, kolik dělaly
// hotové (jen ty — „Od stolu celkem", skutečná tržba je z pokladny), průměr a kolik
// obsluha nepřijala. Souhrn počítá souhrnObjednavek z lib/klientPrehled (sdílí se s testy).
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { dayPlus, pragueToday } from '@/lib/pragueTime';
import { STAVY_OBJEDNAVEK, obdobiHistorie, souhrnObjednavek, type StavObjednavky } from '@/lib/klientPrehled';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** Kolik objednávek se pošle k zobrazení; souhrn je vždy z celého období. */
const SEZNAM_MAX = 300;

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('objednavky.zobrazit');
  if (jeOdpoved(ctx)) return ctx;
  const q = new URL(req.url).searchParams;
  const obdobi = obdobiHistorie(q.get('from'), q.get('to'), pragueToday());
  if ('chyba' in obdobi) return NextResponse.json({ error: obdobi.chyba }, { status: 400 });
  const stavRaw = q.get('status');
  if (stavRaw && !STAVY_OBJEDNAVEK.includes(stavRaw as StavObjednavky)) return NextResponse.json({ error: 'Neznámý stav objednávky.' }, { status: 400 });
  const stav = stavRaw || null;
  // created_at je UTC bez zóny; hranice dne jsou pražské půlnoci převedené na UTC (index na created_at zůstane použitelný).
  const od = obdobi.od;
  const doPo = dayPlus(obdobi.do, 1);
  const vsechny = await sql`
    SELECT o.status, o.total FROM client_orders o
    WHERE o.team_id = ${ctx.teamId}
      AND o.created_at >= ((${od}::date)::timestamp AT TIME ZONE 'Europe/Prague') AT TIME ZONE 'UTC'
      AND o.created_at < ((${doPo}::date)::timestamp AT TIME ZONE 'Europe/Prague') AT TIME ZONE 'UTC'
      AND (${stav}::text IS NULL OR o.status = ${stav})` as any[];
  const rows = await sql`
    SELECT o.id, o.items, o.total, o.status, o.created_at, o.updated_at, us.name AS customer_name, t.name AS table_name
    FROM client_orders o LEFT JOIN users us ON us.id = o.customer_id LEFT JOIN client_tables t ON t.id = o.table_id
    WHERE o.team_id = ${ctx.teamId}
      AND o.created_at >= ((${od}::date)::timestamp AT TIME ZONE 'Europe/Prague') AT TIME ZONE 'UTC'
      AND o.created_at < ((${doPo}::date)::timestamp AT TIME ZONE 'Europe/Prague') AT TIME ZONE 'UTC'
      AND (${stav}::text IS NULL OR o.status = ${stav})
    ORDER BY o.created_at DESC, o.id DESC
    LIMIT ${SEZNAM_MAX}` as any[];
  const souhrn = souhrnObjednavek(vsechny.map(o => ({ castka: Number(o.total) || 0, stav: String(o.status) })));
  const orders = rows.map(o => ({
    id: Number(o.id),
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    total: Number(o.total) || 0,
    status: String(o.status),
    tableName: o.table_name ?? null,
    customerName: o.customer_name ?? null,
    polozky: (Array.isArray(o.items) ? o.items : []).map((l: any) => ({ nazev: String(l?.name ?? ''), pocet: Number(l?.count) || 1 })),
  }));
  return NextResponse.json({ od: obdobi.od, do: obdobi.do, orders, souhrn, celkem: vsechny.length });
}
