import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved, clenoveSOpravnenim } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { notifyUser, notifyUsers } from '@/lib/push';
import { doplnSuroviny, nakladZTela, osobyPodleId, snimekReceptury, surovinyZTela, ulozRecepturu } from '@/lib/recepturyDb';
import { MAX_DELKA_DUVODU, jeBezeZmeny, normalizujSuroviny, popisRozdilu, rozdilVerzi } from '@/lib/recepturyVerze';

// Návrh úpravy receptury (kolo 8, R8-5): zaměstnanec s receptury.navrhnout navrhne,
// vedení (receptury.upravit) schválí nebo vrátí s poznámkou.
//
//   GET    /api/pos/recipe-proposals            kdo smí upravovat: všechny čekající + vyřízené za 30 dní;
//                                               ostatní: jen vlastní (`muj`)
//   POST   { productId, productName, ingredients, reason, costPerPortion?, puvodniCost? }
//                                               založí návrh (snímek původní receptury se bere tady, ne z těla),
//                                               oznámí těm, kdo smí schvalovat
//   PATCH  { id, akce: 'schvalit' | 'vratit', note? }
//                                               schválit = uložit jako verzi (lib/recepturyDb) a oznámit autorovi;
//                                               vrátit = poznámka povinná, autor ji dostane v oznámení

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

const chyba = (text: string, status: number) => NextResponse.json({ error: text }, { status });
const predMigraci = (e: unknown) => (e as { code?: string } | null)?.code === '42P01';



async function tvar(rows: any[], meId: number) {
  const lide = await osobyPodleId(rows.flatMap(r => [Number(r.author_id), Number(r.reviewed_by)]));
  return rows.map(r => {
    const rev = r.reviewed_by == null ? null : lide.get(Number(r.reviewed_by)) ?? null;
    return {
      id: Number(r.id),
      productId: String(r.product_id),
      productName: r.product_name ?? null,
      ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
      puvodni: Array.isArray(r.original) ? r.original : [],
      reason: r.reason ?? '',
      status: r.status,
      author: lide.get(Number(r.author_id)) ?? null,
      reviewer: rev ? { id: rev.id, name: rev.name } : null,
      reviewedAt: r.reviewed_at ? new Date(r.reviewed_at).toISOString() : null,
      reviewNote: r.review_note ?? null,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : '',
      costPerPortion: r.cost_per_portion == null ? null : Number(r.cost_per_portion),
      puvodniCost: r.original_cost == null ? null : Number(r.original_cost),
      muj: Number(r.author_id) === meId,
    };
  });
}

export async function GET() {
  const c = await pozaduj('receptury.zobrazit');
  if (jeOdpoved(c)) return c;
  const schvaluje = c.role.opravneni.has('receptury.upravit');
  try {
    const rows = schvaluje
      ? await sql`
          SELECT id, product_id, product_name, ingredients, original, reason, status, author_id, reviewed_by, reviewed_at, review_note, cost_per_portion, original_cost, created_at
          FROM pos_recipe_proposals
          WHERE team_id = ${c.teamId} AND (status = 'ceka' OR created_at >= NOW() - INTERVAL '30 days')
          ORDER BY created_at DESC, id DESC LIMIT 100`
      : await sql`
          SELECT id, product_id, product_name, ingredients, original, reason, status, author_id, reviewed_by, reviewed_at, review_note, cost_per_portion, original_cost, created_at
          FROM pos_recipe_proposals
          WHERE team_id = ${c.teamId} AND author_id = ${c.meId} AND (status = 'ceka' OR created_at >= NOW() - INTERVAL '30 days')
          ORDER BY created_at DESC, id DESC LIMIT 50`;
    return NextResponse.json({ proposals: await tvar(rows as any[], c.meId), schvaluje });
  } catch (e) {
    if (predMigraci(e)) return NextResponse.json({ proposals: [], schvaluje });
    console.error('recipe-proposals GET', e);
    return chyba('Návrhy receptur se nenačetly.', 500);
  }
}

