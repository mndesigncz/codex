// Správa zákaznického menu — tohle je strana provozovatele. Veřejné čtení
// pro hosty a iPad běží zvlášť na /api/menu/public/[slug].
//
// Ukládá se celá deska najednou: sekce a položky, které v požadavku nejsou,
// se smažou. Id existujících položek se přitom drží, aby se nerozbilo
// „vyprodáno“ přepnuté od stánku ani nic, co na id odkazuje.
//
// Kolo 67: jedno uložení dělá obsah, ceny i zveřejnění, takže se každá
// část hlídá svým oprávněním — obsah `menu.upravit`, ceny `menu.ceny`,
// zapnutí, adresa a PIN `menu.zverejnit` (PIN pouští k „vyprodáno" od stánku
// bez přihlášení). Chybí-li oprávnění k jediné části, neuloží se nic:
// půlka změny by vypadala jako úspěch.

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import {
  buildBoard, cleanText, cleanPrice, cleanSlug, cleanColumn, cleanPin,
  MAX_NAME, MAX_DESC, SEED_BOARD, DEFAULT_CURRENCY,
} from '@/lib/menu';
import { normalizeMenuTheme, zeSdilenehoVzhledu, VYCHOZI_THEME } from '@/lib/menuTheme';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

/**
 * Zasahuje uložení do cen? Existující položka se změněnou cenou, nebo nová
 * položka s nenulovou cenou. Položka přesunutá do jiné sekce se ukládá jako
 * nová, proto se ceny porovnávají podle id napříč celou deskou.
 */
