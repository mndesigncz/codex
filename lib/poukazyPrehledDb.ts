// Dárkové poukazy: přehled závazku a měsíců, hromadné prodloužení platnosti, odeslání e-mailem
// a denní připomenutí konce platnosti. Čistá logika je v lib/poukazy.ts a lib/poukazyEmail.ts.
//
// Zásady (jako v lib/poukazyDb.ts):
//  · změny jsou JEDEN příkaz s podmínkou ve WHERE (žádné „načti, ověř, zapiš“),
//  · připomenutí se nejdřív „zabere“ (UPDATE ... WHERE expiry_*_at IS NULL RETURNING) a teprve potom
//    odešle, takže souběžné běhy cronu nepošlou totéž dvakrát; selhané odeslání se uvolní k dalšímu pokusu,
//  · měsíce jsou pražské (created_at je UTC bez zóny), ne UTC.

import { sql } from './client';
import { audit } from './audit';
import { pragueToday } from './pragueTime';
import { notifyUsers } from './push';
import { clenoveSOpravnenim } from './opravneniDb';
import { sendVoucherEmail, odkazovyZaklad } from './email';
import { czCount, czVerb, type CzNoun } from './czech';
import { formatMoney } from './money';
import { menaPodniku } from './menaPodniku';
import { emailPoukazu, emailPripominky } from './poukazyEmail';
import { zajistiTabulkyPoukazu, poukazPodleId, nactiLimity } from './poukazyDb';
import {
  slozPrehled, doplnMesice, posunMesice, posudProdlouzeni, PRIPOMENUTI_DNI, type SkupinaStavu, type RadekMesice, type PrehledZavazku, type MesicPrehledu, type LimityUplatneni,
} from './poukazy';

const POUKAZ: CzNoun = { one: 'poukaz', few: 'poukazy', many: 'poukazů' };
/** Okno „brzy propadne“ v přehledu (dnů). */
export const BRZY_PROPADNE_DNI = 30;

export interface PrehledPoukazu {
  prehled: PrehledZavazku & { brzyDni: number };
  mesice: MesicPrehledu[];
  limity: LimityUplatneni;
  currency: string;
}

/** Závazek (zůstatky platných poukazů), co brzy propadne, a prodané/uplatněné hodnoty po měsících (posledních 12). */
export async function prehledPoukazu(teamId: number, dnes: string): Promise<PrehledPoukazu> {
  await zajistiTabulkyPoukazu();
  const mena = (await menaPodniku(teamId)).currency;
  const mesicDnes = dnes.slice(0, 7);
  const prvniDen = `${posunMesice(mesicDnes, -11)}-01`;
  // Stav se v SQL určuje stejně jako v stavPoukazu: zrušený, vyčerpaný, propadlý, jinak platný.
  const [skupiny, brzy, prodano, uplatneno] = await Promise.all([
    sql`
      SELECT CASE WHEN status = 'void' THEN 'void' WHEN balance <= 0 THEN 'used'
                  WHEN valid_until IS NOT NULL AND valid_until < ${dnes}::date THEN 'expired' ELSE 'active' END AS stav,
             currency, COUNT(*)::int AS pocet, COALESCE(SUM(balance), 0)::bigint AS zustatek, COALESCE(SUM(value_amount), 0)::bigint AS hodnota
      FROM client_vouchers WHERE team_id = ${teamId} GROUP BY 1, 2` as unknown as Promise<any[]>,
    sql`
      SELECT COUNT(*)::int AS pocet, COALESCE(SUM(balance), 0)::bigint AS castka
      FROM client_vouchers
      WHERE team_id = ${teamId} AND status = 'active' AND balance > 0 AND currency = ${mena}
        AND valid_until BETWEEN ${dnes}::date AND ${dnes}::date + ${BRZY_PROPADNE_DNI}::int` as unknown as Promise<any[]>,
    sql`
      SELECT to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM') AS mesic,
             COALESCE(SUM(value_amount), 0)::bigint AS prodano, COUNT(*)::int AS pocet
      FROM client_vouchers
      WHERE team_id = ${teamId} AND currency = ${mena} AND created_at >= ${prvniDen}::date - 1
      GROUP BY 1` as unknown as Promise<any[]>,
    sql`
      SELECT to_char((u.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM') AS mesic,
             COALESCE(SUM(u.amount) FILTER (WHERE u.kind = 'use'), 0)::bigint AS uplatneno,
             COALESCE(SUM(u.amount) FILTER (WHERE u.kind = 'refund'), 0)::bigint AS vraceno
      FROM client_voucher_uses u JOIN client_vouchers v ON v.id = u.voucher_id AND v.team_id = u.team_id
      WHERE u.team_id = ${teamId} AND v.currency = ${mena} AND u.created_at >= ${prvniDen}::date - 1
      GROUP BY 1` as unknown as Promise<any[]>,
  ]);
  const radky = new Map<string, RadekMesice>();
  const vezmi = (m: string) => radky.get(m) ?? { mesic: m, prodano: 0, pocetProdanych: 0, uplatneno: 0, vraceno: 0 };
  for (const r of prodano) radky.set(String(r.mesic), { ...vezmi(String(r.mesic)), prodano: Number(r.prodano) || 0, pocetProdanych: Number(r.pocet) || 0 });
  for (const r of uplatneno) radky.set(String(r.mesic), { ...vezmi(String(r.mesic)), uplatneno: Number(r.uplatneno) || 0, vraceno: Number(r.vraceno) || 0 });
  const sk: SkupinaStavu[] = skupiny.map(r => ({ stav: r.stav, currency: String(r.currency), pocet: Number(r.pocet) || 0, zustatek: Number(r.zustatek) || 0, hodnota: Number(r.hodnota) || 0 }));
  return {
    prehled: { ...slozPrehled(sk, mena, { pocet: Number(brzy[0]?.pocet) || 0, castka: Number(brzy[0]?.castka) || 0 }), brzyDni: BRZY_PROPADNE_DNI },
    mesice: doplnMesice([...radky.values()], mesicDnes, 12),
    limity: await nactiLimity(teamId),
    currency: mena,
  };
}

