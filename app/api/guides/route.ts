import { NextResponse } from 'next/server';
import { normalizeSteps } from '@/lib/guideSteps';
import { neon } from '@neondatabase/serverless';
import { notifyUsers, notifyUser } from '@/lib/push';
import { pripniNavodKPolozce } from '@/lib/navodyDb';
import { tymyCiselniku } from '@/lib/tenant';
import { pozaduj, jeOdpoved, clenoveSOpravnenim } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

/**
 * Je kategorie viditelná pro podnik? Vlastní, nebo ze zdrojového podniku
 * organizace (kolo 60). Návod je řádek podniku, ukazuje ale na kategorii, a
 * ukazatel se ověřuje proti viditelným podnikům — nikdy proti holému id,
 * jinak by šlo návod zařadit do kategorie cizí organizace.
 */
async function kategorieViditelna(teamId: number, categoryId: number): Promise<boolean> {
  const tymy = await tymyCiselniku(teamId, 'kategorieNavodu');
  const [row] = await sql`SELECT 1 AS ok FROM guide_categories WHERE id = ${categoryId} AND team_id = ANY(${tymy})`;
  return !!row;
}

function excerpt(content: string) {
  const flat = String(content || '').replace(/\s+/g, ' ').trim();
  return flat.length > 120 ? flat.slice(0, 120).trimEnd() + '…' : flat;
}

// Krok návodu může nést i surovinu s množstvím — normalizace je sdílená,
// aby se editor, čtečka i uložení shodly na tvaru. Starý checklist jako pole
// řetězců projde beze změny.
const normalizeChecklist = normalizeSteps;

