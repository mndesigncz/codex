import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved, roleClena, type Kontext } from '@/lib/opravneniDb';
import { typNaUcet } from '@/lib/opravneni';
import { resolveActingUser } from '@/lib/kioskActing';
import { clenovePodniku } from '@/lib/tenant';
import { notifyUser } from '@/lib/push';
import {
  jeTypPoznamky, klicEntity, normalizujTextPoznamky, smiSmazatPoznamku, smiUpravitPoznamku, idsZPoctu, najdiZminky, odkazNaPoznamku, kategorieOznameni,
  MAX_DELKA_POZNAMKY, type TypPoznamky, type Poznamka,
} from '@/lib/poznamky';

// Poznámky k věcem v aplikaci (tabulka entity_notes, typy v lib/poznamky.ts).
//
// Kdo entitu vidí, smí k ní psát; smazat smí autor a správce oblasti
// (OPRAVNENI_SPRAVY_POZNAMEK). Vlastní tým vždy: každý dotaz nese team_id a
// entita se před zápisem ověří v její tabulce — poznámka k cizímu úkolu by
// jinak šla založit jen podle uhodnutého čísla.
//
// Tablet (kiosk) píše za vybraného člověka jako u úkolů a návodů
// (resolveActingUser: tělo/parametr actingAs, nebo cookie). Bez vybraného
// člověka tablet nepíše — poznámka podepsaná „tablet" by nikomu nic neřekla.

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

const chyba = (text: string, status: number) => NextResponse.json({ error: text }, { status });

interface Volajici { c: Kontext; actingId: number; tablet: boolean }

/** Kontext člena + za koho jedná (tablet). */
async function volajici(req: NextRequest, actingAs: unknown): Promise<Volajici | NextResponse> {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  const ucet = typNaUcet(c.role.typ);
  const actingId = await resolveActingUser(c.meId, ucet, c.teamId, actingAs, req);
  return { c, actingId, tablet: ucet === 'kiosk' };
}

/**
 * Entita patří podniku a volající ji vidí? Jeden dotaz do její tabulky.
 * Vrací null, když neexistuje nebo není vidět — ven jde vždy 404, aby se
 * podle rozdílu 403/404 nedalo zjistit, co v cizím podniku existuje.
 */
