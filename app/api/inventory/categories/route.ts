import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { normalizeDefaults } from '@/lib/itemDefaults';
import { ciselnikPodniku, tymyCiselniku } from '@/lib/tenant';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

/** Kolo 67: brána oprávněním místo role z tokenu; podnik vždy z databáze. */
async function currentUser(klic: string) {
  const c = await pozaduj(klic);
  if (jeOdpoved(c)) return c;
  return { meId: c.meId, teamId: c.teamId };
}

// GET: list the team's custom categories ordered by position. Se sdílenými
// číselníky (kolo 60) přibudou i kategorie zdrojového podniku organizace —
// vlastní první, cizí označené `zOrganizace`, ať je na každé vidět, odkud je.
//
// `sklad.zobrazit` — mají ho všechny tři dnešní role; kategorie čte i tablet,
// formulář zaměstnance a výběr surovin v Návodech.
export async function GET() {
  const me = await currentUser('sklad.zobrazit');
  if (jeOdpoved(me)) return me;

  // Které podniky čteme, rozhoduje jediné místo (lib/tenant.ts); tady se pole
  // jen dosadí do predikátu. Nikdy nepřijde z požadavku. Vedle predikátu
  // přijde i chip „sdíleno" pro zdroj a jméno zdroje pro „Spravuje: …".
  const { tymy, jsemZdroj, spravuje } = await ciselnikPodniku(me.teamId, 'kategorieSkladu');

  // Newest column set first, then progressively older ones, so a database that
  // has not run the latest /api/init still lists categories instead of 500ing.
  // Columns the query didn't select simply come back undefined below.
  const attempts = [
    () => sql`
      SELECT id, team_id, name, position, parent_id, tracks_open, content_unit, default_package_size, threshold_unit, defaults, scale, hide_from_overview
      FROM inventory_categories WHERE team_id = ANY(${tymy})
      ORDER BY (team_id = ${me.teamId}) DESC, position ASC, name ASC`,
    () => sql`
      SELECT id, team_id, name, position, parent_id, tracks_open, content_unit, default_package_size, threshold_unit, defaults, scale
      FROM inventory_categories WHERE team_id = ANY(${tymy})
      ORDER BY (team_id = ${me.teamId}) DESC, position ASC, name ASC`,
    () => sql`
      SELECT id, team_id, name, position, parent_id, tracks_open, content_unit, default_package_size, threshold_unit, scale
      FROM inventory_categories WHERE team_id = ANY(${tymy})
      ORDER BY (team_id = ${me.teamId}) DESC, position ASC, name ASC`,
    () => sql`
      SELECT id, team_id, name, position, parent_id, tracks_open, content_unit, default_package_size, scale
      FROM inventory_categories WHERE team_id = ANY(${tymy})
      ORDER BY (team_id = ${me.teamId}) DESC, position ASC, name ASC`,
    () => sql`
      SELECT id, team_id, name, position, tracks_open, content_unit, default_package_size, scale
      FROM inventory_categories WHERE team_id = ANY(${tymy})
      ORDER BY (team_id = ${me.teamId}) DESC, position ASC, name ASC`,
    () => sql`
      SELECT id, team_id, name, position
      FROM inventory_categories WHERE team_id = ANY(${tymy})
      ORDER BY (team_id = ${me.teamId}) DESC, position ASC, name ASC`,
  ];

  let rows: any[] = [];
  for (const attempt of attempts) {
    try { rows = await attempt(); break; } catch { /* try the next-oldest shape */ }
  }

  // Zdroj vidí jen své řádky, ale má vědět, že úprava se propíše do celé
  // organizace — proto chip „sdíleno". Název zdroje pro „Spravuje: …" vidí
  // každý člen organizace i v seznamu podniků, takže tím nic neprozrazujeme.
  return NextResponse.json(rows.map((r: any) => ({
    id: r.id, name: r.name, position: r.position,
    zOrganizace: Number(r.team_id) !== Number(me.teamId),
    sdileno: Number(r.team_id) === Number(me.teamId) && jsemZdroj,
    spravuje: Number(r.team_id) !== Number(me.teamId) ? spravuje : null,
    parentId: r.parent_id != null ? Number(r.parent_id) : null,
    tracksOpen: r.tracks_open === true,
    contentUnit: r.content_unit ?? null,
    defaultPackageSize: r.default_package_size != null ? Number(r.default_package_size) : null,
    thresholdUnit: r.threshold_unit === 'content' ? 'content' : 'package',
    defaults: normalizeDefaults(r.defaults),
    scale: r.scale ?? null,
    hideFromOverview: r.hide_from_overview === true,
  })));
}

