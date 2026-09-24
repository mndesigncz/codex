// Managing public share links. The pages themselves are rendered by /s/[token]
// and need no auth — these endpoints are the managing side of it (sdileni.spravovat).

import { NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { neon } from '@neondatabase/serverless';
import { planInfoOf, PLAN_ENFORCED, LIMITS, SHARE_LIMIT_MSG } from '@/lib/plan';
import { makeToken, normalizeExcluded, normalizeTheme } from '@/lib/share';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// Veřejné sdílené odkazy spravuje ten, kdo má sdileni.spravovat.
async function spravce() {
  const c = await pozaduj('sdileni.spravovat');
  if (jeOdpoved(c)) return c;
  return { meId: c.meId, teamId: c.teamId, opr: c.role.opravneni };
}

const mapRow = (r: any) => ({
  id: Number(r.id),
  token: String(r.token),
  kind: r.kind === 'guides' ? 'guides' : 'inventory',
  categoryId: r.category_id != null ? Number(r.category_id) : null,
  excluded: normalizeExcluded(r.excluded),
  title: r.title ?? null,
  note: r.note ?? null,
  enabled: r.enabled !== false,
  pinned: r.pinned === true,
  createdAt: r.created_at,
});

export async function GET() {
  const me = await spravce();
  if (jeOdpoved(me)) return me;

  let links: any[] = [];
  try {
    links = await sql`
      SELECT * FROM share_links WHERE team_id = ${me.teamId} ORDER BY created_at DESC`;
  } catch {
    return NextResponse.json({ links: [], theme: normalizeTheme(null), notMigrated: true });
  }

  let theme = normalizeTheme(null);
  try {
    const [t] = await sql`SELECT share_theme, name FROM teams WHERE id = ${me.teamId}`;
    theme = normalizeTheme(t?.share_theme);
    if (!theme.businessName) theme.businessName = t?.name ?? '';
  } catch { /* column not migrated yet */ }

  return NextResponse.json({ links: links.map(mapRow), theme });
}

export async function POST(request: Request) {
  const me = await spravce();
  if (jeOdpoved(me)) return me;

  const b = await request.json();
  const kind = b.kind === 'guides' ? 'guides' : 'inventory';
  const rawCat = Number(b.categoryId);
  const categoryId = Number.isFinite(rawCat) && rawCat > 0 ? rawCat : null;
  const excluded = normalizeExcluded(b.excluded);
  const title = b.title ? String(b.title).trim().slice(0, 120) || null : null;
  const note = b.note ? String(b.note).trim().slice(0, 500) || null : null;
  // Zveřejnit jde jen to, co člověk sám smí vidět — jinak by si sdíleným
  // odkazem otevřel sklad nebo návody, ke kterým v aplikaci nemá přístup.
  const potreba = kind === 'guides' ? 'navody.zobrazit' : 'sklad.zobrazit';
  if (!me.opr.has(potreba)) {
    return NextResponse.json({ error: 'Sdílet můžeš jen to, co sám smíš vidět.' }, { status: 403 });
  }

  try {

  // Free plan: one active link is included; more (and theming) is Pro.
  if (PLAN_ENFORCED && LIMITS.free.shareLinks != null) {
    const plan = await teamPlan(sql, me.teamId);
    if (plan.effective === 'free') {
      try {
        const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM share_links WHERE team_id = ${me.teamId} AND enabled = TRUE`;
        if ((n ?? 0) >= LIMITS.free.shareLinks) {
          return NextResponse.json({ error: SHARE_LIMIT_MSG }, { status: 403 });
        }
      } catch { /* table missing — nothing to limit */ }
    }
  }
    const [row] = await sql`
      INSERT INTO share_links (team_id, token, kind, category_id, excluded, title, note, created_by)
      VALUES (${me.teamId}, ${makeToken()}, ${kind}, ${categoryId},
              ${JSON.stringify(excluded)}::jsonb, ${title}, ${note}, ${me.meId})
      RETURNING *`;
    return NextResponse.json({ ok: true, link: mapRow(row) });
  } catch {
    return NextResponse.json({ error: 'Sdílení není dostupné — spusť /api/init.' }, { status: 400 });
  }
}

// PATCH here saves the team-wide look of every share page.
export async function PATCH(request: Request) {
  const me = await spravce();
  if (jeOdpoved(me)) return me;

  const b = await request.json();
  const theme = normalizeTheme(b.theme);
  try {

  {
    const plan = await teamPlan(sql, me.teamId);
    if (PLAN_ENFORCED && plan.effective === 'free') {
      return NextResponse.json({ error: 'Vlastní vzhled sdílených stránek je součástí plánu Pro.' }, { status: 403 });
    }
  }
    await sql`UPDATE teams SET share_theme = ${JSON.stringify(theme)}::jsonb WHERE id = ${me.teamId}`;
    return NextResponse.json({ ok: true, theme });
  } catch {
    return NextResponse.json({ error: 'Vzhled sdílení není dostupný — spusť /api/init.' }, { status: 400 });
  }
}

async function teamPlan(sql: any, teamId: number) {
  try {
    const [row] = await sql`SELECT plan, plan_override, trial_ends_at FROM teams WHERE id = ${teamId}`;
    return planInfoOf(row);
  } catch { return planInfoOf(null); }
}