async function entitaViditelna(typ: TypPoznamky, klic: string, v: Volajici): Promise<boolean> {
  const { c, actingId } = v;
  const opr = c.role.opravneni;
  const teamId = c.teamId;
  switch (typ) {
    case 'task': {
      const id = Number(klic);
      const [t] = await sql`SELECT assigned_to, created_by FROM tasks WHERE id = ${id} AND team_id = ${teamId}`;
      if (!t) return false;
      // Stejné pravidlo jako GET /api/tasks: tým vidí kdo má ukoly.zobrazit_tym,
      // ostatní svoje a úkoly pro kohokoli (a co sami zadali).
      return opr.has('ukoly.zobrazit_tym') || t.assigned_to == null
        || Number(t.assigned_to) === actingId || Number(t.assigned_to) === c.meId || Number(t.created_by) === actingId;
    }
    case 'guide': {
      if (!opr.has('navody.zobrazit')) return false;
      const [g] = await sql`SELECT id FROM guides WHERE id = ${Number(klic)} AND team_id = ${teamId}`;
      return !!g;
    }
    case 'procedure': {
      if (!opr.has('postupy.zobrazit')) return false;
      const [p] = await sql`SELECT id FROM procedures WHERE id = ${Number(klic)} AND team_id = ${teamId}`;
      return !!p;
    }
    case 'recipe': {
      if (!opr.has('receptury.zobrazit')) return false;
      // Receptura = produkt kasy: buď už má řádky receptury, nebo je v zrcadle katalogu.
      const [r] = await sql`
        SELECT 1 AS ok FROM pos_product_map WHERE team_id = ${teamId} AND product_id = ${klic}
        UNION ALL
        SELECT 1 AS ok FROM pos_products WHERE team_id = ${teamId} AND product_id = ${klic}
        LIMIT 1`;
      return !!r;
    }
    case 'inventory_item': {
      if (!opr.has('sklad.zobrazit')) return false;
      const [i] = await sql`SELECT id FROM inventory_items WHERE id = ${Number(klic)} AND team_id = ${teamId}`;
      return !!i;
    }
    case 'shift': {
      const [s] = await sql`SELECT employee_id FROM shifts WHERE id = ${Number(klic)} AND team_id = ${teamId}`;
      if (!s) return false;
      return opr.has('rozvrh.nahled') || Number(s.employee_id) === actingId || Number(s.employee_id) === c.meId;
    }
    case 'suggestion': {
      // Podnět z mého podniku; nástěnku Nápadů vidí kdo smí přidávat nebo spravovat (kolo 7).
      if (!vidiNapady(opr)) return false;
      const [s] = await sql`SELECT id FROM suggestions WHERE id = ${Number(klic)} AND team_id = ${teamId}`;
      return !!s;
    }
    case 'closing': {
      // Jako GET /api/closings/[id]: všechny s uzaverky.zobrazit_vse, jinak vlastní (autor nebo osádka směny).
      const [u] = await sql`SELECT created_by, shift_employees FROM cash_closings WHERE id = ${Number(klic)} AND team_id = ${teamId}`;
      if (!u) return false;
      if (opr.has('uzaverky.zobrazit_vse')) return true;
      const osadka = Array.isArray(u.shift_employees) ? u.shift_employees.map(Number) : [];
      return [Number(u.created_by), ...osadka].some(id => id === actingId || id === c.meId);
    }
    case 'event': {
      if (!opr.has('akce.zobrazit')) return false;
      const [e] = await sql`SELECT id FROM events WHERE id = ${Number(klic)} AND team_id = ${teamId}`;
      return !!e;
    }
    case 'menu_item': {
      if (!opr.has('menu.zobrazit') && !opr.has('menu.upravit')) return false;
      const [m] = await sql`
        SELECT mi.id FROM menu_items mi
        JOIN menu_sections ms ON ms.id = mi.section_id
        JOIN menu_boards mb ON mb.id = ms.board_id
        WHERE mi.id = ${Number(klic)} AND mb.team_id = ${teamId}`;
      return !!m;
    }
  }
}

const vidiNapady = (opr: ReadonlySet<string>) => opr.has('napady.pridat') || opr.has('napady.spravovat');

/**
 * GET ?typ=suggestion&pocty=1,2,3 — počty poznámek pro seznam podnětů jedním dotazem
 * (tlačítko „Poznámky (n)" u každého řádku; po jednom by to bylo N požadavků).
 * Počítá jen podněty mého podniku; cizí id se v odpovědi prostě neobjeví.
 */
async function pocty(v: Volajici, raw: string | null): Promise<NextResponse> {
  if (!vidiNapady(v.c.role.opravneni)) return chyba('Tohle už neexistuje.', 404);
  const ids = idsZPoctu(raw);
  if (ids.length === 0) return NextResponse.json({ pocty: {} });
  try {
    const rows = await sql`
      SELECT s.id, COUNT(n.id)::int AS n
      FROM suggestions s
      LEFT JOIN entity_notes n ON n.team_id = s.team_id AND n.entity_type = 'suggestion' AND n.entity_id = s.id::text
      WHERE s.team_id = ${v.c.teamId} AND s.id = ANY(${ids})
      GROUP BY s.id`;
    return NextResponse.json({ pocty: Object.fromEntries(rows.map(r => [String(r.id), Number(r.n)])) });
  } catch (e) {
    if (predMigraci(e)) return NextResponse.json({ pocty: {} });
    console.error('notes GET pocty', e);
    return chyba('Poznámky se nenačetly.', 500);
  }
}

