// Import menu z pokladny a párování položek na produkty ve Storyous.
//
// Bez vazby na produkt je položka pro pokladnu jen text: objednávka od stolu
// se do Storyous nepošle a na terminálu se nevytiskne. Tenhle koncový bod
// umí tři věci, dohromady pokrývají cestu od prázdného menu k hotovému:
//
//   new   — založí menu z katalogu kasy, sekce podle kategorií ve Storyous,
//   fill  — do stávajícího menu doplní produkty, které v něm ještě nejsou,
//           beze změny toho, jak si podnik sekce přeskládal,
//   match — už napsané položky spáruje s produkty podle názvu.
//
// Uspořádání sekcí je čistě naše: podnik si položky může přesunout kamkoli,
// vazba na produkt drží u položky, ne u sekce.
//
// Kolo 67: `menu.upravit`. Ceny sem přicházejí z kasy, ne od člověka, proto
// import nepotřebuje `menu.ceny` — kasa je u cen ta hlavní pravda.

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { getConnection } from '@/lib/storyous';
import { syncMenu } from '@/lib/posMirror';
import { buildBoard, cleanPrice, DEFAULT_CURRENCY } from '@/lib/menu';
import { VYCHOZI_THEME, zeSdilenehoVzhledu } from '@/lib/menuTheme';
import { matchByName, sectionTitles, type PosCatalogItem } from '@/lib/menuPos';
import { audit } from '@/lib/audit';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const sql = neon(process.env.DATABASE_URL!);

/** Stejné stropy jako při ukládání menu, ať se import nevejde tam, kde uložení ne. */
const MAX_SECTIONS = 40;
const MAX_ITEMS = 100;

async function loadBoard(row: any) {
  const sections = await sql`SELECT * FROM menu_sections WHERE board_id = ${row.id} ORDER BY position, id`;
  const items = sections.length
    ? await sql`SELECT * FROM menu_items WHERE section_id IN (SELECT id FROM menu_sections WHERE board_id = ${row.id}) ORDER BY position, id`
    : [];
  return buildBoard(row, sections as any[], items as any[]);
}

/** Katalog kasy ze zrcadla. Prodejné a viditelné produkty, seřazené jako v kase. */
async function catalog(teamId: number): Promise<PosCatalogItem[]> {
  const rows = await sql`
    SELECT product_id, name, category, price FROM pos_products
    WHERE team_id = ${teamId} AND active = TRUE AND show_in_pos IS NOT FALSE
    ORDER BY category NULLS LAST, name` as any[];
  return rows.map(r => ({
    productId: String(r.product_id), name: String(r.name ?? '').trim(),
    category: r.category ? String(r.category) : null,
    price: r.price != null && Number.isFinite(Number(r.price)) ? Number(r.price) : null,
  })).filter(p => p.name);
}

