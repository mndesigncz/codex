// Body, úrovně a cashback v databázi: rozšířená pravidla s konceptem a verzemi,
// připsání odměny za útratu, storno při zrušené nebo refundované účtence,
// propadání kreditu, oznámení o změně úrovně a přehledy pro správu.
// Čistá logika je v lib/bodyPravidla.ts.
//
// Sloupce a tabulka se zajišťují i tady (ADD COLUMN / CREATE TABLE IF NOT EXISTS
// při prvním použití), ať věrnost funguje dřív, než někdo po nasazení otevře
// /api/init. Stejné příkazy jsou v app/api/init/route.ts (blok „Kolo 80: body“).
// Čtení při připisování je fail-open: když sloupce chybí, platí výchozí
// pravidla a body se připíšou jako dřív. Chyba tady nikdy neshodí připsání.

import { sql, award, awardCredit, ensureProfile, join, zajistiDenikUtrata } from './client';
import { tierForMember, tierRulesFromProfile } from './clientSlots';
import { pripisUtratu, upravUtratu } from './urovneDb';
import { audit } from './audit';
import { notifyUser } from './push';
import { pragueToday, pragueDayOf, parseDbTime, dayPlus } from './pragueTime';
import { planPropadani, normalizujDny, VAROVANI_DNI, smiVarovat, denKratce } from './propadaniBodu';
import { czCount, czVerb, type CzNoun } from './czech';
import type { Bonus } from './bonusAkce';
import {
  pravidlaZProfilu, vypocitejOdmenu, poznamkaOdmeny, normalizujRozsirena, porovnejPravidla, popisZmen, snimekPravidel,
  vyloucenaCastka, rozlisDenikKreditu, oznameniUrovne, zdrojBodu, castStorna, uvitaciBody,
  KLICE_ROZSIRENE, KLICE_VERZI, type PolozkaUctu, type RozsirenaPravidla, type ZmenaPravidla, type VysledekOdmeny,
} from './bodyPravidla';

const BOD: CzNoun = { one: 'bod', few: 'body', many: 'bodů' };
const DEN: CzNoun = { one: 'den', few: 'dny', many: 'dní' };

// ---- Schéma (lazy) -------------------------------------------------------------------

let pripraveno: Promise<void> | null = null;

/** Zajistí sloupce a tabulku verzí pravidel. Jednou za studený start. */
export function zajistiBodyPravidla(): Promise<void> {
  if (!pripraveno) {
    pripraveno = (async () => {
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS points_round TEXT NOT NULL DEFAULT 'floor100'`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS points_min_spend INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS points_cap_bill INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS points_cap_day INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS points_excl_credit BOOLEAN NOT NULL DEFAULT FALSE`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS loyalty_excl_products JSONB NOT NULL DEFAULT '[]'`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS loyalty_excl_categories JSONB NOT NULL DEFAULT '[]'`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS mult_silver NUMERIC(4,2) NOT NULL DEFAULT 1`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS mult_gold NUMERIC(4,2) NOT NULL DEFAULT 1`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS mult_platinum NUMERIC(4,2) NOT NULL DEFAULT 1`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS tier_inactive_days INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS credit_expire_days INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS credit_expire_since TEXT`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS welcome_points INTEGER`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS loyalty_draft JSONB`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS loyalty_draft_at TIMESTAMP`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS rules_version INTEGER NOT NULL DEFAULT 1`;
      await sql`ALTER TABLE client_memberships ADD COLUMN IF NOT EXISTS spend_rest INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_memberships ADD COLUMN IF NOT EXISTS tier_seen TEXT`;
      await sql`ALTER TABLE client_bill_awards ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_bill_awards ADD COLUMN IF NOT EXISTS credit INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_bill_awards ADD COLUMN IF NOT EXISTS spend INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_bill_awards ADD COLUMN IF NOT EXISTS rev_points INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_bill_awards ADD COLUMN IF NOT EXISTS rev_credit INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_bill_awards ADD COLUMN IF NOT EXISTS rev_spend INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_bill_awards ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMP`;
      await sql`ALTER TABLE client_bill_awards ADD COLUMN IF NOT EXISTS reversed_reason TEXT`;
      await sql`
        CREATE TABLE IF NOT EXISTS client_rule_versions (
          id SERIAL PRIMARY KEY,
          team_id INTEGER NOT NULL,
          version INTEGER NOT NULL,
          rules JSONB NOT NULL DEFAULT '{}',
          changes JSONB NOT NULL DEFAULT '[]',
          source TEXT NOT NULL DEFAULT 'form',
          note TEXT,
          changed_by INTEGER,
          created_at TIMESTAMP DEFAULT NOW()
        )`;
      await sql`CREATE INDEX IF NOT EXISTS client_rule_versions_team ON client_rule_versions (team_id, version)`;
      await zajistiDenikUtrata();
    })().catch(e => { pripraveno = null; throw e; });
  }
  return pripraveno;
}