/** Typ a klíč z parametrů nebo těla; chybová odpověď, když nesedí. */
function cil(typRaw: unknown, idRaw: unknown): { typ: TypPoznamky; klic: string } | NextResponse {
  if (!jeTypPoznamky(typRaw)) return chyba('Neznámý typ poznámky.', 400);
  const klic = klicEntity(typRaw, idRaw);
  if (!klic) return chyba('Chybí, k čemu poznámka patří.', 400);
  return { typ: typRaw, klic };
}

const tvar = (r: any, v: Volajici): Poznamka => {
  const autorId = Number(r.user_id);
  return {
    id: Number(r.id),
    text: String(r.text),
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : '',
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
    autor: { id: autorId, name: String(r.autor_name ?? ''), avatar: r.autor_avatar ?? null },
    moje: smiUpravitPoznamku(autorId, v.actingId),
    muzuSmazat: smiSmazatPoznamku({ typ: r.entity_type, autorId, meId: v.actingId, opr: v.c.role.opravneni }),
    pripnuta: r.pinned === true,
    zminky: Array.isArray(r.mentions) ? r.mentions.map(Number).filter(Number.isFinite) : [],
  };
};

/** Sloupce mentions/pinned před migrací (42703): stejný dotaz bez nich. */
const bezSloupce = (e: unknown) => (e as { code?: string } | null)?.code === '42703';

async function SELECT_POZNAMKY(teamId: number, typ: string, klic: string) {
  try {
    return await sql`
      SELECT n.id, n.entity_type, n.user_id, n.text, n.created_at, n.updated_at, n.mentions, n.pinned, u.name AS autor_name, u.avatar AS autor_avatar
      FROM entity_notes n
      LEFT JOIN users u ON u.id = n.user_id
      WHERE n.team_id = ${teamId} AND n.entity_type = ${typ} AND n.entity_id = ${klic}
      ORDER BY n.pinned DESC, n.created_at ASC, n.id ASC`;
  } catch (e) {
    if (!bezSloupce(e)) throw e;
    return await sql`
      SELECT n.id, n.entity_type, n.user_id, n.text, n.created_at, n.updated_at, u.name AS autor_name, u.avatar AS autor_avatar
      FROM entity_notes n
      LEFT JOIN users u ON u.id = n.user_id
      WHERE n.team_id = ${teamId} AND n.entity_type = ${typ} AND n.entity_id = ${klic}
      ORDER BY n.created_at ASC, n.id ASC`;
  }
}

async function JEDNA_POZNAMKA(id: number) {
  try {
    const [row] = await sql`
      SELECT n.id, n.entity_type, n.user_id, n.text, n.created_at, n.updated_at, n.mentions, n.pinned, u.name AS autor_name, u.avatar AS autor_avatar
      FROM entity_notes n LEFT JOIN users u ON u.id = n.user_id WHERE n.id = ${id}`;
    return row;
  } catch (e) {
    if (!bezSloupce(e)) throw e;
    const [row] = await sql`
      SELECT n.id, n.entity_type, n.user_id, n.text, n.created_at, n.updated_at, u.name AS autor_name, u.avatar AS autor_avatar
      FROM entity_notes n LEFT JOIN users u ON u.id = n.user_id WHERE n.id = ${id}`;
    return row;
  }
}

/** Tabulka před migrací (/api/init ještě neběžel): prázdný seznam, ne 500. */
const predMigraci = (e: unknown) => (e as { code?: string } | null)?.code === '42P01';

/** Otevření vlákna = přečteno: bublina v seznamu přestane být tučná. Best-effort (před migrací nic). */
async function oznacPrecteno(teamId: number, userId: number, typ: string, klic: string) {
  try {
    await sql`
      INSERT INTO entity_note_reads (team_id, user_id, entity_type, entity_id, read_at) VALUES (${teamId}, ${userId}, ${typ}, ${klic}, NOW())
      ON CONFLICT (team_id, user_id, entity_type, entity_id) DO UPDATE SET read_at = NOW()`;
  } catch { /* před migrací */ }
}

