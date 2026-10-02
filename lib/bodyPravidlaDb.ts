// Pravidla bodů — zápis a čtení v databázi. Čistá logika je v lib/bodyPravidla.ts.
//
// Sloupce se zajišťují i tady (ADD COLUMN IF NOT EXISTS při prvním použití), ať pravidla
// fungují dřív, než někdo po nasazení otevře /api/init. Stejné příkazy jsou v
// app/api/init/route.ts (blok „Body a úrovně"); odtud je čte kontrola SQL.

import { sql, award, awardCredit, ensureProfile } from './client';
import { tierForMember, tierRulesFromProfile } from './clientSlots';
import { upravUtratu } from './urovneDb';
import { audit } from './audit';
import { notifyUser } from './push';
import { pragueToday, pragueDayOf, parseDbTime } from './pragueTime';
import { planPropadani, normalizujDny, smiVarovat, denKratce } from './propadaniBodu';
import { czCount, czVerb, type CzNoun } from './czech';
import type { Bonus } from './bonusAkce';
import {
  spoctiOdmenu, pravidlaBoduZProfilu, vylouceneZProfilu, vylouceneSekceZProfilu, cenaVyloucenychPolozek, rozlisDenikKreditu,
  castStorna, oznameniPoklesu, type Odmena, type PravidlaBodu,
} from './bodyPravidla';

const BOD: CzNoun = { one: 'bod', few: 'body', many: 'bodů' };
const DEN: CzNoun = { one: 'den', few: 'dny', many: 'dní' };

let pripraveno: Promise<void> | null = null;

/** Zajistí sloupce pravidel bodů a neaktivity úrovní. Jednou za studený start. */
export function zajistiBodyPravidla(): Promise<void> {
  if (!pripraveno) {
    pripraveno = (async () => {
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS points_round TEXT NOT NULL DEFAULT 'sta'`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS points_min_spend INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS points_cap_per_bill INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS points_exclude_prepaid BOOLEAN NOT NULL DEFAULT TRUE`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS points_exclude_items JSONB NOT NULL DEFAULT '[]'`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS tier_inactive_months INTEGER NOT NULL DEFAULT 0`;
      // Rozšíření: strop za den, vyloučené kategorie nabídky, násobič podle úrovně, uvítací body, propadání kreditu.
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS points_cap_per_day INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS points_exclude_sections JSONB NOT NULL DEFAULT '[]'`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS mult_silver NUMERIC(4,2) NOT NULL DEFAULT 1`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS mult_gold NUMERIC(4,2) NOT NULL DEFAULT 1`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS mult_platinum NUMERIC(4,2) NOT NULL DEFAULT 1`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS welcome_points INTEGER`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS credit_expire_days INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS credit_expire_since TEXT`;
      // Přenesený zbytek pod 100 (zaokrouhlení „zbytek se přenáší“) a naposledy oznámené snížení úrovně člena.
      await sql`ALTER TABLE client_memberships ADD COLUMN IF NOT EXISTS spend_rest INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_memberships ADD COLUMN IF NOT EXISTS tier_seen TEXT`;
      // Co za účtenku host dostal a co se už vrátilo (storno zrušené nebo refundované účtenky).
      await sql`ALTER TABLE client_bill_awards ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_bill_awards ADD COLUMN IF NOT EXISTS credit INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_bill_awards ADD COLUMN IF NOT EXISTS spend INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_bill_awards ADD COLUMN IF NOT EXISTS rev_points INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_bill_awards ADD COLUMN IF NOT EXISTS rev_credit INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_bill_awards ADD COLUMN IF NOT EXISTS rev_spend INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_bill_awards ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMP`;
      await sql`ALTER TABLE client_bill_awards ADD COLUMN IF NOT EXISTS reversed_reason TEXT`;
    })().catch(e => { pripraveno = null; throw e; });
  }
  return pripraveno;
}

export interface VstupUctu {
  /** Část zaplacená kreditem nebo poukazem (od obsluhy). */
  predplaceno?: unknown;
  /** Položky účtu z Pokladny — z nich se odečtou vyloučené. */
  polozky?: { productId: string | null; amount: number; price: number | null }[];
}

