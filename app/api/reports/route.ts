// Nahlášení uživatelského obsahu (zpráva v chatu, nápad) a pohled vedení na nahlášené.
// Apple 1.2 / Google Play UGC. Pravidla a texty jsou v lib/moderace.ts.
//
//  POST — kdokoli z podniku nahlásí zprávu ze svého vlákna nebo nápad svého podniku.
//  GET  — kdo smí odebírat členy (tym.odebrat) vidí nahlášené svého podniku.

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved, clenoveSOpravnenim } from '@/lib/opravneniDb';
import { notifyUsers } from '@/lib/push';
import { audit } from '@/lib/audit';
import { hit } from '@/lib/rateLimit';
import { platneNahlaseni, opisObsahu, nazevDuvodu } from '@/lib/moderace';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function POST(request: Request) {
  // Nahlásit smí každý člen podniku, ne jen ten, kdo smí chat nebo nápady používat
  // (hlášení neuškodí a chceme, aby šlo vždy).
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  const v = platneNahlaseni(await request.json().catch(() => ({})));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  // Zahlcení hlášením je taky zneužití; dvacet za hodinu poctivému stačí.
  const gate = await hit(`report:${c.meId}`, 20, 60 * 60);
  if (!gate.ok) return NextResponse.json({ error: 'Příliš mnoho hlášení. Zkuste to později.' }, { status: 429 });

  let teamId: number; let autorId: number | null; let opis: string;
  try {
    if (v.kind === 'zprava') {
      const [m] = await sql`
        SELECT m.id, m.sender_id, m.content, m.attachment_url, cv.team_id
        FROM chat_messages m JOIN conversations cv ON cv.id = m.conversation_id
        WHERE m.id = ${v.refId}`;
      if (!m) return NextResponse.json({ error: 'Zpráva už neexistuje.' }, { status: 404 });
      // Jen zprávu z vlákna, jehož je člen: cizí vlákno nejde nahlásit (ani se v něm zpráva číst).
      const [clen] = await sql`
        SELECT 1 AS ok FROM conversation_members cm JOIN chat_messages m ON m.conversation_id = cm.conversation_id
        WHERE m.id = ${v.refId} AND cm.user_id = ${c.meId} LIMIT 1`;
      if (!clen) return NextResponse.json({ error: 'Přístup odepřen' }, { status: 403 });
      if (Number(m.sender_id) === c.meId) return NextResponse.json({ error: 'Vlastní zprávu nahlásit nejde, můžete ji smazat.' }, { status: 400 });
      teamId = Number(m.team_id); autorId = Number(m.sender_id); opis = opisObsahu(m.content, m.attachment_url);
    } else {
      const [n] = await sql`SELECT id, author_id, title, content FROM suggestions WHERE id = ${v.refId} AND team_id = ${c.teamId}`;
      if (!n) return NextResponse.json({ error: 'Nápad už neexistuje.' }, { status: 404 });
      if (Number(n.author_id) === c.meId) return NextResponse.json({ error: 'Vlastní nápad nahlásit nejde.' }, { status: 400 });
      teamId = c.teamId; autorId = Number(n.author_id); opis = opisObsahu(`${n.title}: ${n.content ?? ''}`);
    }
    // Stejný člověk stejný obsah podruhé nenahlásí (a vedení nedostane dvě upozornění).
    const [uz] = await sql`SELECT id FROM content_reports WHERE reporter_id = ${c.meId} AND kind = ${v.kind} AND ref_id = ${v.refId} AND status = 'open' LIMIT 1`;
    if (uz) return NextResponse.json({ ok: true, duplicate: true });
    const [r] = await sql`
      INSERT INTO content_reports (team_id, reporter_id, reported_user_id, kind, ref_id, reason, detail, snapshot)
      VALUES (${teamId}, ${c.meId}, ${autorId}, ${v.kind}, ${v.refId}, ${v.reason}, ${v.detail}, ${opis})
      RETURNING id`;
    await audit(teamId, c.meId, 'nahlaseni.vytvoreno', 'content_report', Number(r.id), `${v.kind} · ${v.reason}`);
    // Vedení se dozví hned; upozornění je doplněk, hlášení už je uložené.
    try {
      const komu = (await clenoveSOpravnenim(teamId, 'tym.odebrat')).filter(id => id !== c.meId);
      if (komu.length) {
        await notifyUsers(komu, {
          title: 'Nahlášený obsah', body: `${nazevDuvodu(v.reason)}. Podívejte se do Nastavení, Nahlášený obsah.`,
          type: 'info', link: '/employer/overview?view=settings&tab=nahlaseni',
        });
      }
    } catch { /* upozornění je best-effort */ }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('nahlášení selhalo', e);
    return NextResponse.json({ error: 'Nahlášení se zatím nepodařilo uložit. Zkuste to znovu.' }, { status: 503 });
  }
}

export async function GET() {
  const c = await pozaduj('tym.odebrat');
  if (jeOdpoved(c)) return c;
  try {
    const rows = await sql`
      SELECT r.id, r.kind, r.ref_id AS "refId", r.reason, r.detail, r.snapshot, r.status, r.created_at AS "createdAt",
             r.resolved_at AS "resolvedAt",
             rep.name AS "reporterName", tgt.name AS "reportedName", r.reported_user_id AS "reportedUserId"
      FROM content_reports r
      LEFT JOIN users rep ON rep.id = r.reporter_id
      LEFT JOIN users tgt ON tgt.id = r.reported_user_id
      WHERE r.team_id = ${c.teamId}
      ORDER BY CASE r.status WHEN 'open' THEN 0 ELSE 1 END, r.created_at DESC
      LIMIT 100`;
    return NextResponse.json({ reports: rows });
  } catch {
    // před migrací tabulka není
    return NextResponse.json({ reports: [] });
  }
}