// ---- Koncept a verze pravidel ---------------------------------------------------------

export interface VerzePravidel {
  id: number; version: number; created_at: string; changed_by: number | null; changed_by_name: string | null;
  source: string; note: string | null; changes: ZmenaPravidla[];
}

/** Rozšířená pravidla tak, jak platí (hodnoty sloupců). */
export function platnaRozsirena(p: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of KLICE_ROZSIRENE) out[k] = p?.[k];
  // Uvítací body bez nastavení = dřívější chování; formulář i porovnání mají vidět skutečné číslo.
  out.welcome_points = uvitaciBody(p);
  return out;
}

export interface StavPravidel {
  platna: Record<string, any>;
  koncept: Record<string, any> | null;
  konceptZmeny: ZmenaPravidla[];
  konceptOd: string | null;
  verze: number;
  verzeSeznam: VerzePravidel[];
  moznosti: { kategorie: string[]; produkty: { id: string; name: string; kategorie: string | null }[] };
}

/** Všechno, co potřebuje obrazovka rozšířených pravidel. */
export async function stavPravidel(teamId: number): Promise<StavPravidel> {
  await zajistiBodyPravidla();
  const p = await ensureProfile(teamId);
  const platna = platnaRozsirena(p);
  const koncept = p.loyalty_draft && typeof p.loyalty_draft === 'object' ? { ...platna, ...p.loyalty_draft } : null;
  let verzeSeznam: VerzePravidel[] = [];
  try { verzeSeznam = await seznamVerzi(teamId, 30); } catch { verzeSeznam = []; }
  let produkty: StavPravidel['moznosti']['produkty'] = [];
  try {
    const rows = await sql`SELECT product_id, name, category FROM pos_products WHERE team_id = ${teamId} AND active = TRUE ORDER BY name LIMIT 1500` as any[];
    produkty = rows.map(r => ({ id: String(r.product_id), name: String(r.name ?? ''), kategorie: r.category ? String(r.category) : null }));
  } catch { produkty = []; }
  const kategorie = Array.from(new Set(produkty.map(x => x.kategorie).filter((x): x is string => !!x))).sort((a, b) => a.localeCompare(b, 'cs'));
  return {
    platna, koncept,
    konceptZmeny: koncept ? porovnejPravidla(platna, koncept, KLICE_ROZSIRENE) : [],
    konceptOd: p.loyalty_draft_at ? new Date(parseDbTime(p.loyalty_draft_at) ?? Date.now()).toISOString() : null,
    verze: Number(p.rules_version) || 1, verzeSeznam, moznosti: { kategorie, produkty },
  };
}

export async function seznamVerzi(teamId: number, limit = 30): Promise<VerzePravidel[]> {
  await zajistiBodyPravidla();
  const rows = await sql`
    SELECT v.id, v.version, v.created_at, v.changed_by, v.source, v.note, v.changes, u.name AS changed_by_name
    FROM client_rule_versions v LEFT JOIN users u ON u.id = v.changed_by
    WHERE v.team_id = ${teamId} ORDER BY v.version DESC, v.id DESC LIMIT ${limit}` as any[];
  return rows.map(r => ({
    id: Number(r.id), version: Number(r.version), created_at: new Date(parseDbTime(r.created_at) ?? Date.now()).toISOString(),
    changed_by: r.changed_by != null ? Number(r.changed_by) : null, changed_by_name: r.changed_by_name ?? null,
    source: String(r.source ?? 'form'), note: r.note ?? null, changes: Array.isArray(r.changes) ? r.changes : [],
  }));
}

/** Uloží koncept (nic se tím nemění pro hosty). Vrací chybu validace, nebo nový stav. */
export async function ulozKoncept(teamId: number, raw: any): Promise<{ ok: true } | { ok: false; error: string }> {
  await zajistiBodyPravidla();
  const p = await ensureProfile(teamId);
  const zaklad = { ...platnaRozsirena(p), ...(p.loyalty_draft ?? {}) };
  const v = normalizujRozsirena(raw, zaklad);
  if (!v.ok) return v;
  await sql`UPDATE client_profiles SET loyalty_draft = ${JSON.stringify(v.value)}::jsonb, loyalty_draft_at = NOW() WHERE team_id = ${teamId}`;
  return { ok: true };
}