/**
 * ID produktů v Pokladně, které podnik vyloučil z bodů: vybrané položky nabídky i všechny položky
 * vyloučených kategorií (sekcí nabídky). Chyba = nic nevyloučeno.
 */
async function vylouceneProdukty(teamId: number, profil: any): Promise<Set<string>> {
  const ids = vylouceneZProfilu(profil?.points_exclude_items).map(x => x.itemId);
  const sekce = vylouceneSekceZProfilu(profil?.points_exclude_sections).map(x => x.sectionId);
  if (!ids.length && !sekce.length) return new Set();
  try {
    const rows = await sql`
      SELECT mi.pos_product_id FROM menu_items mi
      JOIN menu_sections ms ON ms.id = mi.section_id
      JOIN menu_boards mb ON mb.id = ms.board_id AND mb.team_id = ${teamId}
      WHERE (mi.id = ANY(${ids}) OR ms.id = ANY(${sekce})) AND mi.pos_product_id IS NOT NULL` as any[];
    return new Set(rows.map(r => String(r.pos_product_id)));
  } catch {
    return new Set();
  }
}

/** Součet bodů z útrat za dnešní pražský den (pro strop za den). Storno z dnešních účtenek se odečte. */
async function bodyDnes(teamId: number, customerId: number): Promise<number> {
  try {
    const rows = await sql`
      SELECT delta, created_at FROM client_loyalty_ledger
      WHERE team_id = ${teamId} AND customer_id = ${customerId} AND delta <> 0
        AND created_at >= NOW() - INTERVAL '40 hours'
        AND ((kind IN ('manual', 'order') AND ref IS NOT NULL AND ref <> 'spend' AND ref NOT LIKE 'promo:%') OR kind = 'storno')` as any[];
    const dnes = pragueToday();
    let s = 0;
    for (const r of rows) { const d = parseDbTime(r.created_at); if (d && pragueDayOf(d) === dnes) s += Number(r.delta) || 0; }
    return Math.max(0, s);
  } catch { return 0; }
}

export interface VstupUctu {
  /** Část zaplacená kreditem nebo poukazem (od obsluhy nebo z rozpadu plateb). */
  predplaceno?: unknown;
  /** Položky účtu z Pokladny — z nich se odečtou vyloučené. */
  polozky?: { productId: string | null; amount: number; price: number | null }[];
  /** Host: z něj se bere úroveň (násobič), strop za den a přenesený zbytek. Bez hosta se tyhle věci neuplatní. */
  customerId?: number;
  /** Bonusová akce (Happy hour): násobič se uplatní uvnitř téhož výpočtu, ne potom. */
  bonus?: Bonus;
}

/**
 * Body a cashback z účtu podle pravidel podniku — jedno místo pro kasu i objednávky.
 * Bez nových nastavení vychází přesně dosavadní výpočet. S hostem (`customerId`) se navíc
 * uplatní násobič podle úrovně (vyšší z něj a z bonusové akce), strop za den a přenos zbytku.
 */
export async function odmenaZUctu(teamId: number, profil: any, castka: unknown, vstup: VstupUctu = {}): Promise<{ odmena: Odmena; pravidla: PravidlaBodu; poznamka: string }> {
  const pravidla = pravidlaBoduZProfilu(profil);
  let vylouceno = 0;
  if (vstup.polozky?.length) {
    const produkty = await vylouceneProdukty(teamId, profil);
    if (produkty.size) vylouceno = cenaVyloucenychPolozek(vstup.polozky, produkty);
  }
  let uroven = 'bronze'; let zbytek = 0; let dnesUzBodu = 0;
  if (vstup.customerId) {
    try {
      const [m] = await sql`SELECT visits, spend, last_visit_at, spend_rest FROM client_memberships WHERE customer_id = ${vstup.customerId} AND team_id = ${teamId}` as any[];
      if (m) {
        uroven = tierForMember({ visits: Number(m.visits ?? 0), spend: Number(m.spend ?? 0), lastVisitAt: m.last_visit_at }, tierRulesFromProfile(profil)).id;
        zbytek = Number(m.spend_rest ?? 0);
      }
    } catch { /* před migrací platí základní úroveň a bez zbytku */ }
    if (pravidla.capPerDay > 0) dnesUzBodu = await bodyDnes(teamId, vstup.customerId);
  }
  const odmena = spoctiOdmenu(castka, pravidla, {
    predplaceno: vstup.predplaceno, vylouceno, uroven, zbytek, dnesUzBodu,
    bonusNasobic: vstup.bonus?.nasobic, bonusNazev: vstup.bonus?.nazev,
  });
  return { odmena, pravidla, poznamka: odmena.nasobicPopis ? ` — ${odmena.nasobicPopis}` : '' };
}

