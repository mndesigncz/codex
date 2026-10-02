// Automatické „Chybíš nám“: hostovi, který přestal chodit, přijde jednou
// oznámení (a volitelně dárkové body). Pravidlo je v profilu podniku:
// reactivation_days (0 = vypnuto) a reactivation_points (0 = bez bodů).
//
// Volá se z denního cronu hned za awardBirthdays (app/api/init/route.ts).
// Idempotence jde přes deník bodů: řádek kind = 'reactivation' s klíčem
// react:<den poslední návštěvy> vznikne atomicky (INSERT … WHERE NOT EXISTS),
// takže opakované spuštění, souběžné cron běhy ani další den nepošlou
// stejnému hostovi tutéž zprávu dvakrát. Když host přijde a znovu odpadne,
// má jinou poslední návštěvu, tedy nový klíč a nárok na další zprávu.
// Oznámení respektuje nastavení hosta (ztlumené „novinky“, tiché hodiny)
// stejně jako zprávy členům: řeší to notifyUser.

import { sql } from './client';
import { notifyUser } from './push';
import { maDostatChybisNam, refChybisNam, textChybisNam, REAKTIVACE_OKNO_DNI } from './segmenty';

let pripraveno: Promise<void> | null = null;

/** Sloupce pravidla v profilu. Stejné příkazy jsou v app/api/init/route.ts. */
export function zajistiReaktivaci(): Promise<void> {
  if (!pripraveno) {
    pripraveno = (async () => {
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS reactivation_days INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS reactivation_points INTEGER NOT NULL DEFAULT 0`;
    })().catch(e => { pripraveno = null; throw e; });
  }
  return pripraveno;
}

/** Projde podniky se zapnutým pravidlem a pošle „Chybíš nám“. Vrací počet oslovených hostů. */
export async function odesliChybisNam(now: Date = new Date()): Promise<number> {
  await zajistiReaktivaci();
  const kandidati = await sql`
    SELECT m.customer_id, m.team_id, p.reactivation_days, p.reactivation_points, p.slug,
           COALESCE(t.name, 'u nás') AS team_name,
           to_char(m.last_visit_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_visit
    FROM client_memberships m
    JOIN client_profiles p ON p.team_id = m.team_id AND p.enabled = TRUE AND p.loyalty_on = TRUE AND p.reactivation_days > 0
    LEFT JOIN teams t ON t.id = m.team_id
    WHERE m.last_visit_at IS NOT NULL
      AND m.last_visit_at <= NOW() - make_interval(days => p.reactivation_days)
      AND m.last_visit_at > NOW() - make_interval(days => p.reactivation_days + ${REAKTIVACE_OKNO_DNI})
      AND NOT EXISTS (
        SELECT 1 FROM client_loyalty_ledger l
        WHERE l.team_id = m.team_id AND l.customer_id = m.customer_id AND l.kind = 'reactivation'
          AND l.ref = 'react:' || to_char(m.last_visit_at, 'YYYY-MM-DD'))
    LIMIT 2000` as any[];
  let n = 0;
  for (const r of kandidati) {
    const dni = Number(r.reactivation_days);
    // Stejné pravidlo jako v testech; SQL výš jen zúžil výběr.
    if (!maDostatChybisNam(r.last_visit, dni, now)) continue;
    try {
      const teamId = Number(r.team_id), customerId = Number(r.customer_id);
      const body = Math.max(0, Number(r.reactivation_points) || 0);
      const ref = refChybisNam(r.last_visit);
      const [zapis] = await sql`
        INSERT INTO client_loyalty_ledger (team_id, customer_id, delta, kind, ref, note)
        SELECT ${teamId}, ${customerId}, ${body}, 'reactivation', ${ref}, 'Chybíš nám'
        WHERE NOT EXISTS (
          SELECT 1 FROM client_loyalty_ledger l
          WHERE l.team_id = ${teamId} AND l.customer_id = ${customerId} AND l.kind = 'reactivation' AND l.ref = ${ref})
        RETURNING id`;
      if (!zapis) continue;
      if (body > 0) {
        await sql`UPDATE client_memberships SET points = points + ${body} WHERE team_id = ${teamId} AND customer_id = ${customerId}`;
      }
      const text = textChybisNam(String(r.team_name), dni, body);
      notifyUser(customerId, {
        ...text, link: r.slug ? `/client/${r.slug}?tab=loyalty` : '/client/me', type: 'info', category: 'novinky',
      }).catch(() => {});
      n++;
    } catch { /* další host; jedna chyba nesmí zastavit ostatní */ }
  }
  return n;
}
