// Propadání bodů v databázi: denní úloha a plán pro jednoho člena.
// Čistý výpočet je v lib/propadaniBodu.ts.
//
// Sloupce se zajišťují i tady (ADD COLUMN IF NOT EXISTS při prvním použití),
// ať nastavení jde uložit dřív, než někdo po nasazení otevře /api/init.
// Stejné příkazy jsou v app/api/init/route.ts (blok „Kolo 73“).
//
// Idempotence: propadnutí má v deníku ref `exp:<den>`, upozornění ref
// `warn:<den>` (řádek bez bodů, kind 'expire'). Opakované spuštění téhož dne
// nic neodepíše ani nepošle podruhé.

import { sql, award } from './client';
import { notifyUser } from './push';
import { pragueToday } from './pragueTime';
import { planPropadani, normalizujDny, rozlisDenik, smiVarovat, denKratce, type PlanPropadani } from './propadaniBodu';
import { czCount, czVerb, type CzNoun } from './czech';

const BOD: CzNoun = { one: 'bod', few: 'body', many: 'bodů' };
const DEN: CzNoun = { one: 'den', few: 'dny', many: 'dní' };

let pripraveno: Promise<void> | null = null;

/** Zajistí sloupce propadání v profilu. Jednou za studený start. */
export function zajistiPropadani(): Promise<void> {
  if (!pripraveno) {
    pripraveno = (async () => {
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS points_expire_days INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS points_expire_since TEXT`;
    })().catch(e => { pripraveno = null; throw e; });
  }
  return pripraveno;
}

/** Uloží dobu propadání. Při zapnutí (z 0 na víc) si pamatuje den zapnutí, od kdy se stáří bodů počítá. */
export async function ulozPropadani(teamId: number, dny: unknown): Promise<{ days: number; since: string | null }> {
  await zajistiPropadani();
  const n = normalizujDny(dny);
  const [cur] = await sql`SELECT points_expire_days, points_expire_since FROM client_profiles WHERE team_id = ${teamId}`;
  const bylo = normalizujDny(cur?.points_expire_days);
  const since = n <= 0 ? null : (bylo <= 0 || !cur?.points_expire_since ? pragueToday() : String(cur.points_expire_since));
  await sql`UPDATE client_profiles SET points_expire_days = ${n}, points_expire_since = ${since} WHERE team_id = ${teamId}`;
  return { days: n, since };
}

/**
 * Denní úloha: v podnicích s nastaveným propadáním odepíše propadlé body
 * a upozorní hosty, kterým body brzy propadnou. Volá se z denního cronu.
 */
export async function propadniBody(): Promise<{ expired: number; warned: number }> {
  const out = { expired: 0, warned: 0 };
  const dnes = pragueToday();
  let profily: any[];
  try {
    profily = await sql`
      SELECT p.team_id, p.slug, p.points_expire_days, p.points_expire_since, COALESCE(t.name, 'podniku') AS team_name
      FROM client_profiles p LEFT JOIN teams t ON t.id = p.team_id
      WHERE p.enabled = TRUE AND p.loyalty_on = TRUE AND p.points_expire_days > 0` as any[];
  } catch { return out; } // před migrací sloupec není
  for (const p of profily) {
    const teamId = Number(p.team_id);
    const dny = normalizujDny(p.points_expire_days);
    try {
      const clenove = await sql`SELECT customer_id, points FROM client_memberships WHERE team_id = ${teamId} AND points > 0` as any[];
      if (!clenove.length) continue;
      const denik = await sql`
        SELECT l.customer_id, l.delta, l.kind, l.ref, l.created_at
        FROM client_loyalty_ledger l
        JOIN client_memberships m ON m.team_id = l.team_id AND m.customer_id = l.customer_id AND m.points > 0
        WHERE l.team_id = ${teamId} AND (l.delta <> 0 OR l.kind = 'expire')
        ORDER BY l.customer_id, l.created_at, l.id` as any[];
      const podleClena = new Map<number, any[]>();
      for (const r of denik) {
        const k = Number(r.customer_id);
        const a = podleClena.get(k); if (a) a.push(r); else podleClena.set(k, [r]);
      }
      for (const c of clenove) {
        const cid = Number(c.customer_id);
        try {
          const { vstup, poslednVarovani, dnesUz } = rozlisDenik(podleClena.get(cid) ?? [], dnes);
          if (dnesUz) continue;
          const plan = planPropadani(vstup, Number(c.points), dnes, dny, p.points_expire_since);
          const link = p.slug ? `/client/${p.slug}?tab=loyalty` : '/client/me';
          if (plan.propadne > 0) {
            await award(teamId, cid, -plan.propadne, 'expire', `exp:${dnes}`, `Propadnutí bodů starších než ${czCount(dny, DEN)}`);
            notifyUser(cid, {
              title: `Propadlo ti ${czCount(plan.propadne, BOD)} u ${p.team_name}`,
              body: `Body se nepoužily do ${czCount(dny, DEN)}. Nové body ti zůstávají.`, link, type: 'info',
            }).catch(() => {});
            out.expired++;
          } else if (plan.varovat > 0 && smiVarovat(poslednVarovani, dnes)) {
            await sql`
              INSERT INTO client_loyalty_ledger (team_id, customer_id, delta, kind, ref, note)
              VALUES (${teamId}, ${cid}, 0, 'expire', ${`warn:${dnes}`}, ${`Upozornění: ${czCount(plan.varovat, BOD)} ${czVerb(plan.varovat, 'propadne', 'propadnou')} ${denKratce(plan.varovatDo)}`})`;
            notifyUser(cid, {
              title: `${czCount(plan.varovat, BOD)} u ${p.team_name} brzy ${czVerb(plan.varovat, 'propadne', 'propadnou')}`,
              body: `Využij je do ${denKratce(plan.varovatDo)} za kupon nebo odměnu.`, link, type: 'info',
            }).catch(() => {});
            out.warned++;
          }
        } catch { /* další člen; jeden problém nesmí zastavit ostatní */ }
      }
    } catch { /* další podnik */ }
  }
  return out;
}

/** Co čeká jednoho člena: pro stránku podniku („Propadne ti 40 bodů do 12. 11."). */
export async function planClena(teamId: number, customerId: number, profil: any): Promise<PlanPropadani & { dny: number }> {
  const dny = normalizujDny(profil?.points_expire_days);
  const nic = { propadne: 0, varovat: 0, varovatDo: null, dny };
  if (dny <= 0) return nic;
  try {
    const [m] = await sql`SELECT points FROM client_memberships WHERE team_id = ${teamId} AND customer_id = ${customerId}`;
    if (!m || Number(m.points) <= 0) return nic;
    const radky = await sql`
      SELECT delta, kind, ref, created_at FROM client_loyalty_ledger
      WHERE team_id = ${teamId} AND customer_id = ${customerId} AND (delta <> 0 OR kind = 'expire') ORDER BY created_at, id` as any[];
    const { vstup } = rozlisDenik(radky, pragueToday());
    // Ukazuje se i to, co by propadlo dnes: do rána cron odepíše, host to má vidět včas.
    const p = planPropadani(vstup, Number(m.points), pragueToday(), dny, profil?.points_expire_since);
    return { ...p, dny };
  } catch { return nic; }
}