/** Rozhraní příjemce oznámení (kam odkaz vede): vedení do /employer, ostatní do /employee. */
async function rozhraniPrijemce(userId: number, teamId: number): Promise<'vedeni' | 'zamestnanec'> {
  try { return (await roleClena(userId, teamId))?.typ === 'vedeni' ? 'vedeni' : 'zamestnanec'; } catch { return 'zamestnanec'; }
}

/** Jméno věci do oznámení („… tě zmínil u Latte"). Best-effort; bez něj obecná věta. */
async function nazevEntity(typ: TypPoznamky, klic: string, teamId: number): Promise<string | null> {
  try {
    const id = Number(klic);
    switch (typ) {
      case 'task': return (await sql`SELECT title AS n FROM tasks WHERE id = ${id} AND team_id = ${teamId}`)[0]?.n ?? null;
      case 'guide': return (await sql`SELECT title AS n FROM guides WHERE id = ${id} AND team_id = ${teamId}`)[0]?.n ?? null;
      case 'procedure': return (await sql`SELECT name AS n FROM procedures WHERE id = ${id} AND team_id = ${teamId}`)[0]?.n ?? null;
      case 'recipe': return (await sql`SELECT product_name AS n FROM pos_product_map WHERE team_id = ${teamId} AND product_id = ${klic} LIMIT 1`)[0]?.n
        ?? (await sql`SELECT name AS n FROM pos_products WHERE team_id = ${teamId} AND product_id = ${klic} LIMIT 1`)[0]?.n ?? null;
      case 'inventory_item': return (await sql`SELECT name AS n FROM inventory_items WHERE id = ${id} AND team_id = ${teamId}`)[0]?.n ?? null;
      case 'closing': { const r = (await sql`SELECT COALESCE(shift_date, date) AS n FROM cash_closings WHERE id = ${id} AND team_id = ${teamId}`)[0]; return r ? `uzávěrka ${String(r.n).slice(0, 10)}` : null; }
      case 'event': return (await sql`SELECT title AS n FROM events WHERE id = ${id} AND team_id = ${teamId}`)[0]?.n ?? null;
      case 'menu_item': return (await sql`SELECT name AS n FROM menu_items WHERE id = ${id}`)[0]?.n ?? null;
      case 'suggestion': return (await sql`SELECT title AS n FROM suggestions WHERE id = ${id} AND team_id = ${teamId}`)[0]?.n ?? null;
      case 'shift': return null;
    }
  } catch { return null; }
}

/**
 * Oznámení po nové poznámce: zmíněným („Martin tě zmínil u Latte: …") a u uzávěrky jejímu autorovi
 * (vedení se zeptá „proč manko 200?", barista to dostane do telefonu). Nikdy autorovi poznámky.
 */
async function oznamPoznamku(v: Volajici, typ: TypPoznamky, klic: string, text: string, zminky: number[]) {
  const teamId = v.c.teamId;
  const prijemci = new Map<number, 'zminka' | 'autor_uzaverky'>();
  for (const id of zminky) if (id !== v.actingId) prijemci.set(id, 'zminka');
  if (typ === 'closing') {
    try {
      const [u] = await sql`SELECT created_by FROM cash_closings WHERE id = ${Number(klic)} AND team_id = ${teamId}`;
      const autor = Number(u?.created_by);
      if (Number.isFinite(autor) && autor !== v.actingId && !prijemci.has(autor)) prijemci.set(autor, 'autor_uzaverky');
    } catch { /* bez autora */ }
  }
  if (!prijemci.size) return;
  const [kdo] = await sql`SELECT name FROM users WHERE id = ${v.actingId}`;
  const jmeno = kdo?.name ?? 'Kolega';
  const vec = await nazevEntity(typ, klic, teamId);
  const ukazka = text.replace(/\s+/g, ' ').slice(0, 120) + (text.length > 120 ? '…' : '');
  await Promise.allSettled([...prijemci].map(async ([id, duvod]) => {
    const rozhrani = await rozhraniPrijemce(id, teamId);
    await notifyUser(id, {
      title: duvod === 'zminka' ? (vec ? `${jmeno} tě zmínil u ${vec}` : `${jmeno} tě zmínil v poznámce`) : 'Poznámka k tvé uzávěrce',
      body: `${duvod === 'zminka' ? '' : `${jmeno}: `}${ukazka}`,
      type: 'info', category: kategorieOznameni(typ), link: odkazNaPoznamku(typ, klic, rozhrani),
    });
  }));
}