export async function zahodKoncept(teamId: number): Promise<void> {
  await zajistiBodyPravidla();
  await sql`UPDATE client_profiles SET loyalty_draft = NULL, loyalty_draft_at = NULL WHERE team_id = ${teamId}`;
}

/** Zapíše verzi (před/po) a pošle větu do historie změn. Chyba nikdy nezastaví ukládání. */
export async function zaznamenejVerzi(teamId: number, userId: number | null, zmeny: ZmenaPravidla[], snimek: Record<string, any>, source: string, note?: string | null): Promise<number | null> {
  if (!zmeny.length) return null;
  try {
    await zajistiBodyPravidla();
    const [v] = await sql`
      INSERT INTO client_rule_versions (team_id, version, rules, changes, source, note, changed_by)
      SELECT ${teamId}, COALESCE(MAX(version), 0) + 1, ${JSON.stringify(snimek)}::jsonb, ${JSON.stringify(zmeny)}::jsonb, ${source}, ${note ?? null}, ${userId}
      FROM client_rule_versions WHERE team_id = ${teamId}
      RETURNING version` as any[];
    const verze = Number(v?.version) || null;
    if (verze) await sql`UPDATE client_profiles SET rules_version = ${verze + 1} WHERE team_id = ${teamId}`;
    audit(teamId, userId, 'client.pravidla', 'client', null, popisZmen(zmeny, verze ?? undefined));
    return verze;
  } catch (e) {
    console.error('[vernost] verze pravidel se nezapsala', e);
    audit(teamId, userId, 'client.pravidla', 'client', null, popisZmen(zmeny));
    return null;
  }
}

/** Z formuláře základních pravidel (PUT profilu): porovná před a po, zapíše verzi. */
export async function zaznamenejZmenuProfilu(teamId: number, userId: number | null, pred: any, po: any): Promise<void> {
  const zmeny = porovnejPravidla(pred, po, KLICE_VERZI);
  if (!zmeny.length) return;
  await zaznamenejVerzi(teamId, userId, zmeny, snimekPravidel(po), 'form');
}

/** Použije koncept: platí hned pro další připsání. Vrací chybu, nebo seznam změn. */
export async function publikujKoncept(teamId: number, userId: number | null, note?: string | null): Promise<{ ok: true; zmeny: ZmenaPravidla[]; verze: number | null } | { ok: false; error: string }> {
  await zajistiBodyPravidla();
  const p = await ensureProfile(teamId);
  if (!p.loyalty_draft || typeof p.loyalty_draft !== 'object') return { ok: false, error: 'Není co použít. Nejdřív ulož koncept.' };
  const v = normalizujRozsirena(p.loyalty_draft, platnaRozsirena(p));
  if (!v.ok) return v;
  const n = v.value;
  const zmeny = porovnejPravidla(platnaRozsirena(p), n, KLICE_ROZSIRENE);
  // Zapnutí propadání kreditu si pamatuje den zapnutí (stáří se počítá od něj, nic se nesmaže zpětně).
  const bylo = Number(p.credit_expire_days) || 0;
  const since = n.credit_expire_days <= 0 ? null : (bylo <= 0 || !p.credit_expire_since ? pragueToday() : String(p.credit_expire_since));
  await sql`
    UPDATE client_profiles SET
      points_round = ${n.points_round}, points_min_spend = ${n.points_min_spend}, points_cap_bill = ${n.points_cap_bill},
      points_cap_day = ${n.points_cap_day}, points_excl_credit = ${n.points_excl_credit},
      loyalty_excl_products = ${JSON.stringify(n.loyalty_excl_products)}::jsonb, loyalty_excl_categories = ${JSON.stringify(n.loyalty_excl_categories)}::jsonb,
      mult_silver = ${n.mult_silver}, mult_gold = ${n.mult_gold}, mult_platinum = ${n.mult_platinum},
      tier_inactive_days = ${n.tier_inactive_days}, credit_expire_days = ${n.credit_expire_days}, credit_expire_since = ${since}, welcome_points = ${n.welcome_points},
      loyalty_draft = NULL, loyalty_draft_at = NULL
    WHERE team_id = ${teamId}`;
  const verze = await zaznamenejVerzi(teamId, userId, zmeny, { ...snimekPravidel(p), ...n }, 'koncept', note);
  return { ok: true, zmeny, verze };
}

