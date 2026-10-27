// Host zadá promo kód podniku (stránka podniku i jedno pole „Mám kód“ v Odměnách, lib/klient/kod.ts).
//
// Pořadí kroků je navržené tak, aby nic nezůstalo napůl:
//  1) nic se nespotřebuje, dokud je jasné, že odměna hostovi nepatří (kupon s podmínkami
//     — úroveň, skupina, 18+, okno, limity — prochází stejnou claimBlocker jako vyzvednutí za body),
//  2) použití se zapíše (PK promo_uses hlídá „jednou na hosta") a počítadlo `uses` se zvýší
//     JEDNÍM UPDATE ... WHERE uses < max_uses, takže dva souběžní hosté nepřečerpají poslední kus,
//  3) odměna (kupon, body); když se cokoli po kroku 2 nepovede, použití i odměna se vrátí
//     a kód se hostovi nespotřebuje.
import { sql, join, membership, award, couponCode, jeClenBlokovan } from '../client';
import { pragueToday } from '../pragueTime';
import { tierForMember, tierRulesFromProfile } from '../clientSlots';
import { claimBlocker } from '../coupons';
import { rezervujKus, vratKus } from '../kuponyKusy';

async function vratPouziti(promoId: number, customerId: number) {
  await sql`DELETE FROM client_promo_uses WHERE promo_id = ${promoId} AND customer_id = ${customerId}`;
  await sql`UPDATE client_promos SET uses = GREATEST(0, uses - 1) WHERE id = ${promoId}`;
}

export type VysledekPromo = { status: number; body: { error: string } | { ok: true; title: string; points: number | null; coupon: string | null } };

/** Uplatní promo kód `kod` v podniku `p` (řádek profileBySlug). Brzdu pokusů řeší volající. */
export async function uplatniPromo(me: { id: number }, p: any, kod: string): Promise<VysledekPromo> {
  const code = String(kod ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const teamId = Number(p.team_id);
  const [promo] = await sql`SELECT * FROM client_promos WHERE code = ${code} AND team_id = ${teamId} AND active = TRUE`;
  if (!promo || (promo.valid_until && String(promo.valid_until) < pragueToday())) return { status: 404, body: { error: 'Tenhle kód neplatí.' } };
  await join(me.id, teamId);
  if (await jeClenBlokovan(teamId, me.id)) return { status: 403, body: { error: 'Tvůj účet je v tomhle podniku zablokovaný. Obrať se na obsluhu.' } };
  // Kupon z kódu: nesmí obejít podmínky, které by host měl při vyzvednutí za body.
  let kupon: any = null;
  if (promo.coupon_id) {
    [kupon] = await sql`SELECT * FROM client_coupons WHERE id = ${promo.coupon_id} AND team_id = ${teamId} AND kind = 'offer'`;
    // Kupon mezitím zmizel a kód nedává body: nemá co dát, tak se nespotřebuje.
    if (!kupon && !(Number(promo.points) > 0)) return { status: 409, body: { error: 'Odměna tohoto kódu už není k dispozici.' } };
    if (kupon) {
      const m = await membership(me.id, teamId);
      const tier = tierForMember({ visits: Number(m?.visits ?? 0), spend: Number(m?.spend ?? 0) }, tierRulesFromProfile(p));
      const [us] = await sql`SELECT birthday FROM users WHERE id = ${me.id}`;
      const blocked = await claimBlocker(kupon, teamId, me.id, { tierId: tier.id, birthday: us?.birthday ?? null });
      if (blocked) return { status: 400, body: { error: blocked } };
    }
  }
  const pouzito = await sql`INSERT INTO client_promo_uses (promo_id, customer_id) VALUES (${promo.id}, ${me.id}) ON CONFLICT DO NOTHING RETURNING promo_id`;
  if (!pouzito.length) return { status: 409, body: { error: 'Tenhle kód už jsi použil.' } };
  const rezervace = await sql`
    UPDATE client_promos SET uses = uses + 1
    WHERE id = ${promo.id} AND active = TRUE AND (max_uses IS NULL OR uses < max_uses)
    RETURNING id`;
  if (!rezervace.length) {
    await sql`DELETE FROM client_promo_uses WHERE promo_id = ${promo.id} AND customer_id = ${me.id}`;
    return { status: 409, body: { error: 'Kód už je vyčerpaný.' } };
  }
  let points: number | null = null;
  let coupon: string | null = null;
  let kusVzat = false;
  let kodKuponu: string | null = null;
  try {
    if (kupon) {
      if (!(await rezervujKus(Number(kupon.id)))) {
        await vratPouziti(Number(promo.id), me.id);
        return { status: 409, body: { error: 'Kupony z tohoto kódu už došly.' } };
      }
      kusVzat = true;
      const c = couponCode();
      await sql`INSERT INTO client_coupon_claims (coupon_id, customer_id, team_id, code, source) VALUES (${kupon.id}, ${me.id}, ${teamId}, ${c}, 'promo')`;
      kodKuponu = c;
    }
    if (Number(promo.points) > 0) points = await award(teamId, me.id, Number(promo.points), 'manual', `promo:${promo.code}`, `Promo kód ${promo.title}`);
    coupon = kodKuponu;
  } catch (e) {
    // Kompenzace: kód se hostovi nespotřebuje, kupon i kus se vrátí.
    if (kodKuponu) await sql`DELETE FROM client_coupon_claims WHERE code = ${kodKuponu} AND redeemed_at IS NULL`.catch(() => {});
    if (kusVzat) await vratKus(Number(kupon.id)).catch(() => {});
    await vratPouziti(Number(promo.id), me.id).catch(() => {});
    throw e;
  }
  return { status: 200, body: { ok: true, title: String(promo.title), points, coupon } };
}
