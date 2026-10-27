import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { jeClenem, clenovePodniku } from '@/lib/tenant';
import { audit } from '@/lib/audit';
import { notifyUser } from '@/lib/push';
import { pragueToday } from '@/lib/pragueTime';
import { nastaveniDiku, overDik, zacatekMesice, zbyvaRozdat } from '@/lib/podekovani';
import { oslavy } from '@/lib/automatickeBody';
import { clenoveProOslavy } from '@/lib/automatickeBodyDb';

// Pochvaly s body (kolo 5 UX, vzor Bonusly / Connecteam „recognition"): vedení dá člověku body
// kdykoli s důvodem — ne až při hodnocení směny (to je jedno na den a nese hvězdy). Body se
// počítají do zůstatku stejně jako hodnocení (lib/pointsBalance → awards), zaměstnanec pochvalu
// vidí ve zpětné vazbě (GET /api/rewards → items kind 'award') a dostane oznámení.
// Kdo smí hodnotit směny (hodnoceni.hodnotit), smí i chválit; seznam vidí, kdo vidí hodnocení.
//
// Kolo 8 (R8-3, „Poděkuj kolegovi"): i zaměstnanec pošle kolegovi body — z měsíčního příspěvku
// (points_config.mesicniPrispevek, výchozí 50 b, 0 = vypnuto), 5 / 10 / 20 b, s hodnotou podniku
// (#ochota, #tým…) a jednou větou. Řádek má kind 'kolega' a value_tag; vedení dál 'vedeni'.
// Zeď díků (GET ?zed=1) vidí každý člen i tablet; kolik ještě můžu rozdat, jen osobní účet.

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

const MAX_BODU = 500;

export interface PochvalaRadek {
  id: number; userId: number; name: string; avatar: string | null;
  points: number; reason: string | null; givenBy: string | null; createdAt: string;
  kind?: string; valueTag?: string | null;
}

const radek = (r: any): PochvalaRadek => ({
  id: r.id, userId: r.user_id, name: String(r.name ?? ''), avatar: r.avatar ?? null,
  points: r.points ?? 0, reason: r.reason ?? null, givenBy: r.given_by ?? null,
  createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? ''),
  kind: r.kind ?? 'vedeni', valueTag: r.value_tag ?? null,
});

/** Nastavení poděkování z points_config (bez migrace výchozí). */
async function nastaveniPodniku(teamId: number) {
  try {
    const [t] = await sql`SELECT points_config FROM teams WHERE id = ${teamId}`;
    return nastaveniDiku(t?.points_config);
  } catch { return nastaveniDiku(null); }
}

/** Kolik bodů člověk tento měsíc rozdal kolegům (řádky kind 'kolega', které dal). */
async function rozdanoTentoMesic(teamId: number, meId: number): Promise<number> {
  try {
    const [r] = await sql`
      SELECT COALESCE(SUM(points), 0)::int AS n FROM point_awards
      WHERE team_id = ${teamId} AND given_by = ${meId} AND kind = 'kolega' AND created_at >= ${`${zacatekMesice(pragueToday())}T00:00:00`}::timestamp`;
    return Number(r?.n) || 0;
  } catch { return 0; }
}

