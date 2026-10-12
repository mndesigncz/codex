import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved, type Kontext } from '@/lib/opravneniDb';
import { typNaUcet } from '@/lib/opravneni';
import { resolveActingUser } from '@/lib/kioskActing';
import {
  jeTypPoznamky, klicEntity, normalizujTextPoznamky, smiSmazatPoznamku, smiUpravitPoznamku,
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
  };
};

const SELECT_POZNAMKY = (teamId: number, typ: string, klic: string) => sql`
  SELECT n.id, n.entity_type, n.user_id, n.text, n.created_at, n.updated_at, u.name AS autor_name, u.avatar AS autor_avatar
  FROM entity_notes n
  LEFT JOIN users u ON u.id = n.user_id
  WHERE n.team_id = ${teamId} AND n.entity_type = ${typ} AND n.entity_id = ${klic}
  ORDER BY n.created_at ASC, n.id ASC`;

/** Tabulka před migrací (/api/init ještě neběžel): prázdný seznam, ne 500. */
const predMigraci = (e: unknown) => (e as { code?: string } | null)?.code === '42P01';

// GET ?typ=&id=[&actingAs=] — poznámky k jedné věci, od nejstarší.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const v = await volajici(req, q.get('actingAs'));
  if (jeOdpoved(v)) return v;
  const c = cil(q.get('typ'), q.get('id'));
  if (jeOdpoved(c)) return c;
  try {
    if (!(await entitaViditelna(c.typ, c.klic, v))) return chyba('Tohle už neexistuje.', 404);
    const rows = await SELECT_POZNAMKY(v.c.teamId, c.typ, c.klic);
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
    const [r] = await sql`
      INSERT INTO entity_notes (team_id, entity_type, entity_id, user_id, text)
      VALUES (${v.c.teamId}, ${c.typ}, ${c.klic}, ${v.actingId}, ${text})
      RETURNING id`;
    const [row] = await sql`
      SELECT n.id, n.entity_type, n.user_id, n.text, n.created_at, n.updated_at, u.name AS autor_name, u.avatar AS autor_avatar
      FROM entity_notes n LEFT JOIN users u ON u.id = n.user_id WHERE n.id = ${r.id}`;
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
export async function PATCH(req: NextRequest) {
  let b: any;
  try { b = await req.json(); } catch { return chyba('Neplatné tělo požadavku.', 400); }
  const v = await volajici(req, b?.actingAs);
  if (jeOdpoved(v)) return v;
  const id = Number(b?.id);
  if (!Number.isInteger(id) || id <= 0) return chyba('Chybí id poznámky.', 400);
  const text = normalizujTextPoznamky(b?.text);
  if (!text) return chyba(typeof b?.text === 'string' && b.text.length > MAX_DELKA_POZNAMKY ? `Poznámka může mít nejvýš ${MAX_DELKA_POZNAMKY} znaků.` : 'Napiš text poznámky.', 400);
  try {
    const n = await nactiPoznamku(id, v.c.teamId);
    if (!n) return chyba('Tohle už neexistuje.', 404);
    if (!smiUpravitPoznamku(Number(n.user_id), v.actingId)) return chyba('Poznámku může upravit jen ten, kdo ji napsal.', 403);
    await sql`UPDATE entity_notes SET text = ${text}, updated_at = NOW() WHERE id = ${id} AND team_id = ${v.c.teamId}`;
    const [row] = await sql`
      SELECT n.id, n.entity_type, n.user_id, n.text, n.created_at, n.updated_at, u.name AS autor_name, u.avatar AS autor_avatar
      FROM entity_notes n LEFT JOIN users u ON u.id = n.user_id WHERE n.id = ${id}`;
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
