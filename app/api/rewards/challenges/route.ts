import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { clenovePodniku } from '@/lib/tenant';
import { audit } from '@/lib/audit';
import { notifyUsers } from '@/lib/push';
import { pragueToday } from '@/lib/pragueTime';
import { cashDifference } from '@/lib/closing';
import { vycistiVyzvu, type MetrikaVyzvy, type Vyzva } from '@/lib/vyzvy';

// Týmové výzvy (kolo 8, R8-3): vedení vyhlásí společný cíl z hotových čísel podniku
// (uzávěrky bez manka / splněné úkoly / průměrné hodnocení hostů / tržba období), widget
// Výzva týdne ukáže postup, po splnění dostanou všichni oznámení a body. Vyhodnocuje se
// při každém načtení (GET), žádný cron navíc; splnění se zapíše jednou (splneno_at).
// Čtení každý člen i tablet; vyhlásit a smazat kdo nastavuje odměny (odmeny.nastaveni).

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

const radek = (r: any, hodnota: number): Vyzva => ({
  id: Number(r.id), nazev: String(r.nazev ?? ''), metrika: r.metrika, cil: Number(r.cil) || 0,
  od: String(r.od), do: String(r.do_dne), odmenaText: r.odmena_text ?? null,
  odmenaBody: r.odmena_body == null ? null : Number(r.odmena_body),
  splnenoAt: r.splneno_at ? (r.splneno_at instanceof Date ? r.splneno_at.toISOString() : String(r.splneno_at)) : null,
  hodnota,
});

/** Hodnota měřítka za období <od, do> — každé z hotových čísel podniku, bez migrace nula. */
async function hodnotaMetriky(teamId: number, metrika: MetrikaVyzvy, od: string, doDne: string): Promise<number> {
  try {
    if (metrika === 'ukoly') {
      const [r] = await sql`
        SELECT COUNT(*)::int AS n FROM tasks
        WHERE team_id = ${teamId} AND status = 'done' AND completed_at >= ${`${od}T00:00:00`}::timestamp AND completed_at < ${`${doDne}T00:00:00`}::timestamp + INTERVAL '1 day'`;
      return Number(r?.n) || 0;
    }
    if (metrika === 'hodnoceni_hostu') {
      const [r] = await sql`
        SELECT AVG(rating)::float AS p FROM client_reviews
        WHERE team_id = ${teamId} AND created_at >= ${`${od}T00:00:00`}::timestamp AND created_at < ${`${doDne}T00:00:00`}::timestamp + INTERVAL '1 day'`;
      return r?.p == null ? 0 : Math.round(Number(r.p) * 10) / 10;
    }
    if (metrika === 'trzba') {
      const [r] = await sql`
        SELECT COALESCE(SUM(COALESCE(cash_revenue, 0) + COALESCE(card_revenue, 0)), 0)::float AS s FROM cash_closings
        WHERE team_id = ${teamId} AND COALESCE(shift_date, date) >= ${od} AND COALESCE(shift_date, date) <= ${doDne} AND covered_by IS NULL`;
      return Math.round(Number(r?.s) || 0);
    }
    // Uzávěrky bez manka: rozdíl kasy ≥ 0 (stejný výpočet jako Uzávěrky — lib/closing.cashDifference).
    let tipsInDrawer = false;
    try { const [t] = await sql`SELECT tips_in_drawer FROM teams WHERE id = ${teamId}`; tipsInDrawer = t?.tips_in_drawer === true; } catch { /* starší schéma */ }
    const rows = await sql`
      SELECT * FROM cash_closings
      WHERE team_id = ${teamId} AND COALESCE(shift_date, date) >= ${od} AND COALESCE(shift_date, date) <= ${doDne} AND covered_by IS NULL`;
    return (rows as any[]).filter(r => cashDifference({ ...r, tips_in_drawer: tipsInDrawer }) >= 0).length;
  } catch { return 0; }
}

/** Splnění: zapsat jednou, připsat body všem lidem podniku a dát vědět. */
async function splnit(teamId: number, v: Vyzva, dnes: string) {
  const done = await sql`UPDATE reward_challenges SET splneno_at = NOW() WHERE id = ${v.id} AND team_id = ${teamId} AND splneno_at IS NULL RETURNING id`;
  if (!done.length) return;
  const lide = await clenovePodniku(teamId, { role: 'lide' });
  if (v.odmenaBody && v.odmenaBody > 0) {
    for (const l of lide) {
      try {
        await sql`
          INSERT INTO point_awards (team_id, user_id, points, reason, given_by, kind, auto_key)
          VALUES (${teamId}, ${l.id}, ${v.odmenaBody}, ${`Výzva splněna: ${v.nazev}`}, NULL, 'vyzva', ${`vyzva:${v.id}`})
          ON CONFLICT (team_id, user_id, auto_key) WHERE auto_key IS NOT NULL DO NOTHING`;
      } catch { /* bez migrace bodů — oznámení přesto odejde */ }
    }
  }
  audit(teamId, null, 'vyzva.splnena', 'reward_challenge', v.id, `${v.nazev} · ${v.hodnota} / ${v.cil} · ${dnes}`);
  try {
    await notifyUsers(lide.map(l => l.id), {
      title: `🏆 Výzva splněna: ${v.nazev}`,
      body: [v.odmenaText, v.odmenaBody ? `+${v.odmenaBody} bodů každému` : null].filter(Boolean).join(' · ') || 'Společný cíl je za námi.',
      type: 'success',
      link: '/employee/shifts?view=rewards',
    });
  } catch { /* best-effort */ }
}

