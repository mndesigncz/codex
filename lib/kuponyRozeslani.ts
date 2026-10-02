// Poslat kupon hostům: jednomu, skupině, nebo všem členům (včetně „uvítací kupon pro
// stávající členy"). Každý příjemce dostane vlastní kód a oznámení v aplikaci.
//
// Kus z limitu se bere atomicky (lib/kuponyKusy), kód vzniká jedním INSERT s podmínkou
// „host nedrží otevřený stejný kupon", takže dvojí odeslání (dvojklik, druhé zařízení)
// nepošle nikomu dva kódy. Co se nepovede, se vrátí a spočítá do `preskoceno`.

import { sql, couponCode } from './client';
import { notifyUser } from './push';
import { pragueToday } from './pragueTime';
import { duvodPreskoceni, kusyZbyva } from './kuponyPravidla';
import { rezervujKus, vratKus } from './kuponyKusy';
import type { Publikum } from './kuponyPublikum';

export type VysledekRozeslani = {
  /** Kolik hostů dostalo (nebo dostane — u zkoušky) kupon. */
  poslano: number;
  /** Kolik členů publikum celkem mělo. */
  celkem: number;
  preskoceno: { drzi: number; limit: number; neplnolety: number; kusy: number };
};

async function nactiHosty(teamId: number, couponId: number, pub: Publikum) {
  let ids: number[] | null = null;
  if (pub.druh === 'hoste') ids = pub.hostIds;
  if (pub.druh === 'skupina') {
    const g = await sql`SELECT customer_id FROM client_group_members WHERE team_id = ${teamId} AND group_id = ${pub.skupinaId}` as any[];
    ids = g.map(r => Number(r.customer_id));
  }
  if (ids && !ids.length) return [];
  // Jen členové tohoto podniku; počty vydaných a otevřených kódů jedním průchodem.
  return await sql`
    SELECT m.customer_id, us.birthday,
      (SELECT COUNT(*)::int FROM client_coupon_claims cl WHERE cl.coupon_id = ${couponId} AND cl.customer_id = m.customer_id) AS vzato,
      (SELECT COUNT(*)::int FROM client_coupon_claims cl WHERE cl.coupon_id = ${couponId} AND cl.customer_id = m.customer_id AND cl.redeemed_at IS NULL) AS drzi
    FROM client_memberships m JOIN users us ON us.id = m.customer_id
    WHERE m.team_id = ${teamId} AND (${ids === null}::boolean OR m.customer_id = ANY(${ids ?? []}))
    ORDER BY m.customer_id LIMIT 5000` as any[];
}

/**
 * Pošle kupon publiku. `zkouska` nic nezapíše a vrátí, kolik hostů by kupon dostalo
 * (náhled před odesláním). Kupon musí být zveřejněný: koncept ani archiv se nerozesílá.
 */
export async function posliKupon(
  teamId: number, kupon: any, pub: Publikum, opt: { zkouska: boolean; zprava?: string; slug?: string | null; ticho?: boolean },
): Promise<VysledekRozeslani> {
  const dnes = pragueToday();
  const hoste = await nactiHosty(teamId, Number(kupon.id), pub);
  const vys: VysledekRozeslani = { poslano: 0, celkem: hoste.length, preskoceno: { drzi: 0, limit: 0, neplnolety: 0, kusy: 0 } };
  let zbyva = kusyZbyva(kupon);
  for (const h of hoste) {
    const d = duvodPreskoceni(kupon, { drzi: Number(h.drzi), vzato: Number(h.vzato), birthday: h.birthday ?? null }, dnes);
    if (d) { vys.preskoceno[d] += 1; continue; }
    if (opt.zkouska) {
      if (zbyva != null) { if (zbyva <= 0) { vys.preskoceno.kusy += 1; continue; } zbyva -= 1; }
      vys.poslano += 1; continue;
    }
    if (!(await rezervujKus(Number(kupon.id)))) { vys.preskoceno.kusy += 1; continue; }
    let vlozeno: any[] = [];
    try {
      vlozeno = await sql`
        INSERT INTO client_coupon_claims (coupon_id, customer_id, team_id, code, source)
        SELECT ${kupon.id}, ${h.customer_id}, ${teamId}, ${couponCode()}, 'gift'
        WHERE NOT EXISTS (SELECT 1 FROM client_coupon_claims WHERE coupon_id = ${kupon.id} AND customer_id = ${h.customer_id} AND redeemed_at IS NULL)
        RETURNING id`;
    } catch { vlozeno = []; }
    if (!vlozeno.length) { await vratKus(Number(kupon.id)).catch(() => {}); vys.preskoceno.drzi += 1; continue; }
    vys.poslano += 1;
    // Oznámení je doplněk: když se nepošle, host kupon stejně najde v Moje → Kupony.
    if (!opt.ticho) notifyUser(Number(h.customer_id), {
      title: `Nový kupon: ${String(kupon.title).slice(0, 60)}`,
      body: (opt.zprava || '').trim().slice(0, 140) || 'Najdeš ho v Moje → Kupony.',
      link: opt.slug ? `/client/${opt.slug}?tab=loyalty` : '/client/me', type: 'success',
    }).catch(() => {});
  }
  return vys;
}