// GET ?typ=&id=[&actingAs=] — poznámky k jedné věci, od nejstarší.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const v = await volajici(req, q.get('actingAs'));
  if (jeOdpoved(v)) return v;
  if (q.get('typ') === 'suggestion' && q.has('pocty')) return pocty(v, q.get('pocty'));
  const c = cil(q.get('typ'), q.get('id'));
  if (jeOdpoved(c)) return c;
  try {
    if (!(await entitaViditelna(c.typ, c.klic, v))) return chyba('Tohle už neexistuje.', 404);
    const rows = await SELECT_POZNAMKY(v.c.teamId, c.typ, c.klic);
    // Kdo vlákno otevřel, má ho přečtené (tablet bez vybraného člověka ne — nevíme kdo).
    if (!(v.tablet && v.actingId === v.c.meId)) await oznacPrecteno(v.c.teamId, v.actingId, c.typ, c.klic);
    return NextResponse.json(rows.map(r => tvar(r, v)));
  } catch (e) {
    if (predMigraci(e)) return NextResponse.json([]);
    console.error('notes GET', e);
    return chyba('Poznámky se nenačetly.', 500);
  }
}

// POST { typ, id, text, actingAs? } — nová poznámka; vrací ji ve tvaru seznamu.
export async function POST(req: NextRequest) {
  let b: any;
  try { b = await req.json(); } catch { return chyba('Neplatné tělo požadavku.', 400); }
  const v = await volajici(req, b?.actingAs);
  if (jeOdpoved(v)) return v;
  const c = cil(b?.typ, b?.id);
  if (jeOdpoved(c)) return c;
  const text = normalizujTextPoznamky(b?.text);
  if (!text) {
    return chyba(typeof b?.text === 'string' && b.text.length > MAX_DELKA_POZNAMKY
      ? `Poznámka může mít nejvýš ${MAX_DELKA_POZNAMKY} znaků.`
      : 'Napiš text poznámky.', 400);
  }
  // Tablet bez vybraného člověka: poznámka musí mít jméno (viz hlavička souboru).
  if (v.tablet && v.actingId === v.c.meId) return chyba('Na tabletu píše vybraný člověk — nejdřív vyber, kdo píše.', 403);
  try {
    if (!(await entitaViditelna(c.typ, c.klic, v))) return chyba('Tohle už neexistuje.', 404);
    // @zmínky rozhoduje server podle členů podniku (klient jen našeptává) — oznámení dostanou jen skuteční lidé.
    let zminky: number[] = [];
    try { zminky = najdiZminky(text, await clenovePodniku(v.c.teamId)); } catch { /* bez zmínek */ }
    let r: any;
    try {
      [r] = await sql`
        INSERT INTO entity_notes (team_id, entity_type, entity_id, user_id, text, mentions)
        VALUES (${v.c.teamId}, ${c.typ}, ${c.klic}, ${v.actingId}, ${text}, ${zminky})
        RETURNING id`;
    } catch (e) {
      if (!bezSloupce(e)) throw e;
      [r] = await sql`
        INSERT INTO entity_notes (team_id, entity_type, entity_id, user_id, text)
        VALUES (${v.c.teamId}, ${c.typ}, ${c.klic}, ${v.actingId}, ${text})
        RETURNING id`;
    }
    await oznacPrecteno(v.c.teamId, v.actingId, c.typ, c.klic);
    try { await oznamPoznamku(v, c.typ, c.klic, text, zminky); } catch (e) { console.error('notes notify', e); }
    const row = await JEDNA_POZNAMKA(Number(r.id));
    return NextResponse.json(tvar(row, v), { status: 201 });
  } catch (e) {
    if (predMigraci(e)) return chyba('Poznámky ještě nejsou zapnuté — vedení musí spustit aktualizaci databáze.', 503);
    console.error('notes POST', e);
    return chyba('Poznámku se nepodařilo uložit.', 500);
  }
}

