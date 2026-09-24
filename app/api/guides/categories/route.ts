import { NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { neon } from '@neondatabase/serverless';
import { ciselnikPodniku } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// GET — kategorie podniku podle pořadí. Se sdílenými číselníky (kolo 60)
// i kategorie zdrojového podniku organizace — vlastní první, cizí označené
// `zOrganizace`, ať je u každé vidět, odkud je.
export async function GET() {
  const c = await pozaduj('navody.zobrazit');
  if (jeOdpoved(c)) return c;

  // Které podniky čteme, rozhoduje jediné místo (lib/tenant.ts); tady se pole
  // jen dosadí do predikátu. Nikdy nepřijde z požadavku. Vedle predikátu
  // přijde i chip „sdíleno" pro zdroj a jméno zdroje pro „Spravuje: …" —
  // to vidí každý člen organizace i v seznamu podniků.
  const { tymy, jsemZdroj, spravuje } = await ciselnikPodniku(c.teamId, 'kategorieNavodu');

  const rows = await sql`
    SELECT id, team_id, name, icon, position
    FROM guide_categories
    WHERE team_id = ANY(${tymy})
    ORDER BY (team_id = ${c.teamId}) DESC, position ASC, created_at ASC`;

  const categories = (rows as any[]).map(r => {
    const zOrganizace = Number(r.team_id) !== c.teamId;
    return {
      id: r.id, name: r.name, icon: r.icon, position: r.position,
      zOrganizace,
      sdileno: !zOrganizace && jsemZdroj,
      spravuje: zOrganizace ? spravuje : null,
    };
  });

  return NextResponse.json({ categories });
}

// POST — založit kategorii (navody.kategorie)
export async function POST(request: Request) {
  const c = await pozaduj('navody.kategorie');
  if (jeOdpoved(c)) return c;

  const { name, icon } = await request.json();
  if (!name || !String(name).trim()) return NextResponse.json({ error: 'Název je povinný' }, { status: 400 });

  const [{ next } = { next: 0 }] = await sql`
    SELECT COALESCE(MAX(position), -1) + 1 AS next FROM guide_categories WHERE team_id = ${c.teamId}`;

  const [category] = await sql`
    INSERT INTO guide_categories (team_id, name, icon, position)
    VALUES (${c.teamId}, ${String(name).trim()}, ${icon || 'book'}, ${next})
    RETURNING id, name, icon, position`;

  return NextResponse.json({ category });
}