/** Načte pravidla z minulé verze do konceptu (nic se nemění, dokud se koncept nepoužije). */
export async function verziDoKonceptu(teamId: number, verzeId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  await zajistiBodyPravidla();
  const [r] = await sql`SELECT rules FROM client_rule_versions WHERE team_id = ${teamId} AND id = ${verzeId}` as any[];
  if (!r) return { ok: false, error: 'Tuhle verzi neznáme.' };
  const rules = r.rules && typeof r.rules === 'object' ? r.rules : {};
  const jen: Record<string, any> = {};
  for (const k of KLICE_ROZSIRENE) if (rules[k] !== undefined) jen[k] = rules[k];
  if (!Object.keys(jen).length) return { ok: false, error: 'Tahle verze nemá rozšířená pravidla (změnily se jen základní hodnoty).' };
  return ulozKoncept(teamId, jen);
}

// ---- Připsání odměny za útratu ------------------------------------------------------------

export interface VstupPripisu {
  teamId: number;
  customerId: number;
  /** Řádek client_profiles. */
  profil: any;
  castka: number;
  /** Odkud útrata je: z účtenky, zadaná u kasy, z objednávky od stolu. */
  zdroj: 'bill' | 'card' | 'order';
  /** Odkaz do deníku (bill:ID, card, ord:ID). */
  ref: string;
  /** Začátek poznámky v deníku: „Útrata 450 Kč z účtenky“. */
  popis: string;
  polozky?: PolozkaUctu[];
  zaplacenoKreditem?: number;
  bonus: Bonus;
  money: (n: number) => string;
}

export interface VysledekPripisu {
  body: number; cashback: number;
  /** Nový zůstatek bodů, když se body připsaly. */
  points: number | null;
  /** Nový kredit, když se připsal. */
  credit: number | null;
  /** Věty pro obsluhu („+25 bodů (celkem 140)“). */
  casti: string[];
  vypocet: VysledekOdmeny;
}

/** Součet bodů z útrat za dnešní pražský den (pro strop za den). */
async function bodyDnes(teamId: number, customerId: number): Promise<number> {
  try {
    const rows = await sql`
      SELECT delta, created_at FROM client_loyalty_ledger
      WHERE team_id = ${teamId} AND customer_id = ${customerId} AND delta <> 0
        AND created_at >= NOW() - INTERVAL '40 hours'
        AND ((kind IN ('manual', 'order') AND ref IS NOT NULL AND ref <> 'spend') OR kind = 'storno')` as any[];
    const dnes = pragueToday();
    let s = 0;
    for (const r of rows) { const d = parseDbTime(r.created_at); if (d && pragueDayOf(d) === dnes) s += Number(r.delta) || 0; }
    return Math.max(0, s);
  } catch { return 0; }
}

/** Odečte vyloučené položky: kategorie produktů se berou z katalogu pokladny. */
export async function vylouceno(teamId: number, polozky: PolozkaUctu[], r: ReturnType<typeof pravidlaZProfilu>, celkem: number): Promise<number> {
  if (!polozky.length || (!r.exclProducts.length && !r.exclCategories.length)) return 0;
  let doplnene = polozky;
  try {
    const ids = Array.from(new Set(polozky.map(p => p.productId).filter((x): x is string => !!x)));
    if (ids.length) {
      const rows = await sql`SELECT product_id, category FROM pos_products WHERE team_id = ${teamId} AND product_id = ANY(${ids})` as any[];
      const kat = new Map(rows.map(x => [String(x.product_id), x.category ? String(x.category) : null]));
      doplnene = polozky.map(p => ({ ...p, kategorie: p.kategorie ?? (p.productId ? kat.get(p.productId) ?? null : null) }));
    }
  } catch { /* bez katalogu platí jen id produktu a kategorie z účtenky */ }
  return vyloucenaCastka(doplnene, r, celkem);
}

/**
 * Jediné místo, které z částky připíše body, cashback, útratu a razítko úrovně:
 * účtenka u kasy, částka zadaná u kasy i hotová objednávka od stolu. Pravidla
 * (minimum, vyloučení, zaokrouhlení, násobič, stropy) vyhodnotí
 * vypocitejOdmenu; do deníku jde i řádek bez bodů, když se nic nepřipsalo,
 * ať je vidět proč.
 */