// ---- Hromadné prodloužení -------------------------------------------------------------------

export type RozsahProdlouzeni = { ids: number[] } | { doDne: string; vcetnePropadlych: boolean };

/**
 * Prodlouží platnost poukazům jedním příkazem. Podmínka v SQL je totéž co `posudProdlouzeni`:
 * platný (nebo propadlý) poukaz se zůstatkem a s datem platnosti, jen na pozdější datum. Ostatní se přeskočí.
 * Poukaz dostane znovu nárok na připomenutí (příznaky poslaných připomenutí se vynulují).
 */
export async function prodlouzPoukazy(teamId: number, userId: number, dnes: string, novy: string, rozsah: RozsahProdlouzeni): Promise<{ prodlouzeno: number; preskoceno: number }> {
  await zajistiTabulkyPoukazu();
  let rows: any[];
  if ('ids' in rozsah) {
    rows = await sql`
      UPDATE client_vouchers SET valid_until = ${novy}::date, expiry_notified_at = NULL, expiry_mailed_at = NULL
      WHERE team_id = ${teamId} AND id = ANY(${rozsah.ids}::int[]) AND status = 'active' AND balance > 0
        AND valid_until IS NOT NULL AND valid_until < ${novy}::date
      RETURNING id` as any[];
  } else {
    rows = await sql`
      UPDATE client_vouchers SET valid_until = ${novy}::date, expiry_notified_at = NULL, expiry_mailed_at = NULL
      WHERE team_id = ${teamId} AND status = 'active' AND balance > 0
        AND valid_until IS NOT NULL AND valid_until < ${novy}::date AND valid_until <= ${rozsah.doDne}::date
        AND (${rozsah.vcetnePropadlych}::boolean OR valid_until >= ${dnes}::date)
      RETURNING id` as any[];
  }
  const pozadovano = 'ids' in rozsah ? rozsah.ids.length : rows.length;
  if (rows.length) await audit(teamId, userId, 'klient.poukaz.prodlouzeno', 'client_voucher', rows[0].id, `${czCount(rows.length, POUKAZ)}: platnost do ${novy}`);
  return { prodlouzeno: rows.length, preskoceno: Math.max(0, pozadovano - rows.length) };
}