/** Přenesený zbytek pod 100 (jen zaokrouhlení „zbytek se přenáší“); u jiných režimů se vynuluje. */
export async function zapisZbytek(teamId: number, customerId: number, pravidla: PravidlaBodu, odmena: Odmena): Promise<void> {
  try {
    await zajistiBodyPravidla();
    const prenos = pravidla.round === 'prenos';
    if (!prenos) { await sql`UPDATE client_memberships SET spend_rest = 0 WHERE customer_id = ${customerId} AND team_id = ${teamId} AND spend_rest <> 0`; return; }
    await sql`UPDATE client_memberships SET spend_rest = ${odmena.zbytekNovy} WHERE customer_id = ${customerId} AND team_id = ${teamId}`;
  } catch { /* zbytek je doplněk */ }
}

/** Co přesně se za účtenku připsalo: pro případné storno (zrušená nebo vrácená účtenka). */
export async function zapisPripsaneZaUctenku(teamId: number, billId: string, body: number, kredit: number, utrata: number): Promise<void> {
  try {
    await zajistiBodyPravidla();
    await sql`
      UPDATE client_bill_awards SET points = ${Math.max(0, body)}, credit = ${Math.max(0, kredit)}, spend = ${Math.max(0, Math.round(utrata))}
      WHERE team_id = ${teamId} AND bill_id = ${billId}`;
  } catch { /* bez toho se storno jen nespočítá */ }
}

// ---- Snížení úrovně po neaktivitě: oznámení ------------------------------------------------------

/**
 * Denní úloha: v podnicích se snížením po neaktivitě upozorní hosta, jehož úroveň právě klesla.
 * Postup nahoru oznamuje lib/urovnePostup.ts hned po návštěvě nebo útratě; pokles vzniká během
 * času, ne akcí, proto ho hlídá cron. Oznámení se pošle jednou (tier_seen = úroveň, o které host ví).
 */
export async function oznamPoklesyUrovni(): Promise<number> {
  let poslano = 0;
  try {
    await zajistiBodyPravidla();
    const profily = await sql`SELECT * FROM client_profiles WHERE enabled = TRUE AND loyalty_on = TRUE AND tier_inactive_months > 0` as any[];
    for (const p of profily) {
      const teamId = Number(p.team_id);
      try {
        const pravidla = tierRulesFromProfile(p);
        const [t] = await sql`SELECT name FROM teams WHERE id = ${teamId}` as any[];
        const clenove = await sql`SELECT customer_id, visits, spend, last_visit_at, tier_seen FROM client_memberships WHERE team_id = ${teamId} AND last_visit_at IS NOT NULL` as any[];
        for (const m of clenove) {
          const tier = tierForMember({ visits: Number(m.visits), spend: Number(m.spend), lastVisitAt: m.last_visit_at }, pravidla);
          const videl: string | null = m.tier_seen ?? null;
          if (!tier.reduced) { if (videl) await sql`UPDATE client_memberships SET tier_seen = NULL WHERE customer_id = ${m.customer_id} AND team_id = ${teamId} AND tier_seen IS NOT NULL`; continue; }
          if (videl === tier.id) continue;
          const zmena = await sql`
            UPDATE client_memberships SET tier_seen = ${tier.id}
            WHERE customer_id = ${m.customer_id} AND team_id = ${teamId} AND tier_seen IS NOT DISTINCT FROM ${videl}
            RETURNING customer_id` as any[];
          if (!zmena.length) continue;
          const o = oznameniPoklesu(tier.id, String(t?.name ?? 'podniku'));
          notifyUser(Number(m.customer_id), { title: o.title, body: o.body, link: p.slug ? `/client/${p.slug}` : '/client/me', type: 'info' }).catch(() => {});
          poslano++;
        }
      } catch { /* další podnik */ }
    }
  } catch { /* před migrací nic není */ }
  return poslano;
}