// GET ?userId=&limit= → { awards: PochvalaRadek[] } — poslední pochvaly v podniku (nebo jednoho člověka).
// GET ?zed=1&limit= → { awards (jen od kolegů), prispevek: { mesicni, zbyva } | null, hodnoty, kolegove } — Zeď díků.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const limit = Math.max(1, Math.min(100, parseInt(q.get('limit') ?? '') || 30));
  // GET ?oslavy=1 → { oslavy } — narozeniny a výročí nástupu v týmu dnes a v příštích 7 dnech (kolo 8),
  // pro widget „Oslavy v týmu" na Přehledu, Domů a tabletu. Jen jména a den, žádný věk.
  if (q.get('oslavy') === '1') {
    const c = await pozaduj(null);
    if (jeOdpoved(c)) return c;
    const seznam = oslavy(await clenoveProOslavy(c.teamId), pragueToday(), 7);
    return NextResponse.json({ oslavy: seznam.map(o => ({ userId: o.id, name: o.name, avatar: o.avatar, druh: o.druh, den: o.den, zaDni: o.zaDni, roky: o.roky, ja: o.id === c.meId })) });
  }
  if (q.get('zed') === '1') {
    const c = await pozaduj(null);
    if (jeOdpoved(c)) return c;
    const n = await nastaveniPodniku(c.teamId);
    let awards: PochvalaRadek[] = [];
    try {
      const rows = await sql`
        SELECT a.id, a.user_id, a.points, a.reason, a.created_at, a.kind, a.value_tag, u.name, u.avatar, g.name AS given_by
        FROM point_awards a
        JOIN users u ON u.id = a.user_id
        LEFT JOIN users g ON g.id = a.given_by
        WHERE a.team_id = ${c.teamId} AND a.kind = 'kolega'
        ORDER BY a.created_at DESC LIMIT ${limit}`;
      awards = rows.map(radek);
    } catch { /* kind ještě není (migrace) — prázdná zeď */ }
    const osobni = c.role.typ !== 'kiosk';
    const prispevek = osobni && n.prispevek > 0 ? { mesicni: n.prispevek, zbyva: zbyvaRozdat(n.prispevek, await rozdanoTentoMesic(c.teamId, c.meId)) } : null;
    // Komu jde poděkovat: lidé podniku kromě mě (tablet nikomu — nemá komu „od").
    const kolegove = osobni ? (await clenovePodniku(c.teamId, { role: 'lide', krome: c.meId })).map(k => ({ id: k.id, name: k.name, avatar: k.avatar })) : [];
    return NextResponse.json({ awards, prispevek, hodnoty: n.hodnoty, kolegove });
  }

  const c = await pozaduj('hodnoceni.zobrazit');
  if (jeOdpoved(c)) return c;
  const userId = q.get('userId') ? parseInt(q.get('userId')!) : null;
  try {
    let rows: any[];
    try {
      rows = await sql`
        SELECT a.id, a.user_id, a.points, a.reason, a.created_at, a.kind, a.value_tag, u.name, u.avatar, g.name AS given_by
        FROM point_awards a
        JOIN users u ON u.id = a.user_id
        LEFT JOIN users g ON g.id = a.given_by
        WHERE a.team_id = ${c.teamId} AND (${userId}::int IS NULL OR a.user_id = ${userId})
        ORDER BY a.created_at DESC LIMIT ${limit}`;
    } catch {
      rows = await sql`
        SELECT a.id, a.user_id, a.points, a.reason, a.created_at, u.name, u.avatar, g.name AS given_by
        FROM point_awards a
        JOIN users u ON u.id = a.user_id
        LEFT JOIN users g ON g.id = a.given_by
        WHERE a.team_id = ${c.teamId} AND (${userId}::int IS NULL OR a.user_id = ${userId})
        ORDER BY a.created_at DESC LIMIT ${limit}`;
    }
    return NextResponse.json({ awards: rows.map(radek) });
  } catch {
    return NextResponse.json({ awards: [], notMigrated: true });
  }
}

// POST { userId, points, reason } → { award } (vedení s hodnoceni.hodnotit)
// POST { kind: 'kolega', userId, points: 5|10|20, valueTag?, reason? } → { award, zbyva } (kdokoli s osobním účtem)
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  if (b?.kind === 'kolega') return podekovat(b);
  const c = await pozaduj('hodnoceni.hodnotit');
  if (jeOdpoved(c)) return c;
  const userId = parseInt(b.userId);
  const points = Math.round(Number(b.points));
  const reason = String(b.reason ?? '').trim().slice(0, 200) || null;
  if (!Number.isFinite(userId)) return NextResponse.json({ error: 'Chybí člověk.' }, { status: 400 });
  if (!Number.isFinite(points) || points < 1 || points > MAX_BODU) {
    return NextResponse.json({ error: `Body musí být 1 až ${MAX_BODU}.` }, { status: 400 });
  }
  if (!(await jeClenem(userId, c.teamId))) return NextResponse.json({ error: 'Člověk není v podniku.' }, { status: 404 });
  let row: any;
  try {
    try {
      [row] = await sql`
        INSERT INTO point_awards (team_id, user_id, points, reason, given_by, kind)
        VALUES (${c.teamId}, ${userId}, ${points}, ${reason}, ${c.meId}, 'vedeni')
        RETURNING id, user_id AS "userId", points, reason, created_at AS "createdAt"`;
    } catch {
      [row] = await sql`
        INSERT INTO point_awards (team_id, user_id, points, reason, given_by)
        VALUES (${c.teamId}, ${userId}, ${points}, ${reason}, ${c.meId})
        RETURNING id, user_id AS "userId", points, reason, created_at AS "createdAt"`;
    }
  } catch {
    return NextResponse.json({ error: 'Pochvala se nepodařila uložit — databáze ještě není připravená.' }, { status: 503 });
  }
  audit(c.teamId, c.meId, 'points.award', 'user', userId, `+${points}${reason ? ` · ${reason}` : ''}`);
  try {
    await notifyUser(userId, {
      title: 'Pochvala od vedení',
      body: `+${points} bodů${reason ? ` — ${reason}` : ''}.`,
      type: 'success',
      link: '/employee/shifts?view=rewards',
    });
  } catch { /* best-effort */ }
  return NextResponse.json({ award: row });
}

