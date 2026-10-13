import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { typNaUcet } from '@/lib/opravneni';
import { resolveActingUser } from '@/lib/kioskActing';
import { jeTypPoznamky, type TypPoznamky } from '@/lib/poznamky';

// Počty poznámek pro bubliny v seznamech (kolo 8, R8-5): GET ?typ=task[&actingAs=]
// → { pocty: { "<entity_id>": { n, nove } } }. `nove` = od poslední návštěvy vlákna
// (entity_note_reads) přibyla cizí poznámka — řádek v seznamu ji ukáže tučně.
//
// Jeden dotaz na typ, ne na řádek: seznam receptur má 200 položek. Vidí se jen
// to, co by člověk viděl i v detailu: typy s oprávněním podle lib/poznamky
// (entitaViditelna v /api/notes), u úkolů bez ukoly.zobrazit_tym jen vlastní
// a „pro kohokoli", u uzávěrek bez uzaverky.zobrazit_vse jen vlastní.

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

const PRAVO: Partial<Record<TypPoznamky, string[]>> = {
  guide: ['navody.zobrazit'], procedure: ['postupy.zobrazit'], recipe: ['receptury.zobrazit'], inventory_item: ['sklad.zobrazit'],
  event: ['akce.zobrazit'], menu_item: ['menu.zobrazit', 'menu.upravit'], shift: ['rozvrh.nahled'],
  // podnět (kolo 7): nástěnku Nápadů vidí, kdo smí přidávat nebo spravovat — jako entitaViditelna v /api/notes
  suggestion: ['napady.pridat', 'napady.spravovat'],
};

export async function GET(req: NextRequest) {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  const typ = req.nextUrl.searchParams.get('typ');
  if (!jeTypPoznamky(typ)) return NextResponse.json({ error: 'Neznámý typ poznámky.' }, { status: 400 });
  const opr = c.role.opravneni;
  const ucet = typNaUcet(c.role.typ);
  const me = await resolveActingUser(c.meId, ucet, c.teamId, req.nextUrl.searchParams.get('actingAs'), req);
  const klice = PRAVO[typ];
  if (klice && !klice.some(k => opr.has(k)) && !(typ === 'shift')) return NextResponse.json({ pocty: {} });
  try {
    let rows: any[];
    if (typ === 'task' && !opr.has('ukoly.zobrazit_tym')) {
      rows = await sql`
        SELECT n.entity_id, COUNT(*) AS n, BOOL_OR(n.user_id <> ${me} AND n.created_at > COALESCE(r.read_at, '1970-01-01'::timestamp)) AS nove
        FROM entity_notes n
        JOIN tasks t ON t.id = n.entity_id::int AND t.team_id = n.team_id AND (t.assigned_to IS NULL OR t.assigned_to = ${me} OR t.created_by = ${me})
        LEFT JOIN entity_note_reads r ON r.team_id = n.team_id AND r.entity_type = n.entity_type AND r.entity_id = n.entity_id AND r.user_id = ${me}
        WHERE n.team_id = ${c.teamId} AND n.entity_type = ${typ}
        GROUP BY n.entity_id`;
    } else if (typ === 'closing' && !opr.has('uzaverky.zobrazit_vse')) {
      rows = await sql`
        SELECT n.entity_id, COUNT(*) AS n, BOOL_OR(n.user_id <> ${me} AND n.created_at > COALESCE(r.read_at, '1970-01-01'::timestamp)) AS nove
        FROM entity_notes n
        JOIN cash_closings cc ON cc.id = n.entity_id::int AND cc.team_id = n.team_id AND cc.created_by = ${me}
        LEFT JOIN entity_note_reads r ON r.team_id = n.team_id AND r.entity_type = n.entity_type AND r.entity_id = n.entity_id AND r.user_id = ${me}
        WHERE n.team_id = ${c.teamId} AND n.entity_type = ${typ}
        GROUP BY n.entity_id`;
    } else if (typ === 'shift' && !opr.has('rozvrh.nahled')) {
      rows = await sql`
        SELECT n.entity_id, COUNT(*) AS n, BOOL_OR(n.user_id <> ${me} AND n.created_at > COALESCE(r.read_at, '1970-01-01'::timestamp)) AS nove
        FROM entity_notes n
        JOIN shifts s ON s.id = n.entity_id::int AND s.team_id = n.team_id AND s.employee_id = ${me}
        LEFT JOIN entity_note_reads r ON r.team_id = n.team_id AND r.entity_type = n.entity_type AND r.entity_id = n.entity_id AND r.user_id = ${me}
        WHERE n.team_id = ${c.teamId} AND n.entity_type = ${typ}
        GROUP BY n.entity_id`;
    } else {
      rows = await sql`
        SELECT n.entity_id, COUNT(*) AS n, BOOL_OR(n.user_id <> ${me} AND n.created_at > COALESCE(r.read_at, '1970-01-01'::timestamp)) AS nove
        FROM entity_notes n
        LEFT JOIN entity_note_reads r ON r.team_id = n.team_id AND r.entity_type = n.entity_type AND r.entity_id = n.entity_id AND r.user_id = ${me}
        WHERE n.team_id = ${c.teamId} AND n.entity_type = ${typ}
        GROUP BY n.entity_id`;
    }
    const pocty: Record<string, { n: number; nove: boolean }> = {};
    for (const r of rows) pocty[String(r.entity_id)] = { n: Number(r.n) || 0, nove: r.nove === true };
    return NextResponse.json({ pocty });
  } catch (e) {
    // Před migrací (tabulka čtení nebo poznámek chybí): žádné bubliny, ne 500.
    const kod = (e as { code?: string } | null)?.code;
    if (kod === '42P01' || kod === '42703') return NextResponse.json({ pocty: {} });
    console.error('notes/pocty GET', e);
    return NextResponse.json({ error: 'Počty poznámek se nenačetly.' }, { status: 500 });
  }
}