function checklistLength(raw: any): number {
  if (Array.isArray(raw)) return raw.length;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p.length : 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

// GET — list team's guides (optionally ?categoryId=)
export async function GET(request: Request) {
  const c = await pozaduj('navody.zobrazit');
  if (jeOdpoved(c)) return c;
  const opr = c.role.opravneni;

  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get('categoryId');

  let rows: any[];
  try {
    rows = categoryId
      ? await sql`
          SELECT g.id, g.title, g.category_id, g.content, g.checklist, g.updated_at, g.approved, g.submitted_by, g.product_id,
                 g.item_id, g.require_read, g.for_closing,
                 (SELECT COUNT(*)::int FROM guide_reads gr WHERE gr.guide_id = g.id) AS read_count,
                 EXISTS (SELECT 1 FROM guide_reads gr2 WHERE gr2.guide_id = g.id AND gr2.user_id = ${c.meId}) AS my_read
          FROM guides g
          WHERE g.team_id = ${c.teamId} AND g.category_id = ${parseInt(categoryId)}
          ORDER BY g.updated_at DESC`
      : await sql`
          SELECT g.id, g.title, g.category_id, g.content, g.checklist, g.updated_at, g.approved, g.submitted_by, g.product_id,
                 g.item_id, g.require_read, g.for_closing,
                 (SELECT COUNT(*)::int FROM guide_reads gr WHERE gr.guide_id = g.id) AS read_count,
                 EXISTS (SELECT 1 FROM guide_reads gr2 WHERE gr2.guide_id = g.id AND gr2.user_id = ${c.meId}) AS my_read
          FROM guides g
          WHERE g.team_id = ${c.teamId}
          ORDER BY g.updated_at DESC`;
  } catch {
    rows = categoryId
      ? await sql`
          SELECT id, title, category_id, content, checklist, updated_at
          FROM guides
          WHERE team_id = ${c.teamId} AND category_id = ${parseInt(categoryId)}
          ORDER BY updated_at DESC`
      : await sql`
          SELECT id, title, category_id, content, checklist, updated_at
          FROM guides
          WHERE team_id = ${c.teamId}
          ORDER BY updated_at DESC`;
  }
  // Neschválené návrhy vidí ten, kdo je smí schválit, a autor svůj vlastní —
  // ostatním by se v seznamu objevil text, který ještě nikdo nepotvrdil.
  const schvaluje = opr.has('navody.schvalovat');
  rows = rows.filter((g: any) => g.approved !== false || schvaluje || g.submitted_by === c.meId);
  // Kolik lidí návod četlo, je přehled pro toho, kdo povinné čtení řídí;
  // ostatní z něj nic nepotřebují (UI ho ukazuje jen vedení).
  const vidiCtenare = opr.has('navody.povinne_cteni');

  const guides = rows.map((g: any) => ({
    id: g.id,
    title: g.title,
    categoryId: g.category_id,
    updatedAt: g.updated_at,
    approved: g.approved !== false,
    submittedBy: g.submitted_by ?? null,
    requireRead: g.require_read === true,
    readCount: vidiCtenare ? Number(g.read_count) || 0 : 0,
    myRead: g.my_read === true,
    excerpt: excerpt(g.content),
    hasChecklist: checklistLength(g.checklist) > 0,
    productId: g.product_id ?? null,
    itemId: g.item_id != null ? Number(g.item_id) : null,
    forClosing: g.for_closing === true,
  }));

  return NextResponse.json({ guides });
}

// POST — založit návod (navody.vytvorit), nebo jen navrhnout
// (navody.navrhnout): návrh čeká na schválení a ostatním se neukáže.
export async function POST(request: Request) {
  const c = await pozaduj(['navody.vytvorit', 'navody.navrhnout']);
  if (jeOdpoved(c)) return c;
  const isProposal = !c.role.opravneni.has('navody.vytvorit');

  const body = await request.json();
  const { title, content, categoryId, checklist } = body;
  const productId = body.productId ? String(body.productId).trim().slice(0, 120) : null;
  const productName = body.productName ? String(body.productName).trim().slice(0, 160) : null;
  const itemId = Number(body.itemId) > 0 ? Number(body.itemId) : null;
  if (!title || !String(title).trim()) return NextResponse.json({ error: 'Název je povinný' }, { status: 400 });

  // Kategorie se dřív neověřovala vůbec; se sdílenými číselníky musí být
  // viditelná pro tenhle podnik (vlastní nebo ze zdroje organizace).
  const catId = categoryId ? parseInt(categoryId) : null;
  if (catId != null && (!Number.isInteger(catId) || !(await kategorieViditelna(Number(c.teamId), catId)))) {
    return NextResponse.json({ error: 'Kategorie neexistuje' }, { status: 400 });
  }

  const steps = normalizeChecklist(checklist);

  let guide: any;
  try {
    [guide] = await sql`
    INSERT INTO guides (team_id, category_id, title, content, checklist, created_by, updated_at, approved, submitted_by)
    VALUES (
      ${c.teamId},
      ${catId},
      ${String(title).trim()},
      ${content || ''},
      ${JSON.stringify(steps)},
      ${c.meId},
      NOW(),
      ${!isProposal},
      ${isProposal ? c.meId : null}
    )
    RETURNING id, title, category_id, content, checklist, updated_at`;
    if (productId && guide?.id) {
      // Sloupce jsou novější — když chybí, návod se uloží i tak, jen bez vazby.
      try {
        await sql`UPDATE guides SET product_id = ${productId}, product_name = ${productName} WHERE id = ${guide.id}`;
      } catch { /* migrace ještě neproběhla */ }
    }
    // Vazba na skladovou položku „vyrábíme sami“ — ověřuje tým, takže cizí
    // položku připnout nejde.
    if (itemId && guide?.id) await pripniNavodKPolozce(c.teamId, Number(guide.id), itemId);
  } catch {
    // approval columns not migrated yet — insert the old shape (auto-approved)
    [guide] = await sql`
    INSERT INTO guides (team_id, category_id, title, content, checklist, created_by, updated_at)
    VALUES (
      ${c.teamId},
      ${catId},
      ${String(title).trim()},
      ${content || ''},
      ${JSON.stringify(steps)},
      ${c.meId},
      NOW()
    )
    RETURNING *`;
  }


  if (isProposal) {
    try {
      // Kolo 62: podle členství — provozovatel přepnutý jinam návrh uvidí.
      // Kolo 67: dostane ho ten, kdo návrhy smí schválit.
      const employers = await clenoveSOpravnenim(c.teamId, 'navody.schvalovat');
      const [author] = await sql`SELECT name FROM users WHERE id = ${c.meId}`;
      await notifyUsers(employers, {
        title: '📖 Návrh návodu ke schválení',
        body: `${author?.name ?? 'Zaměstnanec'} navrhuje návod „${String(title).trim()}".`,
        type: 'info',
        link: '/employer/overview?view=guides',
      });
    } catch { /* best-effort */ }
  }

  return NextResponse.json({
    guide: {
      id: guide.id,
      title: guide.title,
      categoryId: guide.category_id,
      updatedAt: guide.updated_at,
      excerpt: excerpt(guide.content),
      hasChecklist: checklistLength(guide.checklist) > 0,
    },
  });
}
