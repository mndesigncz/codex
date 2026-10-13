import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { pragueDayOf, parseDbTime } from '@/lib/pragueTime';
import { notifyUser } from '@/lib/push';
import { audit } from '@/lib/audit';
import { ODPOVED_MAX } from '@/lib/klientPrehled';

/** Pražský den hodnocení; prázdný, když čas z databáze nedává smysl. */
const dayOf = (v: any) => { const t = parseDbTime(v); return t ? pragueDayOf(t) : ''; };
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export async function GET() {
  const ctx = await pozaduj('zakaznici.recenze');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  // Kolo 8 (R8-7): s odpovědí podniku a stavem „vyřízeno". Před migrací sloupců (ADD COLUMN
  // běží v /api/init) se hodnocení načtou postaru, ať obrazovka nespadne.
  let reviews: any[];
  try {
    reviews = await sql`
      SELECT v.id, v.ref, v.rating, v.note, v.created_at, us.name AS customer_name,
             v.reply, v.replied_at, v.resolved_at, ru.name AS replied_by_name
      FROM client_reviews v JOIN users us ON us.id = v.customer_id LEFT JOIN users ru ON ru.id = v.replied_by
      WHERE v.team_id = ${u.team_id} ORDER BY v.created_at DESC LIMIT 200` as any[];
  } catch {
    reviews = await sql`
      SELECT v.id, v.ref, v.rating, v.note, v.created_at, us.name AS customer_name
      FROM client_reviews v JOIN users us ON us.id = v.customer_id
      WHERE v.team_id = ${u.team_id} ORDER BY v.created_at DESC LIMIT 200` as any[];
  }
  const [agg] = await sql`SELECT COUNT(*)::int AS n, ROUND(AVG(rating)::numeric, 2)::float AS avg FROM client_reviews WHERE team_id = ${u.team_id}` as any[];
  const dist = [1, 2, 3, 4, 5].map(r => reviews.filter(x => Number(x.rating) === r).length);

  // Kdo ten den obsluhoval. Slabé hodnocení bez jména směny se nedá s nikým
  // probrat — a dobré hodnocení se nedá nikomu pochválit. Bere se z docházky,
  // ne z rozvrhu: rozhoduje, kdo opravdu přišel.
  const days = Array.from(new Set(reviews.map(r => dayOf(r.created_at)).filter(Boolean)));
  const crew: Record<string, { name: string; avatar: string }[]> = {};
  if (days.length) {
    try {
      const rows = await sql`
        SELECT to_char((te.clock_in AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') AS day,
               us.name, us.avatar
        FROM time_entries te JOIN users us ON us.id = te.employee_id
        WHERE te.team_id = ${u.team_id}
          AND to_char((te.clock_in AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') = ANY(${days})
        GROUP BY 1, us.name, us.avatar
        ORDER BY 1` as any[];
      for (const r of rows) (crew[String(r.day)] ||= []).push({ name: String(r.name), avatar: String(r.avatar ?? '👤') });
    } catch { /* bez docházky se hodnocení zobrazí samo o sobě */ }
  }
  for (const r of reviews) r.crew = crew[dayOf(r.created_at)] ?? [];

  return NextResponse.json({ reviews, count: Number(agg?.n) || 0, avg: agg?.avg ?? null, dist });
}

/**
 * Kolo 8 (R8-7): odpověď hostovi a „vyřízeno". Slabé hodnocení přišlo oznámením, ale vyřídit
 * se v aplikaci nedalo (Google i TripAdvisor mají „Odpovědět" jako standard). Odpověď dostane
 * host oznámením a vidí ji v Moje stránka; „vyřízeno" je jen pro podnik (probráno se směnou).
 */
export async function PATCH(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.recenze');
  if (jeOdpoved(ctx)) return ctx;
  const teamId = ctx.teamId;
  const b = await req.json().catch(() => ({}));
  const id = parseInt(String(b?.id), 10);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Chybí hodnocení.' }, { status: 400 });
  const maOdpoved = b?.reply !== undefined;
  const maVyrizeno = b?.resolved !== undefined;
  if (!maOdpoved && !maVyrizeno) return NextResponse.json({ error: 'Napiš odpověď, nebo označ hodnocení jako vyřízené.' }, { status: 400 });
  const odpoved = maOdpoved ? String(b.reply ?? '').replace(/\s+\n/g, '\n').trim() : null;
  if (maOdpoved && !odpoved) return NextResponse.json({ error: 'Napiš odpověď hostovi.' }, { status: 400 });
  if (odpoved && odpoved.length > ODPOVED_MAX) return NextResponse.json({ error: `Odpověď může mít nejvýš ${ODPOVED_MAX} znaků.` }, { status: 400 });
  const vyrizeno = maVyrizeno ? b.resolved === true : null;
  const [v] = await sql`
    SELECT v.id, v.customer_id, v.rating, v.reply, v.resolved_at, COALESCE(NULLIF(t.share_theme->>'businessName', ''), t.name) AS business
    FROM client_reviews v JOIN teams t ON t.id = v.team_id WHERE v.id = ${id} AND v.team_id = ${teamId}` as any[];
  if (!v) return NextResponse.json({ error: 'Hodnocení nenalezeno.' }, { status: 404 });
  if (odpoved) {
    await sql`UPDATE client_reviews SET reply = ${odpoved}, replied_by = ${ctx.meId}, replied_at = NOW() WHERE id = ${id} AND team_id = ${teamId}`;
  }
  if (vyrizeno === true) await sql`UPDATE client_reviews SET resolved_at = COALESCE(resolved_at, NOW()) WHERE id = ${id} AND team_id = ${teamId}`;
  if (vyrizeno === false) await sql`UPDATE client_reviews SET resolved_at = NULL WHERE id = ${id} AND team_id = ${teamId}`;
  const [r] = await sql`SELECT id, reply, replied_at, resolved_at FROM client_reviews WHERE id = ${id} AND team_id = ${teamId}` as any[];
  if (odpoved) {
    await audit(teamId, ctx.meId, 'recenze.odpovedet', 'client', id, `${v.rating}/5 · ${odpoved.slice(0, 120)}`);
    notifyUser(Number(v.customer_id), {
      title: `${v.business} odpověděl na tvoje hodnocení`,
      body: odpoved.length > 140 ? `${odpoved.slice(0, 139)}…` : odpoved,
      link: '/client/me', type: 'info', category: 'general',
    }).catch(() => {});
  }
  if (vyrizeno !== null) await audit(teamId, ctx.meId, 'recenze.vyridit', 'client', id, vyrizeno ? `${v.rating}/5 · vyřízeno` : `${v.rating}/5 · znovu nevyřízené`);
  return NextResponse.json({ ok: true, review: r ?? null });
}