export async function odmenZaUtratu(v: VstupPripisu): Promise<VysledekPripisu> {
  const { teamId, customerId, profil } = v;
  let profilNovy = profil;
  try {
    await zajistiBodyPravidla();
    profilNovy = await ensureProfile(teamId);
  } catch { /* před migrací platí pravidla z předaného profilu */ }
  const r = pravidlaZProfilu(profilNovy);
  await join(customerId, teamId);
  let m: any = null;
  try {
    [m] = await sql`SELECT visits, spend, last_visit_at, spend_rest FROM client_memberships WHERE customer_id = ${customerId} AND team_id = ${teamId}` as any[];
  } catch {
    [m] = await sql`SELECT visits, spend, last_visit_at FROM client_memberships WHERE customer_id = ${customerId} AND team_id = ${teamId}` as any[];
  }
  const tier = tierForMember({ visits: Number(m?.visits ?? 0), spend: Number(m?.spend ?? 0), lastVisitAt: m?.last_visit_at }, tierRulesFromProfile(profilNovy));
  const castka = Math.max(0, Math.round(Number(v.castka) || 0));
  const vyl = await vylouceno(teamId, v.polozky ?? [], r, castka);
  const vyp0 = vypocitejOdmenu({
    castka, vylouceno: vyl, zaplacenoKreditem: v.zaplacenoKreditem, uroven: tier.id,
    bonusNasobic: v.bonus.nasobic, bonusNazev: v.bonus.nazev,
    dnesUzBodu: r.capDay > 0 ? await bodyDnes(teamId, customerId) : 0, zbytek: Number(m?.spend_rest ?? 0),
  }, r);
  // Objednávka od stolu dává body, ale ne cashback: stejná útrata se u kasy načte z účtenky a vrátila by se podruhé.
  const vypocet: VysledekOdmeny = { ...vyp0, cashback: v.zdroj === 'order' ? 0 : vyp0.cashback };

  const casti: string[] = [];
  let points: number | null = null; let credit: number | null = null;
  const kindBody = v.zdroj === 'order' ? 'order' : 'manual';
  let amountPouzito = false;
  if (vypocet.body > 0) {
    points = await award(teamId, customerId, vypocet.body, kindBody, v.ref, poznamkaOdmeny(v.popis, vypocet), castka);
    amountPouzito = true;
    casti.push(`+${vypocet.body} bodů${vypocet.nasobicPopis ? ` (${vypocet.nasobicPopis})` : ''} (celkem ${points})`);
  }
  if (vypocet.cashback > 0) {
    const pct = Number(profilNovy.cashback_pct) || 0;
    const poz = `${pct} % z ${v.money(vypocet.zaklad)}`;
    if (profilNovy.cashback_mode === 'points') {
      points = await award(teamId, customerId, vypocet.cashback, 'cashback', v.ref, `${poz} v bodech`, amountPouzito ? null : castka);
      casti.push(`+${vypocet.cashback} bodů cashback (celkem ${points})`);
    } else {
      credit = await awardCredit(teamId, customerId, vypocet.cashback, 'cashback', v.ref, poz, amountPouzito ? null : castka);
      casti.push(`+${v.money(vypocet.cashback)} kreditu${v.zdroj === 'card' ? ` (celkem ${v.money(Number(credit))})` : ''}`);
    }
    amountPouzito = true;
  }
  if (!amountPouzito && castka > 0) {
    // Nic se nepřipsalo: do deníku řádek bez bodů, ať vedení vidí proč (minimum, vyloučení, strop).
    try {
      await zajistiDenikUtrata();
      await sql`
        INSERT INTO client_loyalty_ledger (team_id, customer_id, delta, kind, ref, note, amount)
        VALUES (${teamId}, ${customerId}, 0, ${kindBody}, ${v.ref}, ${poznamkaOdmeny(`${v.popis} — bez bodů`, vypocet)}, ${castka})`;
    } catch { /* deník je doplněk */ }
    if (vypocet.poznamky.length) casti.push(`bez bodů: ${vypocet.poznamky.join(', ')}`);
  } else if (vypocet.omezeno && vypocet.omezeno !== 'minimum') {
    casti.push(`omezeno (${vypocet.poznamky[vypocet.poznamky.length - 1]})`);
  }

  // Přenesený zbytek: jen v režimu „celé stovky, zbytek se přenáší“; jinak se vynuluje.
  try {
    const stary = Number(m?.spend_rest ?? 0);
    const novy = r.zaokrouhleni === 'carry' && vypocet.omezeno !== 'minimum' && vypocet.zaklad > 0 ? vypocet.zbytekNovy : (r.zaokrouhleni === 'carry' ? stary : 0);
    if (novy !== stary) await sql`UPDATE client_memberships SET spend_rest = ${novy} WHERE customer_id = ${customerId} AND team_id = ${teamId}`;
  } catch { /* zbytek je doplněk */ }

  // Co přesně se připsalo: pro případné storno účtenky.
  if (v.zdroj === 'bill') {
    try {
      const billId = v.ref.replace(/^bill:/, '');
      await sql`
        UPDATE client_bill_awards SET points = ${Math.max(0, vypocet.body + (profilNovy.cashback_mode === 'points' ? vypocet.cashback : 0))},
          credit = ${profilNovy.cashback_mode === 'points' ? 0 : vypocet.cashback}, spend = ${castka}
        WHERE team_id = ${teamId} AND bill_id = ${billId}`;
    } catch { /* bez toho se storno jen nespočítá */ }
  }
  // Útrata pro úrovně se počítá z celé částky, i když nedala žádný bod.
  await pripisUtratu(teamId, customerId, castka);
  await zkontrolujUroven(teamId, customerId, profilNovy).catch(() => {});
  return { body: vypocet.body, cashback: vypocet.cashback, points, credit, casti, vypocet };
}

