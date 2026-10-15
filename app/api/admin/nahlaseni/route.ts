// Nahlášený obsah ze všech podniků pro správce platformy (eskalace, slib vyřízení do 24 hodin).
// Otevřená nahoře, nejstarší první (ta hoří); vyřízená za nimi, nejnovější první.
import { neon } from '@neondatabase/serverless';
import { requireSuperadmin } from '@/lib/superadminGate';
import { stavLhuty } from '@/lib/moderace';
import { odmitnuto, odpoved } from '../_odpoved';
export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: Request) {
  const g = await requireSuperadmin(request);
  if (!g.ok) return odmitnuto(g);
  return odpoved(async () => {
    // Oznámení z veřejného formuláře /nahlasit (DSA, spuštění balík G) nesou kontakt oznamovatele
    // a odkaz; před migrací těch sloupců se načtou bez nich.
    let web: Map<number, { reporterEmail: string | null; reporterJmeno: string | null; url: string | null }> = new Map();
    try {
      const w = await sql`SELECT id, reporter_email, reporter_name, content_url FROM content_reports WHERE kind = 'web' ORDER BY id DESC LIMIT 200` as Record<string, any>[];
      web = new Map(w.map(x => [Number(x.id), { reporterEmail: x.reporter_email ?? null, reporterJmeno: x.reporter_name ?? null, url: x.content_url ?? null }]));
    } catch { /* před migrací */ }
    try {
      const rows = await sql`
        SELECT r.id, r.team_id, t.name AS team_name, r.kind, r.reason, r.detail, r.snapshot, r.status,
               r.created_at, r.resolved_at, r.escalated_at,
               EXTRACT(EPOCH FROM (NOW() - r.created_at)) / 3600.0 AS stari_hodin,
               rep.name AS reporter_name, tgt.name AS reported_name
        FROM content_reports r
        LEFT JOIN teams t ON t.id = r.team_id
        LEFT JOIN users rep ON rep.id = r.reporter_id
        LEFT JOIN users tgt ON tgt.id = r.reported_user_id
        ORDER BY CASE r.status WHEN 'open' THEN 0 ELSE 1 END,
                 CASE WHEN r.status = 'open' THEN r.created_at END ASC,
                 r.created_at DESC
        LIMIT 200`;
      const nahlaseni = (rows as Record<string, any>[]).map(x => ({
        id: Number(x.id), teamId: x.team_id == null ? null : Number(x.team_id), teamName: x.team_name ?? null,
        kind: String(x.kind), reason: String(x.reason), detail: x.detail ?? null, snapshot: x.snapshot ?? null, status: String(x.status),
        createdAt: x.created_at ?? null, resolvedAt: x.resolved_at ?? null, escalatedAt: x.escalated_at ?? null,
        reporterName: x.reporter_name ?? null, reportedName: x.reported_name ?? null,
        lhuta: stavLhuty(String(x.status), x.stari_hodin == null ? null : Number(x.stari_hodin)),
        web: web.get(Number(x.id)) ?? null,
      }));
      return { nahlaseni, otevrenych: nahlaseni.filter(n => n.status === 'open').length };
    } catch {
      // Před migrací (sloupec escalated_at) nebo bez tabulky: prázdný seznam, ne pád správy.
      return { nahlaseni: [], otevrenych: 0 };
    }
  });
}