// ---- Storno účtenky -----------------------------------------------------------------------------------

/**
 * Účtenky připsané před touto verzí neukládaly, kolik za ně host dostal. Dopočítá se z deníku
 * (řádky s odkazem bill:<účtenka>) a z částky účtenky; hodnoty se zapíšou zpět a na objekt.
 */
async function doplnZDeniku(teamId: number, a: any): Promise<void> {
  if (Number(a.points) || Number(a.credit) || Number(a.spend)) return;
  try {
    const [s] = await sql`
      SELECT COALESCE(SUM(delta), 0)::int AS body, COALESCE(SUM(credit_delta), 0)::int AS kredit
      FROM client_loyalty_ledger
      WHERE team_id = ${teamId} AND ref = ${`bill:${a.bill_id}`} AND kind IN ('manual', 'cashback')` as any[];
    const [b] = await sql`SELECT final_price FROM pos_bills WHERE team_id = ${teamId} AND bill_id = ${a.bill_id}` as any[];
    a.points = Math.max(0, Number(s?.body) || 0); a.credit = Math.max(0, Number(s?.kredit) || 0); a.spend = Math.max(0, Math.round(Number(b?.final_price) || 0));
    await sql`UPDATE client_bill_awards SET points = ${a.points}, credit = ${a.credit}, spend = ${a.spend} WHERE team_id = ${teamId} AND bill_id = ${a.bill_id}`;
  } catch { /* bez toho se storno jen nespočítá */ }
}

export interface VysledekStorna { storno: number; body: number; kredit: number }

async function stornoJedne(teamId: number, customerId: number, body: number, kredit: number, utrata: number, ref: string, proc: string): Promise<void> {
  if (body > 0) await award(teamId, customerId, -body, 'storno', ref, proc);
  if (kredit > 0) await awardCredit(teamId, customerId, -kredit, 'storno', ref, proc);
  if (utrata > 0) await upravUtratu(teamId, customerId, -utrata).catch(() => null);
  if (body > 0 || kredit > 0) {
    const [pr] = await sql`SELECT slug FROM client_profiles WHERE team_id = ${teamId}` as any[];
    notifyUser(customerId, {
      title: 'Účtenka byla stornována',
      body: `Odečetli jsme ${[body > 0 ? czCount(body, BOD) : '', kredit > 0 ? `kredit ${kredit}` : ''].filter(Boolean).join(' a ')}, protože platba byla zrušena nebo vrácena.`,
      link: pr?.slug ? `/client/${pr.slug}` : '/client/me', type: 'info',
    }).catch(() => {});
  }
  audit(teamId, null, 'client.storno', 'client', customerId, `${proc}${body ? ` · −${czCount(body, BOD)}` : ''}${kredit ? ` · −${kredit} kreditu` : ''}`);
}

/**
 * Zrušená nebo refundovaná účtenka vezme zpět, co za ni host dostal. Storyous to hlásí dvěma
 * způsoby: původní účtenka dostane příznak refunded/deleted (celé storno), nebo vznikne opravná
 * účtenka se záporem a odkazem na původní (refundedBillIdentifier; může být i částečná, pak se
 * vrací poměrná část). Idempotentní: každé storno se provede nejvýš jednou (příznak v
 * client_bill_awards a ref storno:<účtenka> v deníku). Volá se po synchronizaci účtenek.
 */