async function meniCeny(boardId: number, sections: unknown): Promise<boolean> {
  if (!Array.isArray(sections)) return false;
  const stare = await sql`
    SELECT i.id, i.price FROM menu_items i
    JOIN menu_sections s ON s.id = i.section_id
    WHERE s.board_id = ${boardId}` as any[];
  const cenaPodleId = new Map(stare.map((r: any) => [Number(r.id), Number(r.price) || 0]));
  for (const s of sections.slice(0, 40)) {
    for (const it of (Array.isArray((s as any)?.items) ? (s as any).items : []).slice(0, 100)) {
      if (!cleanText(it?.name, MAX_NAME)) continue;
      const cena = cleanPrice(it?.price);
      const puvodni = cenaPodleId.get(Number(it?.id));
      if (puvodni === undefined ? cena > 0 : puvodni !== cena) return true;
    }
  }
  return false;
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

export async function GET(request: Request) {
  // Kolo 69 (widget Vyprodáno): `?jen=vyprodano` pustí i roli, která smí
  // jen přepínat vyprodáno (Barista, tablet), a vrátí jen to, co k tomu
  // potřebuje — zapnutá menu, jejich sekce a položky s id, názvem a
  // příznakem. Ceny, Wi-Fi, PIN ani vzhled v odpovědi nejsou: ty patří
  // pod menu.zobrazit. Bez tohohle by widget u baru neměl odkud číst.
  const jenVyprodano = new URL(request.url).searchParams.get('jen') === 'vyprodano';
  const c = await pozaduj(jenVyprodano ? ['menu.zobrazit', 'menu.vyprodano'] : 'menu.zobrazit');
  if (jeOdpoved(c)) return c;
  const me = { meId: c.meId, teamId: c.teamId };

  if (jenVyprodano) {
    try {
      const rows = await sql`
        SELECT id, slug, name FROM menu_boards
        WHERE team_id = ${me.teamId} AND enabled IS NOT FALSE ORDER BY id` as any[];
      const boards = [];
      for (const r of rows) {
        const b = await loadBoard(r);
        boards.push({
          id: b.id, slug: b.slug, name: b.name, enabled: true,
          sections: b.sections.map(s => ({ title: s.title, items: s.items.map(i => ({ id: i.id, name: i.name, soldOut: i.soldOut })) })),
        });
      }
      return NextResponse.json({ boards });
    } catch {
      return NextResponse.json({ boards: [], notMigrated: true });
    }
  }

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
  const c = await pozaduj('menu.upravit');
  if (jeOdpoved(c)) return c;
  const me = { meId: c.meId, teamId: c.teamId };

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
      // Přípona se musí vejít do 40 znaků, které adresa smí mít — jinak by
      // ji veřejná stránka ořezala zpátky na adresu cizího menu.
      const zaklad = cleanSlug(body?.slug ?? name) || 'menu';
      slug = `${zaklad.slice(0, 40 - String(i).length - 1).replace(/-+$/, '')}-${i}`;
    }

    const seed = body?.seed !== false;

    // Vzhled se uloží rovnou, ať je od začátku vidět a dá se upravit.
    //   • zakládání z dnešní nabídky → vzhled zapečený ve stránce, aby
    //     menu vypadalo přesně jako předtím
    //   • prázdné nové menu → odvozeno z Vzhledu sdílených stránek, ať
    //     podnik nezačíná v cizích barvách
    let vzhled = JSON.stringify(VYCHOZI_THEME);
    if (!seed) {
      try {
        const [t] = await sql`SELECT share_theme FROM teams WHERE id = ${me.teamId}`;
        if (t?.share_theme) vzhled = JSON.stringify(zeSdilenehoVzhledu(t.share_theme));
      } catch { /* sloupec nemusí být zmigrovaný */ }
    }

    const [board] = await sql`
      INSERT INTO menu_boards (team_id, slug, name, eyebrow, title, note, wifi_ssid, wifi_password, currency, created_by, theme)
      VALUES (${me.teamId}, ${slug}, ${name},
              ${seed ? SEED_BOARD.eyebrow : null}, ${seed ? SEED_BOARD.title : null},
              ${seed ? SEED_BOARD.note : null},
              ${seed ? SEED_BOARD.wifiSsid : null}, ${seed ? SEED_BOARD.wifiPassword : null},
              ${DEFAULT_CURRENCY}, ${me.meId}, ${vzhled}::jsonb)
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
      { error: 'Menu se nepodařilo založit. Zkus to znovu; když to nepůjde, napiš podpoře.' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------

export async function PUT(request: Request) {
  const c = await pozaduj('menu.upravit');
  if (jeOdpoved(c)) return c;
  const me = { meId: c.meId, teamId: c.teamId };

  let body: any;
  try { body = await request.json(); } catch { body = {}; }

  const id = Number(body?.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Chybí menu' }, { status: 400 });

  const [board] = await sql`
    SELECT * FROM menu_boards WHERE id = ${id} AND team_id = ${me.teamId}`;
  if (!board) return NextResponse.json({ error: 'Menu nenalezeno' }, { status: 404 });

  // ---- částečná změna: jen zapnutí nebo PIN (kolo 69) ----
  // Widget Stav menu („Zveřejnit") a zrušení PINu posílají jen to, co mění.
  // Plné uložení níž přepisuje celou hlavičku desky a chybějící pole bere
  // jako prázdná — `{ id, pin: '' }` tak dřív kromě PINu smazalo i nadpis,
  // Wi-Fi a poznámku a menu mimochodem zapnulo.
  if (body?.castecne === true) {
    if (!c.role.opravneni.has('menu.zverejnit')) {
      return NextResponse.json({ error: 'Zveřejnění menu a PIN mění jen ten, kdo smí menu zveřejnit.' }, { status: 403 });
    }
    if (typeof body.enabled === 'boolean') {
      await sql`UPDATE menu_boards SET enabled = ${body.enabled}, updated_at = NOW() WHERE id = ${id}`;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'pin')) {
      if (body.pin === null || String(body.pin).trim() === '') {
        await sql`UPDATE menu_boards SET pin_hash = NULL, updated_at = NOW() WHERE id = ${id}`;
      } else {
        const pin = cleanPin(body.pin);
        if (!pin) return NextResponse.json({ error: 'PIN musí být 4 až 8 číslic' }, { status: 400 });
        await sql`UPDATE menu_boards SET pin_hash = ${await bcrypt.hash(pin, 10)}, updated_at = NOW() WHERE id = ${id}`;
      }
    }
    const [fresh] = await sql`SELECT * FROM menu_boards WHERE id = ${id}`;
    return NextResponse.json({ board: await loadBoard(fresh) });
  }

  // ---- hlavička desky ----
  const name = cleanText(body?.name, MAX_NAME) || board.name;
  const slug = cleanSlug(body?.slug) || board.slug;

  // ---- oprávnění k jednotlivým částem, dřív než se cokoli zapíše ----
  const zverejneni = slug !== board.slug
    || (body?.enabled !== false) !== (board.enabled !== false)
    || Object.prototype.hasOwnProperty.call(body ?? {}, 'pin');
  if (zverejneni && !c.role.opravneni.has('menu.zverejnit')) {
    return NextResponse.json({ error: 'Zveřejnění menu, jeho adresu a PIN mění jen ten, kdo smí menu zveřejnit.' }, { status: 403 });
  }
  if (!c.role.opravneni.has('menu.ceny') && await meniCeny(id, body?.sections)) {
    return NextResponse.json({ error: 'Na změnu cen v menu nemáš oprávnění.' }, { status: 403 });
  }
  if (slug !== board.slug) {
    const [clash] = await sql`
      SELECT id, team_id, name FROM menu_boards WHERE slug = ${slug} AND id <> ${id}`;
    if (clash) {
      // Adresu drží jiné menu. Když je to menu stejného podniku, dá se
      // převzít — je to pořád jejich adresa a jinak by šlo o slepou uličku:
      // menu by se hostům neukazovalo a nešlo by to spravit. Cizímu podniku
      // se veřejná adresa vzít nesmí, tam zbývá vybrat si jinou.
      const nase = Number(clash.team_id) === me.teamId;
      if (!(nase && body?.prevzitAdresu === true)) {
        return NextResponse.json({
          error: nase
            ? `Adresu „${slug}“ má menu „${clash.name}“.`
            : 'Takovou adresu už má menu jiného podniku, vyber prosím jinou.',
          adresuDrziNase: nase,
          drziNazev: nase ? String(clash.name) : undefined,
        }, { status: 409 });
      }
      // Původnímu menu se adresa nezruší, jen odsune — ať se dá vrátit.
      // Id je jedinečné, ale odsunutá adresa může být shodou okolností taky
      // zabraná; unikátní index na slug by pak celé uložení shodil.
      let odsun = cleanSlug(`${slug}-${clash.id}`);
      for (let i = 2; i < 50; i++) {
        const [obsazeno] = await sql`SELECT id FROM menu_boards WHERE slug = ${odsun}`;
        if (!obsazeno) break;
        odsun = cleanSlug(`${slug}-${clash.id}-${i}`);
      }
      await sql`
        UPDATE menu_boards SET slug = ${odsun}, updated_at = NOW() WHERE id = ${clash.id}`;
    }
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

  // ---- vzhled ----
  if (body?.theme && typeof body.theme === 'object') {
    await sql`
      UPDATE menu_boards SET theme = ${JSON.stringify(normalizeMenuTheme(body.theme))}::jsonb
      WHERE id = ${id}`;
  }

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
  const c = await pozaduj('menu.mazat');
  if (jeOdpoved(c)) return c;
  const me = { meId: c.meId, teamId: c.teamId };

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
