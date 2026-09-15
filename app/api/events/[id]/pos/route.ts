// Akce × pokladna (Storyous): co se v kase namarkovalo za dobu akce.
//
// Pro akci U NÁS umí pokladna říct dvě věci:
//  1. tržbu za časové okno akce — účtenky dne filtrované na start–konec,
//  2. prodané kusy položek z menu akce — přes párování menu ↔ POS produkt
//     (pos_sales, zrcadlené nočním syncem).
// Je to informativní pohled: tržba dne teče do financí přes běžnou uzávěrku,
// tady se nic nezapisuje, jen čte.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { getConnection, billsInRange } from '@/lib/storyous';
import { dayPlus } from '@/lib/pragueTime';
import { normalizeEventMenu } from '@/lib/events';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const sql = neon(process.env.DATABASE_URL!);

/** ISO čas účtenky → „HH:MM" v Praze (paidAt nese posun, Intl ho přepočítá). */
function pragueHM(iso: string): string {
  try {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
  } catch { return '00:00'; }
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const meId = parseInt((session.user as any).id);
  const [u] = await sql`SELECT id, role, team_id FROM users WHERE id = ${meId}`;
  if (!u?.team_id || u.role !== 'employer') return NextResponse.json({ error: 'Jen pro vedení.' }, { status: 403 });

  const id = parseInt(params.id);
  const [ev] = await sql`SELECT * FROM events WHERE id = ${id} AND team_id = ${u.team_id}`;
  if (!ev) return NextResponse.json({ error: 'Akce nenalezena' }, { status: 404 });
  if (ev.offsite === true) return NextResponse.json({ error: 'Výjezd jede mimo kasu — použijte uzávěrku za akci.' }, { status: 400 });

  const conn = await getConnection(u.team_id);
  if (!conn) return NextResponse.json({ error: 'Pokladna není připojená (Nastavení → Pokladna).' }, { status: 400 });

  const date = String(ev.date);
  const start = ev.start_time ? String(ev.start_time).slice(0, 5) : null;
  // Bez konce se bere start + 4 hodiny; bez začátku celý obchodní den.
  const end = ev.end_time
    ? String(ev.end_time).slice(0, 5)
    : start ? `${String(Math.min(23, parseInt(start) + 4)).padStart(2, '0')}${start.slice(2)}` : null;

  // --- tržba za okno akce: účtenky dne, filtr na čas zaplacení ---
  let revenue = 0, bills = 0;
  try {
    await billsInRange(conn, date, dayPlus(date, 2), (b) => {
      if (b.day !== date || b.deleted || b.refunded) return;
      if (start) {
        const hm = pragueHM(b.paidAt ?? b.createdAt);
        if (hm < start || (end != null && hm > end)) return;
      }
      revenue += Number(b.finalPrice) || 0;
      bills++;
    }, 40);
  } catch (e) {
    console.error('event pos window failed', e);
    return NextResponse.json({ error: 'Pokladna teď neodpovídá — zkus to za chvíli.' }, { status: 502 });
  }

  // --- prodané kusy položek menu akce (přes párování menu ↔ POS produkt) ---
  const lines = normalizeEventMenu(ev.menu);
  const itemIds = lines.map(l => l.itemId).filter((x): x is number => x != null);
  let items: { name: string; qty: number; paired: boolean }[] = [];
  if (itemIds.length) {
    try {
      const rows = await sql`
        SELECT mi.id, mi.name, mi.pos_product_id, COALESCE(ps.qty, 0) AS qty
        FROM menu_items mi
        JOIN menu_sections ms ON ms.id = mi.section_id
        JOIN menu_boards mb ON mb.id = ms.board_id AND mb.team_id = ${u.team_id}
        LEFT JOIN pos_sales ps ON ps.team_id = ${u.team_id} AND ps.date = ${date} AND ps.product_id = mi.pos_product_id
        WHERE mi.id = ANY(${itemIds})`;
      items = (rows as any[]).map(r => ({
        name: String(r.name),
        qty: Math.round(Number(r.qty) || 0),
        paired: !!r.pos_product_id,
      }));
    } catch { items = []; }
  }

  return NextResponse.json({ revenue: Math.round(revenue), bills, from: start, till: end, date, items });
}