// ---- Oznámení o změně úrovně ---------------------------------------------------------------

/**
 * Porovná aktuální úroveň člena s tou, o které ho naposledy informovali,
 * a při změně pošle oznámení (postup i snížení po neaktivitě). První kontrola
 * jen zapamatuje stav, nikoho nezahltí. Změna se zapíše atomicky, takže
 * dva souběžné požadavky pošlou oznámení jen jednou.
 */
export async function zkontrolujUroven(teamId: number, customerId: number, profil?: any): Promise<string | null> {
  try {
    await zajistiBodyPravidla();
    const p = profil ?? await ensureProfile(teamId);
    const [m] = await sql`SELECT visits, spend, last_visit_at, tier_seen FROM client_memberships WHERE customer_id = ${customerId} AND team_id = ${teamId}` as any[];
    if (!m) return null;
    const t = tierForMember({ visits: Number(m.visits), spend: Number(m.spend), lastVisitAt: m.last_visit_at }, tierRulesFromProfile(p));
    const bylo: string | null = m.tier_seen ?? null;
    if (bylo === t.id) return null;
    const zmena = await sql`
      UPDATE client_memberships SET tier_seen = ${t.id}
      WHERE customer_id = ${customerId} AND team_id = ${teamId} AND tier_seen IS NOT DISTINCT FROM ${bylo}
      RETURNING customer_id` as any[];
    if (!zmena.length || !bylo) return null;
    const [tm] = await sql`SELECT name FROM teams WHERE id = ${teamId}` as any[];
    const o = oznameniUrovne(bylo, t.id, String(tm?.name ?? 'podniku'));
    if (!o) return null;
    notifyUser(customerId, { title: o.title, body: o.body, link: p.slug ? `/client/${p.slug}` : '/client/me', type: o.nahoru ? 'success' : 'info' }).catch(() => {});
    return t.id;
  } catch { return null; }
}

/** Denní úloha: podniky se snížením po neaktivitě — každého člena zkontroluje (klesnutí vzniká během času, ne akcí). */
export async function zkontrolujUrovneVsem(): Promise<number> {
  let zmeneno = 0;
  try {
    await zajistiBodyPravidla();
    const profily = await sql`SELECT * FROM client_profiles WHERE enabled = TRUE AND loyalty_on = TRUE AND tier_inactive_days > 0` as any[];
    for (const p of profily) {
      const teamId = Number(p.team_id);
      try {
        const clenove = await sql`SELECT customer_id FROM client_memberships WHERE team_id = ${teamId}` as any[];
        for (const c of clenove) { if (await zkontrolujUroven(teamId, Number(c.customer_id), p)) zmeneno++; }
      } catch { /* další podnik */ }
    }
  } catch { /* před migrací nic není */ }
  return zmeneno;
}

// ---- Storno účtenky ---------------------------------------------------------------------------

/**
 * Účtenky připsané před touto verzí neukládaly, kolik za ně host dostal.
 * Dopočítá se z deníku (řádky s odkazem bill:<účtenka>) a z částky účtenky;
 * hodnoty se zapíšou zpět a na objekt, ať se storno počítá stejně jako u nových.
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

async function stornoJedne(teamId: number, billId: string, customerId: number, body: number, kredit: number, utrata: number, ref: string, proc: string): Promise<void> {
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
 * Zrušená nebo refundovaná účtenka vezme zpět, co za ni host dostal. Storyous
 * to hlásí dvěma způsoby: původní účtenka dostane příznak refunded/deleted
 * (celé storno), nebo vznikne opravná účtenka se záporem a odkazem na původní
 * (refundedBillIdentifier; může být i částečná, pak se vrací poměrná část).
 * Idempotentní: každé storno se provede nejvýš jednou (příznak v client_bill_awards
 * a ref storno:<účtenka> v deníku). Volá se po synchronizaci účtenek.
 */