export async function POST(request: Request) {
  const c = await pozaduj('menu.upravit');
  if (jeOdpoved(c)) return c;
  const me = { meId: c.meId, teamId: c.teamId };

  const body = await request.json().catch(() => ({}));
  const mode = ['new', 'fill', 'match'].includes(String(body?.mode)) ? String(body.mode) : '';
  if (!mode) return NextResponse.json({ error: 'Neznámý režim importu' }, { status: 400 });

  const conn = await getConnection(me.teamId);
  if (!conn) return NextResponse.json({ error: 'Pokladna Storyous není připojená. Připoj ji v Nastavení.' }, { status: 400 });

  // Zrcadlo katalogu: napoprvé prázdné, a po změnách v kase zastaralé.
  // Import je ta chvíle, kdy se vyplatí počkat na čerstvá data.
  try { await syncMenu(me.teamId, conn, body?.refresh === true); }
  catch { /* zrcadlo z minula je pořád lepší než nic */ }

  const products = await catalog(me.teamId);
  if (!products.length) {
    return NextResponse.json({ error: 'Katalog kasy je prázdný. Zkontroluj, že má připojené místo vyplněné menu.' }, { status: 400 });
  }

  // ---- match: nic se nepřidává, jen se dopárují už napsané položky --------
  if (mode === 'match') {
    const boardId = Number(body?.boardId);
    const [board] = await sql`SELECT * FROM menu_boards WHERE id = ${boardId} AND team_id = ${me.teamId}`;
    if (!board) return NextResponse.json({ error: 'Menu nenalezeno' }, { status: 404 });
    const open = await sql`
      SELECT i.id, i.name FROM menu_items i JOIN menu_sections s ON s.id = i.section_id
      WHERE s.board_id = ${board.id} AND (i.pos_product_id IS NULL OR i.pos_product_id = '')` as any[];
    const { matched, ambiguous } = matchByName(open.map(r => ({ id: Number(r.id), name: String(r.name) })), products);
    for (const m of matched) {
      await sql`UPDATE menu_items SET pos_product_id = ${m.productId} WHERE id = ${m.id}`;
    }
    if (matched.length) audit(me.teamId, me.meId, 'menu.pos.match', 'menu', board.id, `spárováno ${matched.length} položek`);
    return NextResponse.json({
      board: await loadBoard((await sql`SELECT * FROM menu_boards WHERE id = ${board.id}`)[0]),
      summary: { matched: matched.length, ambiguous, left: open.length - matched.length },
    });
  }

  // ---- new / fill: produkty do sekcí podle kategorií v kase --------------
  const titles = sectionTitles(products.map(p => p.category ?? ''));
  const groups = new Map<string, PosCatalogItem[]>();
  for (const p of products) {
    const key = titles.get(String(p.category ?? '').trim()) ?? 'Ostatní';
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(p);
  }

  let boardRow: any;
  let taken = new Set<string>();
  if (mode === 'new') {
    const [team] = await sql`SELECT name, share_theme FROM teams WHERE id = ${me.teamId}`;
    const base = String(body?.slug ?? 'menu').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'menu';
    let slug = base;
    for (let n = 2; n < 50; n++) {
      const [clash] = await sql`SELECT id FROM menu_boards WHERE slug = ${slug}`;
      if (!clash) break;
      slug = `${base}-${n}`;
    }
    let theme = VYCHOZI_THEME;
    try { if (team?.share_theme) theme = zeSdilenehoVzhledu(team.share_theme); } catch { /* nezmigrovaný sloupec */ }
    const [created] = await sql`
      INSERT INTO menu_boards (team_id, slug, name, title, currency, created_by, theme, enabled)
      VALUES (${me.teamId}, ${slug}, ${String(body?.name ?? 'Nabídka z pokladny').slice(0, 80)},
              ${String(team?.name ?? 'Nabídka')}, ${DEFAULT_CURRENCY}, ${me.meId},
              ${JSON.stringify(theme)}::jsonb, TRUE)
      RETURNING *`;
    boardRow = created;
  } else {
    const boardId = Number(body?.boardId);
    const [found] = await sql`SELECT * FROM menu_boards WHERE id = ${boardId} AND team_id = ${me.teamId}`;
    if (!found) return NextResponse.json({ error: 'Menu nenalezeno' }, { status: 404 });
    boardRow = found;
    const have = await sql`
      SELECT i.pos_product_id FROM menu_items i JOIN menu_sections s ON s.id = i.section_id
      WHERE s.board_id = ${found.id} AND i.pos_product_id IS NOT NULL AND i.pos_product_id <> ''` as any[];
    taken = new Set(have.map(r => String(r.pos_product_id)));
  }

  // Do stávajícího menu se doplňuje pod sekce, které tam už jsou; nová sekce
  // vznikne, až když pro produkt žádná není.
  const existing = await sql`SELECT id, title, position FROM menu_sections WHERE board_id = ${boardRow.id} ORDER BY position, id` as any[];
  const sectionByTitle = new Map<string, number>(existing.map(r => [String(r.title).trim().toLowerCase(), Number(r.id)]));
  let nextPos = existing.length;

  let added = 0, newSections = 0, skippedFull = 0;
  for (const [title, list] of Array.from(groups.entries())) {
    const fresh = list.filter(p => !taken.has(p.productId));
    if (!fresh.length) continue;

    let sectionId = sectionByTitle.get(title.trim().toLowerCase()) ?? null;
    if (sectionId == null) {
      if (nextPos >= MAX_SECTIONS) { skippedFull += fresh.length; continue; }
      const [s] = await sql`
        INSERT INTO menu_sections (board_id, title, column_no, position)
        VALUES (${boardRow.id}, ${title.slice(0, 80)}, ${nextPos % 2 === 0 ? 1 : 2}, ${nextPos}) RETURNING id`;
      sectionId = Number(s.id); sectionByTitle.set(title.trim().toLowerCase(), sectionId);
      nextPos++; newSections++;
    }

    const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM menu_items WHERE section_id = ${sectionId}` as any[];
    let pos = Number(n);
    for (const p of fresh) {
      if (pos >= MAX_ITEMS) { skippedFull++; continue; }
      await sql`
        INSERT INTO menu_items (section_id, name, price, description, sold_out, pos_product_id, position)
        VALUES (${sectionId}, ${p.name.slice(0, 80)}, ${cleanPrice(p.price ?? 0)}, ${null}, ${false}, ${p.productId}, ${pos})`;
      pos++; added++;
    }
  }

  audit(me.teamId, me.meId, 'menu.pos.import', 'menu', boardRow.id, `${mode}: ${added} položek, ${newSections} sekcí`);
  const [fresh] = await sql`SELECT * FROM menu_boards WHERE id = ${boardRow.id}`;
  return NextResponse.json({
    board: await loadBoard(fresh),
    summary: { added, newSections, skippedFull, catalog: products.length },
  });
}
