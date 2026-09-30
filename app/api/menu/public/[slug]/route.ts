// Veřejné čtení menu — bez přihlášení. Tohle si tahá stránka /menu-akce.html
// na iPadu i mobil hosta, který naskenoval QR.
//
// Ven jde jen to, co má host vidět: názvy, ceny, popisky a stav vyprodáno.
// Žádné PINy, id týmu ani nic z provozu podniku.

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { buildBoard, publicShape, cleanSlug } from '@/lib/menu';
import { podnikJePozastaveny } from '@/lib/blokaceDb';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const slug = cleanSlug(params.slug);
  if (!slug) return NextResponse.json({ error: 'Neplatná adresa menu' }, { status: 400 });
  // Jazyk hosta (?lang=en). Neznámý nebo nenabízený jazyk není chyba: lístek
  // se ukáže ve svém výchozím jazyce (publicShape). Jazyk je součástí adresy,
  // takže service worker i cache mají pro každý jazyk vlastní záznam.
  const lang = new URL(request.url).searchParams.get('lang');

  try {
    // Když je stejný slug u víc týmů, rozhoduje ten nejstarší — slug je
    // veřejná adresa, takže se nesmí přehazovat podle náhody v řazení.
    // Sloupce se vypisují schválně. `SELECT *` sem tahá i to, co host
    // nemá co vidět (PIN), a navíc cokoliv, co v tabulce zbylo z dřívějška —
    // veřejné čtení pak závisí na sloupcích, o kterých ani neví.
    // Sloupce jazyků (kolo 76) se čtou zvlášť a defenzivně: před /api/init
    // nejsou a lístek se musí ukázat jako dřív, jen česky.
    let board: any;
    try {
      [board] = await sql`
        SELECT id, slug, name, eyebrow, title, note,
               wifi_ssid, wifi_password, currency, enabled, theme, updated_at, team_id, langs, i18n
        FROM menu_boards
        WHERE slug = ${slug} AND enabled IS NOT FALSE
        ORDER BY id LIMIT 1`;
    } catch {
      [board] = await sql`
        SELECT id, slug, name, eyebrow, title, note,
               wifi_ssid, wifi_password, currency, enabled, theme, updated_at, team_id
        FROM menu_boards
        WHERE slug = ${slug} AND enabled IS NOT FALSE
        ORDER BY id LIMIT 1`;
    }
    // Pozastavený podnik nemá ani veřejné menu — host vidí totéž, co když
    // menu neexistuje. `team_id` se ven neposílá (níž se vypisují sloupce).
    if (board && (await podnikJePozastaveny(board.team_id))) {
      return NextResponse.json({ error: 'Menu tu není.' }, { status: 404 });
    }
    if (!board) {
      // Samotné „nenalezeno" je pro hledání chyby k ničemu — nepozná se z něj
      // vypnuté menu od překlepu v adrese ani od prázdné databáze. Doptáváme
      // se jen tady, takže to normální provoz nestojí nic.
      let duvod = 'nenalezeno';
      try {
        // Stejná podmínka, jen užší SELECT. QR routa (`SELECT id`) tuhle
        // desku najde, zatímco `SELECT *` výš ne — což nedává smysl, takže
        // se ptáme obojím a rozdíl bude v logu černé na bílém.
        const uzce = await sql`
          SELECT id FROM menu_boards
          WHERE slug = ${slug} AND enabled IS NOT FALSE ORDER BY id LIMIT 1` as any[];
        const [vypnute] = await sql`SELECT id FROM menu_boards WHERE slug = ${slug} LIMIT 1`;
        const vsechny = await sql`SELECT id, slug, enabled FROM menu_boards ORDER BY id LIMIT 20` as any[];

        duvod = uzce.length ? 'jen-hvezdicka'
              : vypnute ? 'vypnuto'
              : vsechny.length ? 'jina-adresa'
              : 'zadne-menu';
        console.error(
          `[menu] veřejné čtení „${slug}" nic nenašlo (${duvod}); ` +
          `SELECT id našel: ${uzce.length}; ` +
          `menu v databázi: ${vsechny.length
            ? vsechny.map((r) => `${r.id}:${r.slug}${r.enabled === false ? ' (vypnuté)' : ''}`).join(', ')
            : 'žádné'}`);
      } catch (e: any) {
        console.error('[menu] doptání po důvodu selhalo:', e?.message ?? e);
      }
      return NextResponse.json({
        error: duvod === 'vypnuto' ? 'Menu je vypnuté' : 'Menu nenalezeno',
        duvod,
      }, { status: 404 });
    }

    let sections: any[];
    let items: any[];
    try {
      sections = await sql`
        SELECT id, title, column_no, position, i18n
        FROM menu_sections WHERE board_id = ${board.id} ORDER BY position, id` as any[];
      items = sections.length
        ? await sql`
            SELECT id, section_id, name, price, description, sold_out, pos_product_id, position, allergens, tags, i18n
            FROM menu_items
            WHERE section_id IN (SELECT id FROM menu_sections WHERE board_id = ${board.id})
            ORDER BY position, id` as any[]
        : [];
    } catch {
      sections = await sql`
        SELECT id, title, column_no, position
        FROM menu_sections WHERE board_id = ${board.id} ORDER BY position, id` as any[];
      items = sections.length
        ? await sql`
            SELECT id, section_id, name, price, description, sold_out, pos_product_id, position
            FROM menu_items
            WHERE section_id IN (SELECT id FROM menu_sections WHERE board_id = ${board.id})
            ORDER BY position, id` as any[]
        : [];
    }

    // Ceny se píšou podle locale podniku (všichni hosté vidí tutéž částku stejně);
    // bez sloupce nebo bez podniku se vezme locale jazyka lístku.
    let locale: string | undefined;
    let currency: string | undefined;
    try {
      const [t] = await sql`SELECT locale, currency FROM teams WHERE id = ${board.team_id}`;
      if (t?.locale) locale = String(t.locale);
      if (t?.currency) currency = String(t.currency);
    } catch { /* sloupec ještě není */ }

    const data = publicShape(buildBoard(board, sections, items), lang, { locale, currency });
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