export async function stornujUctenky(teamId: number): Promise<VysledekStorna> {
  const out: VysledekStorna = { storno: 0, body: 0, kredit: 0 };
  await zajistiBodyPravidla();
  // 1) Původní účtenka označená jako zrušená nebo refundovaná (a už dokončená: nedoběhlé připisování se nestornuje).
  const cela = await sql`
    SELECT a.bill_id, a.customer_id, a.points, a.credit, a.spend, a.rev_points, a.rev_credit, a.rev_spend, b.deleted
    FROM client_bill_awards a JOIN pos_bills b ON b.team_id = a.team_id AND b.bill_id = a.bill_id
    WHERE a.team_id = ${teamId} AND a.reversed_at IS NULL AND a.done_at IS NOT NULL AND (b.refunded = TRUE OR b.deleted = TRUE)
    LIMIT 200` as any[];
  for (const a of cela) {
    await doplnZDeniku(teamId, a);
    const proc = `Storno účtenky ${a.bill_id} (${a.deleted ? 'smazána v pokladně' : 'vrácena v pokladně'})`;
    const nasazeno = await sql`
      UPDATE client_bill_awards SET reversed_at = NOW(), reversed_reason = ${proc}
      WHERE team_id = ${teamId} AND bill_id = ${a.bill_id} AND reversed_at IS NULL RETURNING bill_id` as any[];
    if (!nasazeno.length) continue;
    const body = castStorna(Number(a.points), Number(a.rev_points), 1);
    const kredit = castStorna(Number(a.credit), Number(a.rev_credit), 1);
    const utrata = castStorna(Number(a.spend), Number(a.rev_spend), 1);
    await sql`UPDATE client_bill_awards SET rev_points = rev_points + ${body}, rev_credit = rev_credit + ${kredit}, rev_spend = rev_spend + ${utrata} WHERE team_id = ${teamId} AND bill_id = ${a.bill_id}`;
    await stornoJedne(teamId, Number(a.customer_id), body, kredit, utrata, `storno:${a.bill_id}`, proc);
    out.storno++; out.body += body; out.kredit += kredit;
  }
  // 2) Opravná účtenka se záporem: vrací se poměrná část (celá, když pokrývá celý původní účet).
  const opravne = await sql`
    SELECT r.bill_id AS opravna, r.final_price AS vraceno, a.bill_id, a.customer_id, a.points, a.credit, a.spend,
           a.rev_points, a.rev_credit, a.rev_spend, o.final_price AS puvodni
    FROM pos_bills r
    JOIN client_bill_awards a ON a.team_id = r.team_id AND a.bill_id = r.refunded_bill_id
    JOIN pos_bills o ON o.team_id = a.team_id AND o.bill_id = a.bill_id
    WHERE r.team_id = ${teamId} AND r.refunded_bill_id IS NOT NULL AND r.deleted = FALSE AND a.reversed_at IS NULL AND a.done_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM client_loyalty_ledger l WHERE l.team_id = r.team_id AND l.ref = 'storno:' || r.bill_id)
    LIMIT 200` as any[];
  for (const a of opravne) {
    await doplnZDeniku(teamId, a);
    const puvodni = Math.abs(Number(a.puvodni)) || Math.abs(Number(a.spend)) || 0;
    const podil = puvodni > 0 ? Math.min(1, Math.abs(Number(a.vraceno)) / puvodni) : 1;
    const body = castStorna(Number(a.points), Number(a.rev_points), podil);
    const kredit = castStorna(Number(a.credit), Number(a.rev_credit), podil);
    const utrata = castStorna(Number(a.spend), Number(a.rev_spend), podil);
    const proc = `Storno účtenky ${a.bill_id}: opravná účtenka ${a.opravna} (${Math.round(podil * 100)} %)`;
    const uplne = podil >= 0.999;
    await sql`
      UPDATE client_bill_awards SET rev_points = rev_points + ${body}, rev_credit = rev_credit + ${kredit}, rev_spend = rev_spend + ${utrata},
        reversed_at = ${uplne ? new Date().toISOString() : null}, reversed_reason = ${uplne ? proc : null}
      WHERE team_id = ${teamId} AND bill_id = ${a.bill_id}`;
    await stornoJedne(teamId, Number(a.customer_id), body, kredit, utrata, `storno:${a.opravna}`, proc);
    out.storno++; out.body += body; out.kredit += kredit;
  }
  return out;
}

// ---- Propadání kreditu ----------------------------------------------------------------------------------

/**
 * Denní úloha: v podnicích s nastaveným propadáním kreditu odepíše propadlý kredit (od nejstaršího,
 * nikdy víc než host má) a upozorní hosty týden předem. Idempotentní: odepsání má v deníku ref
 * cexp:<den>, upozornění cwarn:<den>.
 */