/** Kolik poukazů by prodloužení zasáhlo (náhled před potvrzením; stejná podmínka jako prodlouzPoukazy). */
export async function nahledProdlouzeni(teamId: number, dnes: string, novy: string, doDne: string, vcetnePropadlych: boolean): Promise<{ pocet: number; castka: number }> {
  await zajistiTabulkyPoukazu();
  const [r] = await sql`
    SELECT COUNT(*)::int AS pocet, COALESCE(SUM(balance), 0)::bigint AS castka FROM client_vouchers
    WHERE team_id = ${teamId} AND status = 'active' AND balance > 0
      AND valid_until IS NOT NULL AND valid_until < ${novy}::date AND valid_until <= ${doDne}::date
      AND (${vcetnePropadlych}::boolean OR valid_until >= ${dnes}::date)` as any[];
  return { pocet: Number(r?.pocet) || 0, castka: Number(r?.castka) || 0 };
}

export { posudProdlouzeni };

// ---- Odeslání e-mailem -------------------------------------------------------------------------

/** E-mail do protokolu bez celé adresy: „j***@seznam.cz“. */
export function maskujEmail(e: string): string {
  const [u, d] = e.split('@');
  return d ? `${u.slice(0, 1)}***@${d}` : '***';
}

async function podnikProPoukaz(teamId: number): Promise<{ nazev: string; slug: string | null }> {
  try {
    const [r] = await sql`
      SELECT p.slug, COALESCE(NULLIF(t.share_theme->>'businessName', ''), t.name, 'Podnik') AS nazev
      FROM teams t LEFT JOIN client_profiles p ON p.team_id = t.id WHERE t.id = ${teamId}`;
    return { nazev: String(r?.nazev ?? 'Podnik'), slug: r?.slug ?? null };
  } catch { return { nazev: 'Podnik', slug: null }; }
}

export type VysledekOdeslani = { ok: true } | { ok: false; chyba: string; status: number };

/**
 * Pošle platný poukaz e-mailem obdarovanému (kód, hodnota, platnost, vzkaz) a poznamená si adresu a čas.
 * Zrušený, vyčerpaný ani propadlý poukaz se neposílá. Neúspěch odeslání se nezapisuje jako odeslané.
 */
export async function odesliPoukaz(teamId: number, userId: number, id: number, email: string, vzkaz: string | null, dnes: string): Promise<VysledekOdeslani> {
  const p = await poukazPodleId(teamId, id, dnes);
  if (!p) return { ok: false, chyba: 'Poukaz nenalezen.', status: 404 };
  if (p.stav !== 'active') return { ok: false, chyba: p.stav === 'void' ? 'Poukaz je zrušený.' : p.stav === 'used' ? 'Poukaz je už vyčerpaný.' : 'Platnost poukazu skončila. Nejdřív ji prodluž.', status: 409 };
  const podnik = await podnikProPoukaz(teamId);
  const obsah = emailPoukazu({
    podnik: podnik.nazev, kod: p.code, castka: p.balance, mena: p.currency, platnost: p.valid_until, komu: p.recipient_name, vzkaz, design: p.design,
    odkaz: podnik.slug ? `${odkazovyZaklad()}/client/${podnik.slug}?tab=loyalty` : null,
  });
  const r = await sendVoucherEmail(email, podnik.nazev, obsah);
  if (!r.sent) {
    console.error('[poukazy] odeslání e-mailem', r.error);
    return { ok: false, chyba: 'E-mail se nepodařilo odeslat. Zkontroluj adresu a zkus to za chvíli.', status: 502 };
  }
  await sql`UPDATE client_vouchers SET recipient_email = ${email}, sent_at = NOW(), expiry_mailed_at = NULL WHERE id = ${id} AND team_id = ${teamId}`;
  await audit(teamId, userId, 'klient.poukaz.odeslan', 'client_voucher', id, `${p.code}: poslán e-mailem na ${maskujEmail(email)}`);
  return { ok: true };
}

// ---- Denní připomenutí konce platnosti ----------------------------------------------------------

/**
 * Volá se z denního cronu (app/api/init/route.ts). Poukazy, kterým platnost skončí do PRIPOMENUTI_DNI dnů:
 *  · podnik dostane JEDNO oznámení za den (kolik poukazů a na kolik peněz), komu patří oprávnění poukazy.spravovat,
 *  · obdarovaný dostane e-mail, má-li uloženou adresu.
 * Každý poukaz se připomíná jednou za jednu platnost (po prodloužení znovu). Idempotentní i při souběhu.
 */