export async function POST(req: NextRequest) {
  const c = await pozaduj(['receptury.navrhnout', 'receptury.upravit']);
  if (jeOdpoved(c)) return c;
  const b = await req.json().catch(() => ({}));
  const productId = String(b?.productId ?? '').trim().slice(0, 120);
  if (!productId) return chyba('Chybí produkt', 400);
  const reason = String(b?.reason ?? '').trim();
  if (!reason) return chyba('Napiš, proč recepturu měníš — vedení to potřebuje k rozhodnutí.', 400);
  if (reason.length > MAX_DELKA_DUVODU) return chyba(`Důvod může mít nejvýš ${MAX_DELKA_DUVODU} znaků.`, 400);
  const jmeno = b?.productName ? String(b.productName).slice(0, 160) : null;
  try {
    const nove = await doplnSuroviny(c.teamId, surovinyZTela(b?.ingredients));
    const puvodni = await snimekReceptury(c.teamId, productId);
    if (jeBezeZmeny(rozdilVerzi(puvodni, nove))) return chyba('Návrh se neliší od současné receptury.', 400);
    const [r] = await sql`
      INSERT INTO pos_recipe_proposals (team_id, product_id, product_name, ingredients, original, reason, status, author_id, cost_per_portion, original_cost)
      VALUES (${c.teamId}, ${productId}, ${jmeno}, ${JSON.stringify(nove)}::jsonb, ${JSON.stringify(puvodni)}::jsonb, ${reason}, 'ceka', ${c.meId},
              ${nakladZTela(b?.costPerPortion)}, ${nakladZTela(b?.puvodniCost)})
      RETURNING id`;
    const popis = popisRozdilu(rozdilVerzi(puvodni, nove));
    audit(c.teamId, c.meId, 'pos.recipe.navrh', 'pos', Number(r.id), `${jmeno ?? productId}: ${popis} — ${reason}`.slice(0, 300));
    // Kdo smí schvalovat, dostane oznámení (bez autora) — fronta je ve widgetu Receptury.
    try {
      const komu = (await clenoveSOpravnenim(c.teamId, 'receptury.upravit')).filter(id => id !== c.meId);
      if (komu.length) {
        const [autor] = await sql`SELECT name FROM users WHERE id = ${c.meId}`;
        await notifyUsers(komu, {
          title: 'Návrh úpravy receptury',
          body: `${autor?.name ?? 'Kolega'} navrhuje změnu „${jmeno ?? productId}": ${popis}`,
          type: 'info', category: 'general', link: '/employer/overview?view=recipes',
        });
      }
    } catch (e) { console.error('recipe-proposals notify', e); }
    const [row] = await sql`
      SELECT id, product_id, product_name, ingredients, original, reason, status, author_id, reviewed_by, reviewed_at, review_note, cost_per_portion, original_cost, created_at
      FROM pos_recipe_proposals WHERE id = ${r.id}`;
    return NextResponse.json({ ok: true, proposal: (await tvar([row], c.meId))[0] }, { status: 201 });
  } catch (e) {
    if (predMigraci(e)) return chyba('Návrhy receptur ještě nejsou zapnuté — vedení musí spustit aktualizaci databáze.', 503);
    console.error('recipe-proposals POST', e);
    return chyba('Návrh se nepodařilo uložit.', 500);
  }
}

export async function PATCH(req: NextRequest) {
  const c = await pozaduj('receptury.upravit');
  if (jeOdpoved(c)) return c;
  const b = await req.json().catch(() => ({}));
  const id = Number(b?.id);
  if (!Number.isInteger(id) || id <= 0) return chyba('Chybí id návrhu.', 400);
  const akce = b?.akce === 'schvalit' ? 'schvalit' : b?.akce === 'vratit' ? 'vratit' : null;
  if (!akce) return chyba('Neznámá akce.', 400);
  const note = String(b?.note ?? '').trim().slice(0, MAX_DELKA_DUVODU) || null;
  if (akce === 'vratit' && !note) return chyba('Napiš, proč návrh vracíš — navrhovatel se jinak nedozví, co opravit.', 400);
  try {
    const [n] = await sql`
      SELECT id, product_id, product_name, ingredients, status, author_id, cost_per_portion
      FROM pos_recipe_proposals WHERE id = ${id} AND team_id = ${c.teamId}`;
    if (!n) return chyba('Návrh už neexistuje.', 404);
    if (n.status !== 'ceka') return chyba('O tomhle návrhu už je rozhodnuto.', 409);
    const [autor] = await sql`SELECT name FROM users WHERE id = ${n.author_id}`;
    const jmeno = n.product_name ?? String(n.product_id);
    if (akce === 'schvalit') {
      const suroviny = normalizujSuroviny(n.ingredients, 60).map(s => ({ itemId: s.itemId, amount: s.amount }));
      await ulozRecepturu(c.teamId, c.meId, {
        productId: String(n.product_id), productName: n.product_name ?? null, ingredients: suroviny,
        costPerPortion: n.cost_per_portion == null ? null : Number(n.cost_per_portion),
        note: `Schválen návrh: ${autor?.name ?? 'kolega'}`,
      });
    }
    await sql`
      UPDATE pos_recipe_proposals SET status = ${akce === 'schvalit' ? 'schvaleno' : 'vraceno'}, reviewed_by = ${c.meId}, reviewed_at = NOW(), review_note = ${note}
      WHERE id = ${id} AND team_id = ${c.teamId}`;
    audit(c.teamId, c.meId, akce === 'schvalit' ? 'pos.recipe.schvaleno' : 'pos.recipe.vraceno', 'pos', id, `${jmeno}${note ? `: ${note}` : ''}`.slice(0, 300));
    if (Number(n.author_id) !== c.meId) {
      try {
        await notifyUser(Number(n.author_id), akce === 'schvalit'
          ? { title: 'Receptura schválena ✓', body: `Tvoje úprava „${jmeno}" platí${note ? ` — ${note}` : '.'}`, type: 'info', category: 'general', link: '/employee/shifts?view=recipes' }
          : { title: 'Návrh receptury vrácen', body: `„${jmeno}": ${note}`, type: 'warning', category: 'general', link: '/employee/shifts?view=recipes' });
      } catch { /* best-effort */ }
    }
    const [row] = await sql`
      SELECT id, product_id, product_name, ingredients, original, reason, status, author_id, reviewed_by, reviewed_at, review_note, cost_per_portion, original_cost, created_at
      FROM pos_recipe_proposals WHERE id = ${id}`;
    return NextResponse.json({ ok: true, proposal: (await tvar([row], c.meId))[0] });
  } catch (e) {
    if (predMigraci(e)) return chyba('Návrhy receptur ještě nejsou zapnuté — spusť /api/init.', 503);
    console.error('recipe-proposals PATCH', e);
    return chyba('Rozhodnutí se nepodařilo uložit.', 500);
  }
}