/** Jedna poznámka podniku podle id, nebo null. */
async function nactiPoznamku(id: number, teamId: number) {
  const [n] = await sql`SELECT id, entity_type, entity_id, user_id FROM entity_notes WHERE id = ${id} AND team_id = ${teamId}`;
  return n ?? null;
}

// PATCH { id, text, actingAs? } — upravit text; jen autor.
// PATCH { id, pripnuta: boolean } — připnout nahoru / odepnout; autor (kolo 8, R8-5).
export async function PATCH(req: NextRequest) {
  let b: any;
  try { b = await req.json(); } catch { return chyba('Neplatné tělo požadavku.', 400); }
  const v = await volajici(req, b?.actingAs);
  if (jeOdpoved(v)) return v;
  const id = Number(b?.id);
  if (!Number.isInteger(id) || id <= 0) return chyba('Chybí id poznámky.', 400);
  const jenPripnuti = typeof b?.pripnuta === 'boolean' && b?.text === undefined;
  const text = jenPripnuti ? null : normalizujTextPoznamky(b?.text);
  if (!jenPripnuti && !text) return chyba(typeof b?.text === 'string' && b.text.length > MAX_DELKA_POZNAMKY ? `Poznámka může mít nejvýš ${MAX_DELKA_POZNAMKY} znaků.` : 'Napiš text poznámky.', 400);
  try {
    const n = await nactiPoznamku(id, v.c.teamId);
    if (!n) return chyba('Tohle už neexistuje.', 404);
    if (!smiUpravitPoznamku(Number(n.user_id), v.actingId)) return chyba(jenPripnuti ? 'Připnout poznámku může jen ten, kdo ji napsal.' : 'Poznámku může upravit jen ten, kdo ji napsal.', 403);
    if (jenPripnuti) {
      try { await sql`UPDATE entity_notes SET pinned = ${b.pripnuta === true} WHERE id = ${id} AND team_id = ${v.c.teamId}`; }
      catch (e) { if (bezSloupce(e)) return chyba('Připnutí ještě není zapnuté — vedení musí spustit aktualizaci databáze.', 503); throw e; }
    } else {
      await sql`UPDATE entity_notes SET text = ${text}, updated_at = NOW() WHERE id = ${id} AND team_id = ${v.c.teamId}`;
    }
    const row = await JEDNA_POZNAMKA(id);
    return NextResponse.json(tvar(row, v));
  } catch (e) {
    console.error('notes PATCH', e);
    return chyba('Poznámku se nepodařilo uložit.', 500);
  }
}

// DELETE ?id=[&actingAs=] — autor, nebo správce oblasti.
export async function DELETE(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const v = await volajici(req, q.get('actingAs'));
  if (jeOdpoved(v)) return v;
  const id = Number(q.get('id'));
  if (!Number.isInteger(id) || id <= 0) return chyba('Chybí id poznámky.', 400);
  try {
    const n = await nactiPoznamku(id, v.c.teamId);
    if (!n) return chyba('Tohle už neexistuje.', 404);
    const typ = jeTypPoznamky(n.entity_type) ? n.entity_type : null;
    const smi = typ != null && smiSmazatPoznamku({ typ, autorId: Number(n.user_id), meId: v.actingId, opr: v.c.role.opravneni });
    if (!smi) return chyba('Poznámku smaže jen její autor nebo kdo spravuje tuhle oblast.', 403);
    await sql`DELETE FROM entity_notes WHERE id = ${id} AND team_id = ${v.c.teamId}`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('notes DELETE', e);
    return chyba('Poznámku se nepodařilo smazat.', 500);
  }
}