export async function pripomenPoukazy(dnes: string = pragueToday()): Promise<{ podniky: number; emaily: number; selhalo: number }> {
  const out = { podniky: 0, emaily: 0, selhalo: 0 };
  try { await zajistiTabulkyPoukazu(); } catch { return out; }

  // 1) Podnik: zabrat poukazy, pak oznámit po týmech.
  const zabrane = await sql`
    UPDATE client_vouchers SET expiry_notified_at = ${dnes}::date
    WHERE id IN (
      SELECT id FROM client_vouchers
      WHERE status = 'active' AND balance > 0 AND valid_until BETWEEN ${dnes}::date AND ${dnes}::date + ${PRIPOMENUTI_DNI}::int AND expiry_notified_at IS NULL
      LIMIT 2000)
      AND expiry_notified_at IS NULL
    RETURNING team_id, balance, currency` as any[];
  const poTymech = new Map<number, { pocet: number; castka: number; mena: string }>();
  for (const r of zabrane) {
    const t = Number(r.team_id);
    const cur = poTymech.get(t) ?? { pocet: 0, castka: 0, mena: String(r.currency) };
    cur.pocet++; cur.castka += Number(r.balance) || 0;
    poTymech.set(t, cur);
  }
  for (const [teamId, s] of poTymech) {
    try {
      const komu = await clenoveSOpravnenim(teamId, 'poukazy.spravovat');
      if (!komu.length) continue;
      await notifyUsers(komu, {
        title: `Brzy ${czVerb(s.pocet, 'propadne', 'propadnou')} ${czCount(s.pocet, POUKAZ)}`,
        body: `Celkem ${formatMoney(s.castka, s.mena)}. Prodluž platnost, nebo je připomeň obdarovaným.`,
        link: '/employer/overview?mode=client&tab=loyalty', type: 'info', category: 'general',
      });
      out.podniky++;
    } catch (e) { console.error('[poukazy] oznámení podniku', e); }
  }

  // 2) Obdarovaní: zabrat poukazy s adresou, odeslat, selhané uvolnit.
  const kPoslani = await sql`
    UPDATE client_vouchers SET expiry_mailed_at = ${dnes}::date
    WHERE id IN (
      SELECT id FROM client_vouchers
      WHERE status = 'active' AND balance > 0 AND recipient_email IS NOT NULL
        AND valid_until BETWEEN ${dnes}::date AND ${dnes}::date + ${PRIPOMENUTI_DNI}::int AND expiry_mailed_at IS NULL
      LIMIT 500)
      AND expiry_mailed_at IS NULL
    RETURNING id, team_id, code, balance, currency, to_char(valid_until, 'YYYY-MM-DD') AS valid_until, recipient_name, recipient_email, design` as any[];
  const podniky = new Map<number, { nazev: string; slug: string | null }>();
  for (const r of kPoslani) {
    const teamId = Number(r.team_id);
    try {
      if (!podniky.has(teamId)) podniky.set(teamId, await podnikProPoukaz(teamId));
      const pod = podniky.get(teamId)!;
      const zbyva = Math.round((Date.parse(`${r.valid_until}T12:00:00Z`) - Date.parse(`${dnes}T12:00:00Z`)) / 86400000);
      const obsah = emailPripominky({
        podnik: pod.nazev, kod: String(r.code), castka: Number(r.balance), mena: String(r.currency), platnost: r.valid_until, komu: r.recipient_name ?? null, design: r.design ?? null,
        odkaz: pod.slug ? `${odkazovyZaklad()}/client/${pod.slug}?tab=loyalty` : null, zbyvaDni: zbyva,
      });
      const v = await sendVoucherEmail(String(r.recipient_email), pod.nazev, obsah);
      if (v.sent) out.emaily++;
      else { out.selhalo++; await sql`UPDATE client_vouchers SET expiry_mailed_at = NULL WHERE id = ${Number(r.id)}`; }
    } catch (e) {
      out.selhalo++;
      console.error('[poukazy] připomenutí e-mailem', e);
      try { await sql`UPDATE client_vouchers SET expiry_mailed_at = NULL WHERE id = ${Number(r.id)}`; } catch { /* zkusí se zítra */ }
    }
  }
  return out;
}
