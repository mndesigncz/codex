// POST /api/invitations/:id/resend — pošle čekající pozvánku znovu (kolo 6, B3).
//
// E-mail s pozvánkou se ztratí ve spamu nebo ho pozvaný smaže; dřív zbývalo
// pozvánku zrušit a vytvořit novou (nový token, starý odkaz přestal platit).
// Teď jde tentýž odkaz poslat znovu — nejvýš jednou za 10 minut, aby se
// tlačítkem nedala zasypat cizí schránka. Limit se zapisuje atomicky
// (UPDATE … WHERE sent_at < NOW() − 10 min), takže dvě klepnutí naráz
// nepošlou dva e-maily. Když e-mail neodejde, čas se vrátí — další pokus
// nemá čekat deset minut kvůli chybě poštovní služby.

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { sendTeamInvitation } from '@/lib/email';
import { jazykPodniku } from '@/lib/i18n/jazykPozadavku';
import { audit } from '@/lib/audit';
import { parseDbTime } from '@/lib/pragueTime';
import { minutDoZnovu, ZNOVU_PO_MIN } from '@/lib/pozvanky';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await pozaduj('tym.pozvat');
  if (jeOdpoved(c)) return c;
  const id = parseInt((await params).id, 10);
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: 'Chybí id pozvánky' }, { status: 400 });
  const sql = neon(process.env.DATABASE_URL!);

  // Pozvánka tohohle podniku (aktivní podnik z databáze, ne z těla) a jen čekající.
  const [inv] = await sql`
    SELECT i.id, i.email, i.token, i.status, i.sent_at, t.name AS team_name
    FROM invitations i JOIN teams t ON t.id = i.team_id
    WHERE i.id = ${id} AND i.team_id = ${c.teamId}`;
  if (!inv) return NextResponse.json({ error: 'Pozvánka nenalezena' }, { status: 404 });
  if (inv.status !== 'pending') return NextResponse.json({ error: 'Pozvánka už není aktivní — přijatou nebo zrušenou znovu poslat nejde.' }, { status: 409 });

  // Zábor: zapíše nový čas jen tehdy, když od posledního odeslání uběhlo 10 minut.
  const [zabrano] = await sql`
    UPDATE invitations SET sent_at = NOW()
    WHERE id = ${id} AND team_id = ${c.teamId} AND status = 'pending'
      AND (sent_at IS NULL OR sent_at < NOW() - make_interval(mins => ${ZNOVU_PO_MIN}))
    RETURNING id`;
  if (!zabrano) {
    const n = Math.max(1, minutDoZnovu(parseDbTime(inv.sent_at)));
    return NextResponse.json({ error: `Pozvánka šla před chvílí, zkus to za ${n} min.`, zbyvaMin: n }, { status: 409 });
  }

  const [meRow] = await sql`SELECT name FROM users WHERE id = ${c.meId}`;
  const mail = await sendTeamInvitation(String(inv.email), String(inv.team_name ?? ''), String(meRow?.name ?? ''), String(inv.token), await jazykPodniku(c.teamId));
  if (!mail.sent) {
    // Neodešlo: čas vrátit, ať další pokus nečeká deset minut. Pozvánka i odkaz platí dál.
    try { await sql`UPDATE invitations SET sent_at = ${inv.sent_at ?? null} WHERE id = ${id} AND team_id = ${c.teamId}`; } catch { /* limit pak jen platí o chvíli déle */ }
    return NextResponse.json({
      error: mail.error ? 'E-mail s pozvánkou neodešel. Pošli odkaz sám, nebo to zkus za chvíli.' : 'E-mail není nastavený — pošli odkaz pozvánky sám.',
      emailError: mail.error,
    }, { status: 502 });
  }
  audit(c.teamId, c.meId, 'tym.pozvanka_znovu', 'invitation', id, String(inv.email));
  return NextResponse.json({ ok: true, emailSent: true });
}