// POST (`sklad.kategorie`): create a new custom category.
export async function POST(request: Request) {
  const me = await currentUser('sklad.kategorie');
  if (jeOdpoved(me)) return me;

  const body = await request.json();
  const name = (body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Název kategorie je povinný' }, { status: 400 });

  // A new category may hang off any category of the same team — nesting has no
  // fixed depth. A brand-new row can't have descendants, so there is no cycle
  // to guard against here.
  let parentId: number | null = null;
  if (body.parentId != null && body.parentId !== '') {
    const candidate = Number(body.parentId);
    if (Number.isFinite(candidate)) {
      try {
        const [p] = await sql`
          SELECT id FROM inventory_categories WHERE id = ${candidate} AND team_id = ${me.teamId}`;
        if (!p) {
          // Zanořit jde jen pod vlastní kategorii. Strom napříč podniky by při
          // smazání rodiče ve zdroji nechal tady sirotky bez děděného balení.
          const tymy = await tymyCiselniku(me.teamId, 'kategorieSkladu');
          const [cizi] = tymy.length > 1
            ? await sql`SELECT id FROM inventory_categories WHERE id = ${candidate} AND team_id = ANY(${tymy})`
            : [null];
          if (cizi) return NextResponse.json({ error: 'Podkategorii pod kategorií z organizace založí podnik, který ji spravuje.' }, { status: 400 });
          return NextResponse.json({ error: 'Nadřazená kategorie neexistuje' }, { status: 400 });
        }
        parentId = candidate;
      } catch {
        return NextResponse.json({ error: 'Podkategorie nejsou dostupné — spusť /api/init.' }, { status: 400 });
      }
    }
  }

  // Names only have to be unique among siblings, so "Sladké" can sit under both
  // "Virginia" and "Latakia". Asking for one that already exists there returns
  // the existing category instead of creating a duplicate.
  try {
    const [twin] = parentId == null
      ? await sql`
          SELECT id FROM inventory_categories
          WHERE team_id = ${me.teamId} AND parent_id IS NULL AND lower(name) = lower(${name})`
      : await sql`
          SELECT id FROM inventory_categories
          WHERE team_id = ${me.teamId} AND parent_id = ${parentId} AND lower(name) = lower(${name})`;
    if (twin) return NextResponse.json({ ok: true, id: twin.id });
  } catch {
    const [twin] = await sql`
      SELECT id FROM inventory_categories
      WHERE team_id = ${me.teamId} AND lower(name) = lower(${name})`;
    if (twin) return NextResponse.json({ ok: true, id: twin.id });
  }

  // Position is counted within the parent so each level orders independently.
  if (parentId == null) {
    let next = 0;
    try {
      const [r] = await sql`
        SELECT COALESCE(MAX(position), -1) + 1 AS next
        FROM inventory_categories WHERE team_id = ${me.teamId} AND parent_id IS NULL`;
      next = r.next;
    } catch {
      const [r] = await sql`
        SELECT COALESCE(MAX(position), -1) + 1 AS next
        FROM inventory_categories WHERE team_id = ${me.teamId}`;
      next = r.next;
    }
    const [row] = await sql`
      INSERT INTO inventory_categories (team_id, name, position)
      VALUES (${me.teamId}, ${name}, ${next})
      RETURNING id`;
    return NextResponse.json({ ok: true, id: row.id });
  }

  const [{ next }] = await sql`
    SELECT COALESCE(MAX(position), -1) + 1 AS next
    FROM inventory_categories WHERE team_id = ${me.teamId} AND parent_id = ${parentId}`;
  const [row] = await sql`
    INSERT INTO inventory_categories (team_id, name, position, parent_id)
    VALUES (${me.teamId}, ${name}, ${next}, ${parentId})
    RETURNING id`;

  return NextResponse.json({ ok: true, id: row.id, parentId });
}
