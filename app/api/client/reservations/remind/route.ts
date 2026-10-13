// Kolo 8 (R8-7): denní připomínka rezervace hostovi s „Potvrdit / Zrušit".
//
// Host po potvrzení dřív nedostal nic; na rezervaci zapomněl a podnik se o volném stole
// dozvěděl pozdě (OpenTable proti no-show připomíná a chce potvrzení účasti). Ráno projde
// dnešní a zítřejší potvrzené rezervace hostů s účtem a pošle push (jen oznámení v aplikaci,
// žádné SMS) s odkazem na stránku podniku, kde host rezervaci potvrdí nebo zruší. Každá
// rezervace jednou (reminded_at); kdo už potvrdil (guest_confirmed_at), nic nedostane.
// Chráněno jako ostatní crony (checkCron, Authorization: Bearer $CRON_SECRET).
import { NextResponse } from 'next/server';
import { checkCron } from '@/lib/cronAuth';
import { sql } from '@/lib/client';
import { notifyUser } from '@/lib/push';
import { audit } from '@/lib/audit';
import { dayPlus, pragueHM, pragueToday } from '@/lib/pragueTime';
import { zpravaPripominky } from '@/lib/clientSlots';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** Nejvíc připomínek v jednom běhu (cron je denní; víc rezervací na den nemá ani velký podnik). */
const DAVKA = 2000;

export async function GET(request: Request) {
  const gate = checkCron(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const dnes = pragueToday();
  const zitra = dayPlus(dnes, 1);
  const ted = pragueHM();
  let rows: any[] = [];
  try {
    // Dnešní jen ty, které ještě nezačaly (cron běží ráno; rezervace zapsaná na 7:30 už proběhla).
    rows = await sql`
      SELECT r.id, r.team_id, r.customer_id, r.date, r.time, r.party, p.slug,
             COALESCE(NULLIF(t.share_theme->>'businessName', ''), t.name) AS business
      FROM client_reservations r
      JOIN teams t ON t.id = r.team_id
      LEFT JOIN client_profiles p ON p.team_id = r.team_id
      WHERE r.status = 'confirmed' AND r.customer_id IS NOT NULL
        AND r.reminded_at IS NULL AND r.guest_confirmed_at IS NULL
        AND ((r.date = ${dnes} AND r.time >= ${ted}) OR r.date = ${zitra})
      ORDER BY r.date, r.time
      LIMIT ${DAVKA}` as any[];
  } catch (e) {
    console.error('[rezervace] připomínky se nenačetly', e);
    return NextResponse.json({ ok: false, error: 'Připomínky se nenačetly.' }, { status: 500 });
  }
  let odeslano = 0;
  const poPodnicich = new Map<number, number>();
  for (const r of rows) {
    try {
      const zprava = zpravaPripominky({
        id: Number(r.id), datum: String(r.date), cas: String(r.time), osob: Number(r.party) || 1,
        podnik: String(r.business ?? 'podniku'), slug: r.slug ? String(r.slug) : null,
      }, dnes);
      // Ztlumená kategorie „rezervace a objednávky" vrátí false — připomínka se nepošle, ale neopakuje se.
      await notifyUser(Number(r.customer_id), { ...zprava, category: 'booking', tag: `rezervace-pripominka-${r.id}` });
      await sql`UPDATE client_reservations SET reminded_at = NOW() WHERE id = ${r.id}`;
      odeslano++;
      poPodnicich.set(Number(r.team_id), (poPodnicich.get(Number(r.team_id)) ?? 0) + 1);
    } catch (e) { console.error('[rezervace] připomínka', r.id, e); }
  }
  // Do protokolu podniku jednou za běh: kolik hostů dostalo připomínku.
  for (const [teamId, n] of poPodnicich) {
    await audit(teamId, null, 'rezervace.pripominka', 'client', null, `${n} ${n === 1 ? 'host dostal' : n < 5 ? 'hosté dostali' : 'hostů dostalo'} připomínku na ${dnes} a ${zitra}`);
  }
  return NextResponse.json({ ok: true, odeslano, dnes });
}