/** Poděkování kolegovi z měsíčního příspěvku (kolo 8). */
async function podekovat(b: any) {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  if (c.role.typ === 'kiosk') return NextResponse.json({ error: 'Z tabletu poděkovat nejde — přihlas se vlastním účtem.' }, { status: 403 });
  const n = await nastaveniPodniku(c.teamId);
  const komu = parseInt(b.userId);
  const rozdano = await rozdanoTentoMesic(c.teamId, c.meId);
  const v = overDik({ od: c.meId, komu, body: Number(b.points), hodnota: b.valueTag, veta: b.reason }, n, rozdano);
  if (!v.ok) return NextResponse.json({ error: v.chyba }, { status: 400 });
  if (!(await jeClenem(komu, c.teamId))) return NextResponse.json({ error: 'Člověk není v podniku.' }, { status: 404 });
  let row: any;
  try {
    [row] = await sql`
      INSERT INTO point_awards (team_id, user_id, points, reason, given_by, kind, value_tag)
      VALUES (${c.teamId}, ${komu}, ${v.body}, ${v.veta}, ${c.meId}, 'kolega', ${v.hodnota})
      RETURNING id, user_id AS "userId", points, reason, created_at AS "createdAt", kind, value_tag AS "valueTag"`;
  } catch {
    return NextResponse.json({ error: 'Poděkování se teď nepodařilo uložit. Zkus to za chvíli znovu.' }, { status: 503 });
  }
  let jmeno = 'Kolega';
  try { const [u] = await sql`SELECT name FROM users WHERE id = ${c.meId}`; if (u?.name) jmeno = String(u.name); } catch { /* jen do oznámení */ }
  audit(c.teamId, c.meId, 'points.thanks', 'user', komu, `+${v.body}${v.hodnota ? ` #${v.hodnota}` : ''}${v.veta ? ` · ${v.veta}` : ''}`);
  try {
    await notifyUser(komu, {
      title: `Poděkování od ${jmeno}`,
      body: `+${v.body} bodů${v.hodnota ? ` #${v.hodnota}` : ''}${v.veta ? ` — ${v.veta}` : ''}.`,
      type: 'success',
      link: '/employee/shifts?view=rewards',
    });
  } catch { /* best-effort */ }
  return NextResponse.json({ award: row, zbyva: zbyvaRozdat(n.prispevek, rozdano + v.body) });
}

// DELETE ?id= — omyl se dá vzít zpět (body zmizí ze zůstatku, zapíše se do historie).
export async function DELETE(req: NextRequest) {
  const c = await pozaduj('hodnoceni.hodnotit');
  if (jeOdpoved(c)) return c;
  const id = parseInt(req.nextUrl.searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Chybí id.' }, { status: 400 });
  try {
    const done = await sql`DELETE FROM point_awards WHERE id = ${id} AND team_id = ${c.teamId} RETURNING id, user_id, points`;
    if (!done.length) return NextResponse.json({ error: 'Pochvala nenalezena.' }, { status: 404 });
    audit(c.teamId, c.meId, 'points.award_delete', 'user', Number(done[0].user_id), `${done[0].points}`);
  } catch {
    return NextResponse.json({ error: 'Smazání se nepodařilo.' }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