export async function stornujUctenky(teamId: number): Promise<VysledekStorna> {
  const out: VysledekStorna = { storno: 0, body: 0, kredit: 0 };
  await zajistiBodyPravidla();
  // 1) Původní účtenka označená jako zrušená nebo refundovaná.
  const cela = await sql`
    SELECT a.bill_id, a.customer_id, a.points, a.credit, a.spend, a.rev_points, a.rev_credit, a.rev_spend, b.refunded, b.deleted, b.final_price
    FROM client_bill_awards a JOIN pos_bills b ON b.team_id = a.team_id AND b.bill_id = a.bill_id
    WHERE a.team_id = ${teamId} AND a.reversed_at IS NULL AND (b.refunded = TRUE OR b.deleted = TRUE)
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
    await stornoJedne(teamId, String(a.bill_id), Number(a.customer_id), body, kredit, utrata, `storno:${a.bill_id}`, proc);
    out.storno++; out.body += body; out.kredit += kredit;
  }
  // 2) Opravná účtenka se záporem: vrací se poměrná část (celá, když pokrývá celý původní účet).
  const opravne = await sql`
    SELECT r.bill_id AS opravna, r.final_price AS vraceno, a.bill_id, a.customer_id, a.points, a.credit, a.spend,
           a.rev_points, a.rev_credit, a.rev_spend, o.final_price AS puvodni
    FROM pos_bills r
    JOIN client_bill_awards a ON a.team_id = r.team_id AND a.bill_id = r.refunded_bill_id
    JOIN pos_bills o ON o.team_id = a.team_id AND o.bill_id = a.bill_id
    WHERE r.team_id = ${teamId} AND r.refunded_bill_id IS NOT NULL AND r.deleted = FALSE AND a.reversed_at IS NULL
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
    await stornoJedne(teamId, String(a.bill_id), Number(a.customer_id), body, kredit, utrata, `storno:${a.opravna}`, proc);
    out.storno++; out.body += body; out.kredit += kredit;
  }
  return out;
}

// ---- Propadání kreditu -------------------------------------------------------------------------