// GET → { vyzvy } — běžící a skončené do 60 dnů zpět, s dopočítanou hodnotou; splnění se zapíše tady.
export async function GET() {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  const dnes = pragueToday();
  let rows: any[] = [];
  try {
    rows = await sql`
      SELECT id, nazev, metrika, cil, od, do_dne, odmena_text, odmena_body, splneno_at FROM reward_challenges
      WHERE team_id = ${c.teamId} AND do_dne >= ${pragueToday(-60)}
      ORDER BY do_dne ASC, id DESC LIMIT 20`;
  } catch { return NextResponse.json({ vyzvy: [], notMigrated: true }); }
  const vyzvy: Vyzva[] = [];
  for (const r of rows) {
    const doKdy = String(r.do_dne) < dnes ? String(r.do_dne) : dnes;
    const hodnota = String(r.od) > dnes ? 0 : await hodnotaMetriky(c.teamId, r.metrika, String(r.od), doKdy);
    const v = radek(r, hodnota);
    if (!v.splnenoAt && hodnota >= v.cil && v.od <= dnes) {
      try { await splnit(c.teamId, v, dnes); v.splnenoAt = new Date().toISOString(); } catch { /* příště */ }
    }
    vyzvy.push(v);
  }
  return NextResponse.json({ vyzvy });
}

// POST { nazev, metrika, cil, od, do, odmenaText?, odmenaBody? } → { vyzva } (odmeny.nastaveni)
export async function POST(req: NextRequest) {
  const c = await pozaduj('odmeny.nastaveni');
  if (jeOdpoved(c)) return c;
  const v = vycistiVyzvu(await req.json().catch(() => ({})));
  if (!v.ok) return NextResponse.json({ error: v.chyba }, { status: 400 });
  const n = v.vyzva;
  let row: any;
  try {
    [row] = await sql`
      INSERT INTO reward_challenges (team_id, nazev, metrika, cil, od, do_dne, odmena_text, odmena_body, created_by)
      VALUES (${c.teamId}, ${n.nazev}, ${n.metrika}, ${n.cil}, ${n.od}, ${n.do}, ${n.odmenaText}, ${n.odmenaBody}, ${c.meId})
      RETURNING id, nazev, metrika, cil, od, do_dne, odmena_text, odmena_body, splneno_at`;
  } catch {
    return NextResponse.json({ error: 'Výzvu se nepodařilo uložit — databáze ji ještě nezná (spusť /api/init).' }, { status: 503 });
  }
  audit(c.teamId, c.meId, 'vyzva.vyhlasit', 'reward_challenge', Number(row.id), `${n.nazev} · ${n.metrika} ${n.cil} · ${n.od}–${n.do}`);
  // Tým se o výzvě dozví hned — cíl bez publika nikoho nerozhýbe.
  try {
    const lide = (await clenovePodniku(c.teamId, { role: 'lide' })).map(l => l.id).filter(id => id !== c.meId);
    await notifyUsers(lide, {
      title: `🎯 Nová výzva: ${n.nazev}`,
      body: [n.odmenaText, n.odmenaBody ? `+${n.odmenaBody} bodů každému` : null].filter(Boolean).join(' · ') + ` · do ${n.do}`,
      type: 'info',
      link: '/employee/shifts?view=rewards',
    });
  } catch { /* best-effort */ }
  return NextResponse.json({ vyzva: radek(row, 0) });
}

// DELETE ?id= (odmeny.nastaveni) — zrušení výzvy; připsané body za splněnou zůstávají.
export async function DELETE(req: NextRequest) {
  const c = await pozaduj('odmeny.nastaveni');
  if (jeOdpoved(c)) return c;
  const id = parseInt(req.nextUrl.searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Chybí id.' }, { status: 400 });
  try {
    const done = await sql`DELETE FROM reward_challenges WHERE id = ${id} AND team_id = ${c.teamId} RETURNING nazev`;
    if (!done.length) return NextResponse.json({ error: 'Výzva nenalezena.' }, { status: 404 });
    audit(c.teamId, c.meId, 'vyzva.smazat', 'reward_challenge', id, String(done[0].nazev ?? ''));
  } catch {
    return NextResponse.json({ error: 'Smazání se nepodařilo.' }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
