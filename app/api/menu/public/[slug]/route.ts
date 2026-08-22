// Veřejné čtení menu — bez přihlášení. Tohle si tahá stránka /menu-akce.html
// na iPadu i mobil hosta, který naskenoval QR.
//
// Ven jde jen to, co má host vidět: názvy, ceny, popisky a stav vyprodáno.
// Žádné PINy, id týmu ani nic z provozu podniku.

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { buildBoard, publicShape, cleanSlug } from '@/lib/menu';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(_request: Request, { params }: { params: { slug: string } }) {
  const slug = cleanSlug(params.slug);
  if (!slug) return NextResponse.json({ error: 'Neplatná adresa menu' }, { status: 400 });

  try {
    // Když je stejný slug u víc týmů, rozhoduje ten nejstarší — slug je
    // veřejná adresa, takže se nesmí přehazovat podle náhody v řazení.
    const [board] = await sql`
      SELECT * FROM menu_boards
      WHERE slug = ${slug} AND enabled IS NOT FALSE
      ORDER BY id LIMIT 1`;
    if (!board) {
      // Samotné „nenalezeno" je pro hledání chyby k ničemu — nepozná se z něj
      // vypnuté menu od překlepu v adrese ani od prázdné databáze. Doptáváme
      // se jen tady, takže to normální provoz nestojí nic.
      let duvod = 'nenalezeno';
      try {
        const [vypnute] = await sql`SELECT id FROM menu_boards WHERE slug = ${slug} LIMIT 1`;
        const vsechny = await sql`SELECT slug FROM menu_boards ORDER BY id LIMIT 20` as any[];
        duvod = vypnute ? 'vypnuto' : (vsechny.length ? 'jina-adresa' : 'zadne-menu');
        console.error(
          `[menu] veřejné čtení „${slug}" nic nenašlo (${duvod}); ` +
          `menu v databázi: ${vsechny.length ? vsechny.map((r) => r.slug).join(', ') : 'žádné'}`);
      } catch (e: any) {
        console.error('[menu] doptání po důvodu selhalo:', e?.message ?? e);
      }
      return NextResponse.json({
        error: duvod === 'vypnuto' ? 'Menu je vypnuté' : 'Menu nenalezeno',
        duvod,
      }, { status: 404 });
    }

    const sections = await sql`
      SELECT * FROM menu_sections WHERE board_id = ${board.id} ORDER BY position, id`;
    const items = sections.length
      ? await sql`
          SELECT * FROM menu_items
          WHERE section_id IN (SELECT id FROM menu_sections WHERE board_id = ${board.id})
          ORDER BY position, id`
      : [];

    const data = publicShape(buildBoard(board, sections as any[], items as any[]));
    return NextResponse.json(data, {
      // Ceny a vyprodáno se během akce mění — nikde se to nesmí zaseknout v cache.
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (e) {
    // Tabulky ještě nemusí být po migraci — stránka si v tom případě vystačí
    // s obsahem, který má v sobě, takže tohle není důvod k panice.
    return NextResponse.json({ error: 'Menu zatím není nastavené' }, { status: 404 });
  }
}