/**
 * Denní úloha: v podnicích s nastaveným propadáním kreditu odepíše propadlý
 * kredit (od nejstaršího, nikdy víc než host má) a upozorní hosty týden předem.
 * Idempotentní: odepsání má v deníku ref cexp:<den>, upozornění cwarn:<den>.
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
          const plan = planPropadani(vstup.map(x => ({ delta: x.delta, day: x.day })), Number(c.credit), dnes, dny, p.credit_expire_since);
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

// ---- Přehledy -------------------------------------------------------------------------------------

export type RazeniTop = 'utrata' | 'body' | 'navstevy';

export interface PrehledVernosti {
  dny: number;
  top: { id: number; name: string; points: number; credit: number; spend: number; visits: number; lastVisit: string | null; utrataObdobi: number; bodyObdobi: number }[];
  zdroje: { zdroj: string; body: number; pocet: number }[];
  vynosnost: { utrata: number; cashbackKredit: number; cashbackBody: number; bodyRozdane: number; storno: number; nakladPct: number | null; zaznamenanoOd: string | null };
  zavazek: { kredit: number; poukazy: number; body: number; clenuSKreditem: number };
}

/** Přehledy věrnosti za období: top hosté, zdroje bodů, výnosnost a závazek v měně. */
export async function prehledVernosti(teamId: number, dny: number, razeni: RazeniTop): Promise<PrehledVernosti> {
  await zajistiBodyPravidla();
  const d = Math.max(1, Math.min(730, Math.trunc(dny) || 30));
  const od = new Date(Date.now() - d * 86400000).toISOString();
  const top = await sql`
    SELECT m.customer_id AS id, u.name, m.points, m.credit, m.spend, m.visits, m.last_visit_at,
      COALESCE(SUM(l.amount) FILTER (WHERE l.created_at >= ${od}::timestamp), 0)::int AS utrata_obdobi,
      COALESCE(SUM(l.delta) FILTER (WHERE l.delta > 0 AND l.created_at >= ${od}::timestamp), 0)::int AS body_obdobi
    FROM client_memberships m
    JOIN users u ON u.id = m.customer_id
    LEFT JOIN client_loyalty_ledger l ON l.team_id = m.team_id AND l.customer_id = m.customer_id
    WHERE m.team_id = ${teamId}
    GROUP BY m.customer_id, u.name, m.points, m.credit, m.spend, m.visits, m.last_visit_at
    ORDER BY CASE WHEN ${razeni} = 'body' THEN COALESCE(SUM(l.delta) FILTER (WHERE l.delta > 0 AND l.created_at >= ${od}::timestamp), 0)
                  WHEN ${razeni} = 'navstevy' THEN m.visits ELSE m.spend END DESC, m.customer_id
    LIMIT 10` as any[];
  const zdroje = await sql`
    SELECT kind, CASE WHEN ref LIKE 'bill:%' THEN 'bill' WHEN ref = 'card' THEN 'card' ELSE '' END AS ref_typ,
      COALESCE(SUM(delta), 0)::int AS body, COUNT(*)::int AS pocet
    FROM client_loyalty_ledger
    WHERE team_id = ${teamId} AND delta > 0 AND created_at >= ${od}::timestamp
    GROUP BY kind, CASE WHEN ref LIKE 'bill:%' THEN 'bill' WHEN ref = 'card' THEN 'card' ELSE '' END` as any[];
  const slouceno = new Map<string, { body: number; pocet: number }>();
  for (const z of zdroje) {
    const n = zdrojBodu(String(z.kind), String(z.ref_typ));
    const c = slouceno.get(n) ?? { body: 0, pocet: 0 };
    c.body += Number(z.body) || 0; c.pocet += Number(z.pocet) || 0; slouceno.set(n, c);
  }
  const [v] = await sql`
    SELECT COALESCE(SUM(amount), 0)::int AS utrata, MIN(created_at) FILTER (WHERE amount IS NOT NULL) AS od,
      COALESCE(SUM(credit_delta) FILTER (WHERE kind = 'cashback' AND credit_delta > 0), 0)::int AS cb_kredit,
      COALESCE(SUM(delta) FILTER (WHERE kind = 'cashback' AND delta > 0), 0)::int AS cb_body,
      COALESCE(SUM(delta) FILTER (WHERE delta > 0 AND kind IN ('manual', 'order') AND ref IS NOT NULL AND ref <> 'spend'), 0)::int AS body_utrata,
      COALESCE(SUM(-delta) FILTER (WHERE kind = 'storno' AND delta < 0), 0)::int AS storno
    FROM client_loyalty_ledger WHERE team_id = ${teamId} AND created_at >= ${od}::timestamp` as any[];
  let zaznamenanoOd: string | null = null;
  try {
    const [p1] = await sql`SELECT MIN(created_at) AS od FROM client_loyalty_ledger WHERE team_id = ${teamId} AND amount IS NOT NULL` as any[];
    const dd = parseDbTime(p1?.od); zaznamenanoOd = dd ? pragueDayOf(dd) : null;
  } catch { zaznamenanoOd = null; }
  const [zav] = await sql`
    SELECT COALESCE(SUM(credit), 0)::int AS kredit, COALESCE(SUM(points), 0)::int AS body, COUNT(*) FILTER (WHERE credit > 0)::int AS clenu
    FROM client_memberships WHERE team_id = ${teamId}` as any[];
  let poukazy = 0;
  try {
    const [pk] = await sql`SELECT COALESCE(SUM(balance), 0)::int AS s FROM client_vouchers WHERE team_id = ${teamId} AND balance > 0` as any[];
    poukazy = Number(pk?.s) || 0;
  } catch { poukazy = 0; }
  const utrata = Number(v?.utrata) || 0; const cbKredit = Number(v?.cb_kredit) || 0;
  return {
    dny: d,
    top: top.map(r => ({
      id: Number(r.id), name: String(r.name ?? ''), points: Number(r.points) || 0, credit: Number(r.credit) || 0, spend: Number(r.spend) || 0,
      visits: Number(r.visits) || 0, lastVisit: r.last_visit_at ? new Date(parseDbTime(r.last_visit_at) ?? Date.now()).toISOString() : null,
      utrataObdobi: Number(r.utrata_obdobi) || 0, bodyObdobi: Number(r.body_obdobi) || 0,
    })),
    zdroje: Array.from(slouceno.entries()).map(([zdroj, x]) => ({ zdroj, ...x })).sort((a, b) => b.body - a.body),
    vynosnost: {
      utrata, cashbackKredit: cbKredit, cashbackBody: Number(v?.cb_body) || 0, bodyRozdane: Number(v?.body_utrata) || 0,
      storno: Number(v?.storno) || 0, nakladPct: utrata > 0 ? Math.round((cbKredit / utrata) * 1000) / 10 : null, zaznamenanoOd,
    },
    zavazek: { kredit: Number(zav?.kredit) || 0, poukazy, body: Number(zav?.body) || 0, clenuSKreditem: Number(zav?.clenu) || 0 },
  };
}

/** Hranice dne pro export: od půlnoci prvního dne po konec posledního (pražské dny jako UTC přiblížení ±2 h se do CSV nepromítne, řádky nesou čas). */
export function rozsahExportu(od: string | null, doDne: string | null): { od: string; do: string } {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const dnes = pragueToday();
  const a = od && re.test(od) ? od : dayPlus(dnes, -90);
  const b = doDne && re.test(doDne) ? doDne : dnes;
  return a <= b ? { od: a, do: b } : { od: b, do: a };
}

export { VAROVANI_DNI, type RozsirenaPravidla };
