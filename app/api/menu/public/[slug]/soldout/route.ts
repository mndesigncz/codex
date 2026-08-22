// Přepnutí „vyprodáno“ přímo od stánku.
//
// Endpoint je veřejně dosažitelný (iPad s menu není přihlášený), takže si
// žádost musí sáhnout pro jedno z dvojího:
//   • přihlášená obsluha toho týmu, kterému menu patří, nebo
//   • PIN toho konkrétního menu.
// Bez toho se nedá změnit nic — host, který si menu otevřel v mobilu, tudy
// nedosáhne. Měnit jde jenom příznak vyprodáno; ceny a názvy sem nepatří.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import { cleanSlug } from '@/lib/menu';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

/** Je přihlášený uživatel členem týmu, kterému tohle menu patří? */
async function jeObsluha(teamId: number): Promise<boolean> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return false;
    const meId = parseInt((session.user as any).id);
    if (!Number.isFinite(meId)) return false;
    const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
    return Number(u?.team_id) === teamId;
  } catch {
    return false;
  }
}

export async function POST(request: Request, { params }: { params: { slug: string } }) {
  const slug = cleanSlug(params.slug);
  if (!slug) return NextResponse.json({ error: 'Neplatná adresa menu' }, { status: 400 });

  let body: any;
  try { body = await request.json(); } catch { body = {}; }

  const itemId = Number(body?.itemId);
  if (!Number.isFinite(itemId) || itemId <= 0) {
    return NextResponse.json({ error: 'Chybí položka' }, { status: 400 });
  }
  const soldOut = body?.soldOut === true;

  let board: any;
  try {
    const [row] = await sql`
      SELECT id, team_id, pin_hash FROM menu_boards
      WHERE slug = ${slug} AND enabled IS NOT FALSE
      ORDER BY id LIMIT 1`;
    board = row;
  } catch {
    return NextResponse.json({ error: 'Menu zatím není nastavené' }, { status: 404 });
  }
  if (!board) return NextResponse.json({ error: 'Menu nenalezeno' }, { status: 404 });

  // Položka musí patřit tomuhle menu, jinak by se přes cizí PIN dalo sahat jinam.
  const [item] = await sql`
    SELECT i.id FROM menu_items i
    JOIN menu_sections s ON s.id = i.section_id
    WHERE i.id = ${itemId} AND s.board_id = ${board.id}`;
  if (!item) return NextResponse.json({ error: 'Položka do tohoto menu nepatří' }, { status: 404 });

  let smi = await jeObsluha(Number(board.team_id));
  if (!smi) {
    const pin = String(body?.pin ?? '');
    // Bez nastaveného PINu se přes PIN dovnitř nedostane nikdo.
    if (!board.pin_hash || !pin) {
      return NextResponse.json({ error: 'Zadej PIN menu' }, { status: 401 });
    }
    try { smi = await bcrypt.compare(pin, String(board.pin_hash)); } catch { smi = false; }
    if (!smi) return NextResponse.json({ error: 'Nesprávný PIN' }, { status: 401 });
  }

  await sql`UPDATE menu_items SET sold_out = ${soldOut} WHERE id = ${itemId}`;
  await sql`UPDATE menu_boards SET updated_at = NOW() WHERE id = ${board.id}`;

  return NextResponse.json({ ok: true, itemId, soldOut });
}