export async function propadniKredit(): Promise<{ expired: number; warned: number }> {
  const out = { expired: 0, warned: 0 };
  const dnes = pragueToday();
  let profily: any[];
  try {
    await zajistiBodyPravidla();
    profily = await sql`
      SELECT p.team_id, p.slug, p.credit_expire_days, p.credit_expire_since, COALESCE(t.name, 'podniku') AS team_name
      FROM client_profiles p LEFT JOIN teams t ON t.id = p.team_id
      WHERE p.enabled = TRUE AND p.loyalty_on = TRUE AND p.credit_expire_days > 0` as any[];
  } catch { return out; }
  for (const p of profily) {
    const teamId = Number(p.team_id);
    const dny = normalizujDny(p.credit_expire_days);
    try {
      const clenove = await sql`SELECT customer_id, credit FROM client_memberships WHERE team_id = ${teamId} AND credit > 0` as any[];
      for (const c of clenove) {
        const cid = Number(c.customer_id);
        try {
          const radky = await sql`
            SELECT credit_delta, kind, ref, created_at FROM client_loyalty_ledger
            WHERE team_id = ${teamId} AND customer_id = ${cid} AND (credit_delta <> 0 OR kind = 'expire') ORDER BY created_at, id` as any[];
          const { vstup, poslednVarovani, dnesUz } = rozlisDenikKreditu(radky, dnes);
          if (dnesUz) continue;
          const plan = planPropadani(vstup, Number(c.credit), dnes, dny, p.credit_expire_since);
          const link = p.slug ? `/client/${p.slug}?tab=loyalty` : '/client/me';
          if (plan.propadne > 0) {
            await awardCredit(teamId, cid, -plan.propadne, 'expire', `cexp:${dnes}`, `Propadnutí kreditu staršího než ${czCount(dny, DEN)}`);
            notifyUser(cid, { title: `Propadl ti kredit ${plan.propadne} u ${p.team_name}`, body: `Kredit se nepoužil do ${czCount(dny, DEN)}. Nový kredit ti zůstává.`, link, type: 'info' }).catch(() => {});
            out.expired++;
          } else if (plan.varovat > 0 && smiVarovat(poslednVarovani, dnes)) {
            await sql`
              INSERT INTO client_loyalty_ledger (team_id, customer_id, delta, credit_delta, kind, ref, note)
              VALUES (${teamId}, ${cid}, 0, 0, 'expire', ${`cwarn:${dnes}`}, ${`Upozornění: kredit ${plan.varovat} ${czVerb(plan.varovat, 'propadne', 'propadne')} ${denKratce(plan.varovatDo)}`})`;
            notifyUser(cid, { title: `Kredit ${plan.varovat} u ${p.team_name} brzy propadne`, body: `Utratíš ho u kasy do ${denKratce(plan.varovatDo)}.`, link, type: 'info' }).catch(() => {});
            out.warned++;
          }
        } catch { /* další člen */ }
      }
    } catch { /* další podnik */ }
  }
  return out;
}

/** Co čeká jednoho člena s kreditem: pro stránku podniku („Kredit 120 propadne do 12. 11.“). */
export async function planKreditu(teamId: number, customerId: number, profil: any): Promise<{ propadne: number; varovat: number; varovatDo: string | null; dny: number }> {
  const dny = normalizujDny(profil?.credit_expire_days);
  const nic = { propadne: 0, varovat: 0, varovatDo: null, dny };
  if (dny <= 0) return nic;
  try {
    const [m] = await sql`SELECT credit FROM client_memberships WHERE team_id = ${teamId} AND customer_id = ${customerId}`;
    if (!m || Number(m.credit) <= 0) return nic;
    const radky = await sql`
      SELECT credit_delta, kind, ref, created_at FROM client_loyalty_ledger
      WHERE team_id = ${teamId} AND customer_id = ${customerId} AND (credit_delta <> 0 OR kind = 'expire') ORDER BY created_at, id` as any[];
    const { vstup } = rozlisDenikKreditu(radky, pragueToday());
    return { ...planPropadani(vstup, Number(m.credit), pragueToday(), dny, profil?.credit_expire_since), dny };
  } catch { return nic; }
}
