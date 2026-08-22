// Správa zákaznického menu — tohle je strana provozovatele. Veřejné čtení
// pro hosty a iPad běží zvlášť na /api/menu/public/[slug].
//
// Ukládá se celá deska najednou: sekce a položky, které v požadavku nejsou,
// se smažou. Id existujících položek se přitom drží, aby se nerozbilo
// „vyprodáno“ přepnuté od stánku ani nic, co na id odkazuje.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import {
  buildBoard, cleanText, cleanPrice, cleanSlug, cleanColumn, cleanPin,
  MAX_NAME, MAX_DESC, SEED_BOARD, DEFAULT_CURRENCY,
} from '@/lib/menu';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function employer() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const meId = parseInt((session.user as any).id);
  const role = (session.user as any).role as string;
  if (role !== 'employer') return null;
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  return u?.team_id ? { meId, teamId: Number(u.team_id) } : null;
}

async function loadBoard(boardRow: any) {
  const sections = await sql`
    SELECT * FROM menu_sections WHERE board_id = ${boardRow.id} ORDER BY position, id`;
  const items = sections.length
    ? await sql`
        SELECT * FROM menu_items
        WHERE section_id IN (SELECT id FROM menu_sections WHERE board_id = ${boardRow.id})
        ORDER BY position, id`
    : [];
  return buildBoard(boardRow, sections as any[], items as any[]);
}

// ---------------------------------------------------------------------------

export async function GET() {
  const me = await employer();
  if (!me) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  let rows: any[] = [];
  try {
    rows = await sql`SELECT * FROM menu_boards WHERE team_id = ${me.teamId} ORDER BY id` as any[];
  } catch {
    // Migrace ještě neproběhla — ať se administrace umí otevřít a říct to.
    return NextResponse.json({ boards: [], notMigrated: true });
  }

  const boards = [];
  for (const r of rows) boards.push(await loadBoard(r));
  return NextResponse.json({ boards });
}

// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const me = await employer();
  if (!me) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  let body: any;
  try { body = await request.json(); } catch { body = {}; }

  const name = cleanText(body?.name, MAX_NAME) || SEED_BOARD.name;
  let slug = cleanSlug(body?.slug ?? name) || 'menu';

  try {
    // Slug je veřejná adresa, takže se hlídá napříč všemi týmy. Když je
    // zabraný, přidá se pořadové číslo.
    for (let i = 2; i < 50; i++) {
      const [clash] = await sql`SELECT id FROM menu_boards WHERE slug = ${slug}`;
      if (!clash) break;
      slug = `${cleanSlug(body?.slug ?? name) || 'menu'}-${i}`;
    }

    const seed = body?.seed !== false;
    const [board] = await sql`
      INSERT INTO menu_boards (team_id, slug, name, eyebrow, title, note, wifi_ssid, wifi_password, currency, created_by)
      VALUES (${me.teamId}, ${slug}, ${name},
              ${seed ? SEED_BOARD.eyebrow : null}, ${seed ? SEED_BOARD.title : null},
              ${seed ? SEED_BOARD.note : null},
              ${seed ? SEED_BOARD.wifiSsid : null}, ${seed ? SEED_BOARD.wifiPassword : null},
              ${DEFAULT_CURRENCY}, ${me.meId})
      RETURNING *`;

    if (seed) {
      let sp = 0;
      for (const s of SEED_BOARD.sections) {
        const [sec] = await sql`
          INSERT INTO menu_sections (board_id, title, column_no, position)
          VALUES (${board.id}, ${s.title}, ${s.column}, ${sp++}) RETURNING id`;
        let ip = 0;
        for (const it of s.items) {
          await sql`
            INSERT INTO menu_items (section_id, name, price, description, position)
            VALUES (${sec.id}, ${it.name}, ${it.price}, ${(it as any).description ?? null}, ${ip++})`;
        }
      }
    }

    return NextResponse.json({ board: await loadBoard(board) });
  } catch (e: any) {
    // Bez tohohle je skutečná příčina neviditelná i v logech a zbyde jen
    // obecná hláška — což se nám už jednou vymstilo při hledání chyby.
    console.error('[menu] založení menu selhalo:', e?.message ?? e);
    return NextResponse.json(
      { error: `Menu se nepodařilo založit: ${e?.message ?? 'neznámá chyba'}` },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------

export async function PUT(request: Request) {
  const me = await employer();
  if (!me) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  let body: any;
  try { body = await request.json(); } catch { body = {}; }

  const id = Number(body?.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Chybí menu' }, { status: 400 });

  const [board] = await sql`
    SELECT * FROM menu_boards WHERE id = ${id} AND team_id = ${me.teamId}`;
  if (!board) return NextResponse.json({ error: 'Menu nenalezeno' }, { status: 404 });

  // ---- hlavička desky ----
  const name = cleanText(body?.name, MAX_NAME) || board.name;
  const slug = cleanSlug(body?.slug) || board.slug;
  if (slug !== board.slug) {
    const [clash] = await sql`SELECT id FROM menu_boards WHERE slug = ${slug} AND id <> ${id}`;
    if (clash) return NextResponse.json({ error: 'Takovou adresu už jiné menu má' }, { status: 409 });
  }

  await sql`
    UPDATE menu_boards SET
      name = ${name},
      slug = ${slug},
      eyebrow = ${cleanText(body?.eyebrow, MAX_NAME) || null},
      title = ${cleanText(body?.title, MAX_NAME) || null},
      note = ${cleanText(body?.note, MAX_DESC) || null},
      wifi_ssid = ${cleanText(body?.wifiSsid, MAX_NAME) || null},
      wifi_password = ${cleanText(body?.wifiPassword, MAX_NAME) || null},
      currency = ${cleanText(body?.currency, 8) || DEFAULT_CURRENCY},
      enabled = ${body?.enabled !== false},
      updated_at = NOW()
    WHERE id = ${id}`;

  // ---- PIN: řetězec nastaví, prázdno zruší, chybějící klíč nechá být ----
  if (Object.prototype.hasOwnProperty.call(body ?? {}, 'pin')) {
    const raw = body.pin;
    if (raw === null || String(raw).trim() === '') {
      await sql`UPDATE menu_boards SET pin_hash = NULL WHERE id = ${id}`;
    } else {
      const pin = cleanPin(raw);
      if (!pin) return NextResponse.json({ error: 'PIN musí být 4 až 8 číslic' }, { status: 400 });
      await sql`UPDATE menu_boards SET pin_hash = ${await bcrypt.hash(pin, 10)} WHERE id = ${id}`;
    }
  }

  // ---- sekce a položky ----
  if (Array.isArray(body?.sections)) {
    const stareSekce = await sql`SELECT id FROM menu_sections WHERE board_id = ${id}` as any[];
    const zname = new Set(stareSekce.map((r: any) => Number(r.id)));
    const ponechatSekce: number[] = [];

    let sp = 0;
    for (const s of body.sections.slice(0, 40)) {
      const titul = cleanText(s?.title, MAX_NAME);
      if (!titul) continue;
      const sloupec = cleanColumn(s?.column);

      let sectionId = Number(s?.id);
      if (Number.isFinite(sectionId) && zname.has(sectionId)) {
        await sql`
          UPDATE menu_sections SET title = ${titul}, column_no = ${sloupec}, position = ${sp}
          WHERE id = ${sectionId} AND board_id = ${id}`;
      } else {
        const [nova] = await sql`
          INSERT INTO menu_sections (board_id, title, column_no, position)
          VALUES (${id}, ${titul}, ${sloupec}, ${sp}) RETURNING id`;
        sectionId = Number(nova.id);
      }
      sp++;
      ponechatSekce.push(sectionId);

      const stareP = await sql`SELECT id FROM menu_items WHERE section_id = ${sectionId}` as any[];
      const znameP = new Set(stareP.map((r: any) => Number(r.id)));
      const ponechatP: number[] = [];

      let ip = 0;
      for (const it of (Array.isArray(s?.items) ? s.items : []).slice(0, 100)) {
        const nazev = cleanText(it?.name, MAX_NAME);
        if (!nazev) continue;
        const cena = cleanPrice(it?.price);
        const popis = cleanText(it?.description, MAX_DESC) || null;
        const vyprodano = it?.soldOut === true;
        const pos = cleanText(it?.posProductId, 64) || null;

        let itemId = Number(it?.id);
        if (Number.isFinite(itemId) && znameP.has(itemId)) {
          await sql`
            UPDATE menu_items SET name = ${nazev}, price = ${cena}, description = ${popis},
                   sold_out = ${vyprodano}, pos_product_id = ${pos}, position = ${ip}
            WHERE id = ${itemId} AND section_id = ${sectionId}`;
        } else {
          const [nova] = await sql`
            INSERT INTO menu_items (section_id, name, price, description, sold_out, pos_product_id, position)
            VALUES (${sectionId}, ${nazev}, ${cena}, ${popis}, ${vyprodano}, ${pos}, ${ip})
            RETURNING id`;
          itemId = Number(nova.id);
        }
        ip++;
        ponechatP.push(itemId);
      }

      for (const stary of Array.from(znameP)) {
        if (!ponechatP.includes(stary)) await sql`DELETE FROM menu_items WHERE id = ${stary}`;
      }
    }

    for (const stara of Array.from(zname)) {
      if (!ponechatSekce.includes(stara)) {
        await sql`DELETE FROM menu_items WHERE section_id = ${stara}`;
        await sql`DELETE FROM menu_sections WHERE id = ${stara}`;
      }
    }
  }

  const [fresh] = await sql`SELECT * FROM menu_boards WHERE id = ${id}`;
  return NextResponse.json({ board: await loadBoard(fresh) });
}

// ---------------------------------------------------------------------------

export async function DELETE(request: Request) {
  const me = await employer();
  if (!me) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Chybí menu' }, { status: 400 });

  const [board] = await sql`SELECT id FROM menu_boards WHERE id = ${id} AND team_id = ${me.teamId}`;
  if (!board) return NextResponse.json({ error: 'Menu nenalezeno' }, { status: 404 });

  await sql`
    DELETE FROM menu_items
    WHERE section_id IN (SELECT id FROM menu_sections WHERE board_id = ${id})`;
  await sql`DELETE FROM menu_sections WHERE board_id = ${id}`;
  await sql`DELETE FROM menu_boards WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
