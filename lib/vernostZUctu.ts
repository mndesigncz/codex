// Věrnost z účtu z pokladny: jedno jádro pro všechny cesty, jak se host a účet potkají.
//
//  * ručně: obsluha u kasy vybere účet z dnešních (POST /api/client/staff/scan, action bill);
//  * párování (varianta A): kartička se naskenuje, vznikne čekající párování (client_bill_claims)
//    a po synchronizaci Storyous (lib/posMirror.ts) se jednoznačný zaplacený účet připíše sám;
//  * výběr z čekajících: obsluha zvolí účet u párování, které samo nešlo (víc kandidátů);
//  * později Storyous Loyalty API (varianta B): reportBenefitUsage nese billId i customerId,
//    zavolá se tatáž `pripisZUctu` (viz hlášení balíku Q).
//
// Co `pripisZUctu` dělá (dřív to žilo v scan route): razítka podle položek účtu, body
// a cashback podle pravidel podniku (zaokrouhlení, minimum, strop, část kreditem nebo
// poukazem, vyloučené položky, bonusová akce), návštěva, útrata pro úrovně a zápis
// připsaného pro storno zrušené nebo vrácené účtenky (lib/bodyPravidlaDb.ts stornujUctenky).
//
// Idempotence: client_bill_awards má primární klíč (team_id, bill_id) — týž účet připíše
// věrnost jen jednou, ať ho pošle obsluha, párování nebo pokladna. Zápis jde po krocích
// (kroky v client_bill_awards.kroky); spadne-li uprostřed, další pokus dokončí jen to,
// co chybí. Rozdělaný pokus starší než 30 s převezme kdokoli.

import { sql, ensureProfile, join, award, awardCredit, stampVisit, jeClenBlokovan } from './client';
import { pripisUtratu } from './urovneDb';
import { zajistiRazitka } from './stampsSchema';
import { spustKrok } from './stampsPlan';
import { pragueToday, pragueDayOf, dayPlus } from './pragueTime';
import { audit } from './audit';
import { applyBillToCampaigns } from './stamps';
import { getConnection, billDetail } from './storyous';
import { menaPodniku } from './menaPodniku';
import { aktivniBonus } from './bonusAkceDb';
import { poznamkaRazitek } from './bonusAkce';
import { odmenaZUctu, zapisZbytek, zapisPripsaneZaUctenku } from './bodyPravidlaDb';
import { vetyOOmezeni, castKreditem } from './bodyPravidla';
import { naparuj, kandidatiPro, casMs, vetaSparovano, PROPADNE_PO_H, OKNO_PRED_MIN, OKNO_PO_MIN, type CekajiciParovani, type UcetZPokladny } from './parovaniUctu';

export type VysledekPripisu =
  | { ok: true; message: string; parts: string[]; total: number; body: number; kredit: number; expiredCount: number; lost: number; claimId: number | null }
  | { ok: false; status: number; error: string };

export interface VstupPripisu {
  teamId: number;
  customer: { id: number; name: string };
  billId: string;
  /** Kdo připsání způsobil (obsluha u kasy, nebo ta, která kartičku naskenovala). */
  staffId: number | null;
  profil?: any;
  /** Částka, když detail účtu není k mání (ruční cesta ji posílá z výběru). */
  castka?: number;
  /** Část účtu zaplacená kreditem nebo poukazem, kterou zadala obsluha. */
  predplaceno?: number;
  /** Které čekající párování tím končí; bez něj se uzavře nejstarší čekající párování hosta. */
  claimId?: number | null;
  /** Jak se host a účet potkali (do záznamu párování). */
  zdroj?: 'rucne' | 'auto' | 'vyber';
  /** Okamžik, ke kterému se hodnotí bonusová akce (Happy hour) — u párování čas zaplacení. */
  bonusAt?: Date;
}

// ---- Schéma párování (stejné příkazy jsou v app/api/init/route.ts, blok „Párování účtu") ----

let pripraveno: Promise<void> | null = null;
export function zajistiParovani(): Promise<void> {
  if (!pripraveno) {
    pripraveno = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS client_bill_claims (
          id SERIAL PRIMARY KEY,
          team_id INTEGER NOT NULL,
          customer_id INTEGER NOT NULL,
          staff_id INTEGER,
          waiter_name TEXT,
          desk_id TEXT,
          scanned_at TIMESTAMP NOT NULL DEFAULT NOW(),
          stav TEXT NOT NULL DEFAULT 'ceka',
          bill_id TEXT,
          total INTEGER NOT NULL DEFAULT 0,
          points INTEGER NOT NULL DEFAULT 0,
          credit INTEGER NOT NULL DEFAULT 0,
          matched_by TEXT,
          matched_at TIMESTAMP,
          updated_at TIMESTAMP DEFAULT NOW()
        )`;
      await sql`CREATE INDEX IF NOT EXISTS client_bill_claims_team_stav ON client_bill_claims (team_id, stav, scanned_at)`;
      await sql`ALTER TABLE pos_bills ADD COLUMN IF NOT EXISTS customer_id INTEGER`;
    })().catch(e => { pripraveno = null; throw e; });
  }
  return pripraveno;
}

// ---- Jádro: věrnost z jednoho účtu ----

/** Připíše hostovi věrnost z účtu z pokladny. Týž účet jen jednou (client_bill_awards). */
export async function pripisZUctu(v: VstupPripisu): Promise<VysledekPripisu> {
  const { teamId, customer: c, staffId } = v;
  const billId = String(v.billId ?? '').slice(0, 60);
  if (!billId) return { ok: false, status: 400, error: 'Vyber účtenku.' };
  const p = v.profil ?? await ensureProfile(teamId);
  if (!p.loyalty_on) return { ok: false, status: 400, error: 'Podnik nemá věrnost zapnutou.' };
  await zajistiRazitka();
  const mena = await menaPodniku(teamId);
  // Zrušená nebo vrácená účtenka věrnost nepřipíše (a kdyby ji připsala, storno by ji hned vzalo zpět).
  let radek: any = null;
  try {
    [radek] = await sql`SELECT refunded, deleted, other_methods, items_synced, final_price FROM pos_bills WHERE team_id = ${teamId} AND bill_id = ${billId}` as any[];
    if (radek && (radek.refunded === true || radek.deleted === true)) return { ok: false, status: 409, error: 'Tahle účtenka byla v pokladně zrušena nebo vrácena, věrnost se za ni nepřipisuje.' };
  } catch { /* bez zrcadla účtenek se jen nezkontroluje */ }
  const guard = await sql`
    INSERT INTO client_bill_awards (team_id, bill_id, customer_id, done_at, kroky, staff_id)
    VALUES (${teamId}, ${billId}, ${c.id}, NULL, '', ${staffId})
    ON CONFLICT (team_id, bill_id) DO NOTHING RETURNING bill_id`;
  let hotove = new Set<string>();
  if (!guard.length) {
    // Dřívější pokus nedoběhl (a je starší než 30 s, tedy mrtvý)? Převezme se atomicky.
    const [navazu] = await sql`
      UPDATE client_bill_awards SET awarded_at = NOW(), staff_id = ${staffId}
      WHERE team_id = ${teamId} AND bill_id = ${billId} AND customer_id = ${c.id}
        AND done_at IS NULL AND awarded_at < NOW() - INTERVAL '30 seconds'
      RETURNING kroky`;
    if (!navazu) {
      const [cur] = await sql`SELECT done_at FROM client_bill_awards WHERE team_id = ${teamId} AND bill_id = ${billId}`;
      return { ok: false, status: 409, error: cur?.done_at ? 'Tahle účtenka už věrnost připsala.' : 'Účtenka se právě připisuje. Zkus to za půl minuty.' };
    }
    hotove = new Set(String(navazu.kroky ?? '').split(',').filter(Boolean));
  }
  const krok = (nazev: string, fn: () => Promise<void>) => spustKrok(hotove, nazev, fn, async n => {
    await sql`UPDATE client_bill_awards SET kroky = kroky || ${n + ','} WHERE team_id = ${teamId} AND bill_id = ${billId}`;
  });
  const bonus = await aktivniBonus(teamId, v.bonusAt);
  let expiredCount = 0; let lost = 0;
  const secti = (x: { expired?: number; lost?: number }) => { expiredCount += x.expired ?? 0; lost += x.lost ?? 0; };
  try {
    // Položky: ze zrcadla, když jsou stažené; jinak z detailu v pokladně; bez obojího zbude útrata.
    let items: { productId: string | null; qty: number; price: number | null }[] = [];
    let polozkyUctu: { productId: string | null; amount: number; price: number | null }[] = [];
    let total = Math.max(0, Math.round(Number(v.castka) || 0));
    if (radek?.final_price != null && !total) total = Math.max(0, Math.round(Number(radek.final_price)));
    let maPolozky = false;
    if (radek?.items_synced === true) {
      try {
        const rows = await sql`SELECT product_id, amount, price FROM pos_bill_items WHERE team_id = ${teamId} AND bill_id = ${billId}` as any[];
        items = rows.map(r => ({ productId: r.product_id ?? null, qty: Number(r.amount) || 1, price: r.price != null ? Number(r.price) : null }));
        polozkyUctu = rows.map(r => ({ productId: r.product_id ?? null, amount: Number(r.amount) || 0, price: r.price != null ? Number(r.price) : null }));
        if (radek.final_price != null) total = Math.max(0, Math.round(Number(radek.final_price)));
        maPolozky = true;
      } catch { /* zkusí se pokladna */ }
    }
    if (!maPolozky) {
      const conn = await getConnection(teamId);
      if (conn) {
        try {
          const d = await billDetail(conn, billId);
          items = d.items.map(it => ({ productId: it.productId, qty: Number(it.amount) || 1, price: it.price }));
          polozkyUctu = d.items.map(it => ({ productId: it.productId, amount: it.amount, price: it.price }));
          if (d.head?.finalPrice != null) total = Math.max(0, Math.round(Number(d.head.finalPrice)));
        } catch { /* detail nedostupný — zbude útrata */ }
      }
    }
    const parts: string[] = [];
    await krok('visit', async () => {
      // Účtenka je návštěva: roste počet návštěv (úrovně) a kampaně „za návštěvu" dostanou razítko, nejvýš jednou denně.
      const r = await stampVisit(teamId, c.id, p, `bill:${billId}`, 0, '', staffId);
      if (!r.already && r.lines) { parts.push(...r.lines); secti(r); }
    });
    await krok('stamps', async () => {
      const st = await applyBillToCampaigns(teamId, c.id, pragueToday(), { billId, total, items }, { staffId: staffId ?? undefined, razitka: bonus.razitka, poznamka: poznamkaRazitek(bonus) });
      parts.push(...st.lines); secti(st);
    });
    // Část zaplacená kreditem nebo poukazem: z ruční hodnoty obsluhy, jinak z rozpadu plateb v pokladně.
    let predplaceno = Math.max(0, Math.round(Number(v.predplaceno) || 0));
    if (!predplaceno) predplaceno = castKreditem(radek?.other_methods);
    const { odmena: od, pravidla: pr, poznamka: bonusPozn } = await odmenaZUctu(teamId, p, total, { predplaceno, polozky: polozkyUctu, customerId: c.id, bonus });
    const pts = od.points;
    const back = od.cashback;
    const vBodech = p.cashback_mode === 'points';
    parts.push(...vetyOOmezeni(od, pr, mena.money));
    if (pts > 0) await krok('points', async () => { const points = await award(teamId, c.id, pts, 'manual', `bill:${billId}`, `Útrata ${mena.money(total)} z účtenky${bonusPozn}`, staffId); parts.push(`+${pts} bodů${od.nasobicPopis ? ` (${od.nasobicPopis})` : ''} (celkem ${points})`); });
    // Cashback podle nastavení podniku: kredit v měně podniku, nebo body (Kartička).
    if (back > 0) {
      await krok('cashback', async () => {
        if (vBodech) {
          const points = await award(teamId, c.id, back, 'cashback', `bill:${billId}`, `${p.cashback_pct} % z ${mena.money(total)} v bodech`, staffId);
          parts.push(`+${back} bodů cashback (celkem ${points})`);
        } else { await awardCredit(teamId, c.id, back, 'cashback', `bill:${billId}`, `${p.cashback_pct} % z ${mena.money(total)}`, staffId); parts.push(`+${mena.money(back)} kreditu`); }
      });
    }
    // Útrata pro úrovně podle útraty se počítá z každé účtenky, i když nedala žádný bod.
    await krok('spend', async () => { await pripisUtratu(teamId, c.id, total); });
    // Co přesně se za účtenku připsalo (pro storno zrušené nebo vrácené účtenky) a přenesený zbytek pod 100.
    await krok('zapis', async () => {
      await zapisPripsaneZaUctenku(teamId, billId, pts + (vBodech ? back : 0), vBodech ? 0 : back, total);
      await zapisZbytek(teamId, c.id, pr, od);
    });
    await sql`UPDATE client_bill_awards SET done_at = NOW() WHERE team_id = ${teamId} AND bill_id = ${billId}`;
    if (!parts.length) parts.push('žádné pravidlo se netrefilo');
    const body = pts + (vBodech ? back : 0);
    const kredit = vBodech ? 0 : back;
    const claimId = await uzavriParovani(teamId, c, billId, { total, body, kredit, zdroj: v.zdroj ?? 'rucne', claimId: v.claimId ?? null, money: mena.money });
    return { ok: true, message: `${c.name} · účtenka ${mena.money(total)}: ${parts.join(' · ')}`, parts, total, body, kredit, expiredCount, lost, claimId };
  } catch {
    // Hotové kroky zůstávají zapsané; ať jde pokus hned zopakovat, guard se uvolní k převzetí.
    await sql`UPDATE client_bill_awards SET awarded_at = NOW() - INTERVAL '1 minute' WHERE team_id = ${teamId} AND bill_id = ${billId} AND done_at IS NULL`.catch(() => {});
    return { ok: false, status: 500, error: 'Připsání se přerušilo. Načti účtenku znovu — co už se připsalo, se nezdvojí.' };
  }
}

/**
 * Po připsání: účet v zrcadle dostane hosta (pos_bills.customer_id) a čekající párování hosta
 * skončí jako spárované. Když nějaké skončilo, host dostane oznámení. Nikdy neshodí připsání.
 */
async function uzavriParovani(teamId: number, c: { id: number; name: string }, billId: string,
  r: { total: number; body: number; kredit: number; zdroj: string; claimId: number | null; money: (n: number) => string }): Promise<number | null> {
  try {
    await zajistiParovani();
    await sql`UPDATE pos_bills SET customer_id = ${c.id} WHERE team_id = ${teamId} AND bill_id = ${billId} AND customer_id IS NULL`;
    const [z] = await sql`
      UPDATE client_bill_claims SET stav = 'sparovano', bill_id = ${billId}, total = ${r.total}, points = ${r.body}, credit = ${r.kredit},
        matched_by = ${r.zdroj}, matched_at = NOW(), updated_at = NOW()
      WHERE id = (
        SELECT id FROM client_bill_claims
        WHERE team_id = ${teamId} AND customer_id = ${c.id} AND stav IN ('ceka', 'paruji')
          AND (${r.claimId}::int IS NULL OR id = ${r.claimId}::int)
        ORDER BY scanned_at ASC LIMIT 1)
      RETURNING id` as any[];
    if (!z) return null;
    void oznamHostovi(teamId, c.id, r).catch(() => {});
    return Number(z.id);
  } catch { return null; }
}

/** Oznámení hostovi (centrum oznámení + push): stejná mechanika jako dárek k narozeninám. */
async function oznamHostovi(teamId: number, customerId: number, r: { total: number; body: number; kredit: number; money: (n: number) => string }) {
  const { notifyUser } = await import('./push');
  const [t] = await sql`SELECT COALESCE(t.name, 'podniku') AS team_name, p.slug FROM teams t LEFT JOIN client_profiles p ON p.team_id = t.id WHERE t.id = ${teamId}` as any[];
  const zisk = [r.body > 0 ? `+${r.body} b` : '', r.kredit > 0 ? `+${r.money(r.kredit)} kreditu` : ''].filter(Boolean).join(' a ');
  await notifyUser(customerId, {
    title: zisk ? `${zisk} za účet v ${t?.team_name ?? 'podniku'}` : `Účet v ${t?.team_name ?? 'podniku'} je na tvé kartičce`,
    body: `Účet ${r.money(Math.round(r.total))} se spároval s tvou kartičkou.`,
    link: t?.slug ? `/client/${t.slug}?tab=loyalty` : '/client/me', type: 'success', category: 'general',
  });
}

// ---- Párování (varianta A) ----

export interface CekajiciRadek {
  id: number; customerId: number; customerName: string; staffName: string | null; deskId: string | null; stul: string | null;
  scannedAt: string; kandidati: { billId: string; finalPrice: number; paidAt: string | null }[];
}

/** Vznikne (nebo se vrátí stávající) čekající párování po skenu kartičky v podniku s pokladnou. */
export async function zalozParovani(teamId: number, customerId: number, staffId: number): Promise<{ id: number; deskId: string | null; nove: boolean } | null> {
  await zajistiParovani();
  const [je] = await sql`
    SELECT id, desk_id FROM client_bill_claims
    WHERE team_id = ${teamId} AND customer_id = ${customerId} AND stav IN ('ceka', 'paruji')
      AND scanned_at > NOW() - (${PROPADNE_PO_H} || ' hours')::interval
    ORDER BY scanned_at DESC LIMIT 1` as any[];
  if (je) return { id: Number(je.id), deskId: je.desk_id ?? null, nove: false };
  const [u] = await sql`SELECT name FROM users WHERE id = ${staffId}` as any[];
  const [r] = await sql`
    INSERT INTO client_bill_claims (team_id, customer_id, staff_id, waiter_name)
    VALUES (${teamId}, ${customerId}, ${staffId}, ${u?.name ?? null})
    RETURNING id` as any[];
  return r ? { id: Number(r.id), deskId: null, nove: true } : null;
}

/** Propadlé (po 6 h) a zaseknuté (rozpracované déle než 2 min) párování — líně při každém čtení. */
async function uklid(teamId: number) {
  await sql`
    UPDATE client_bill_claims SET stav = 'propadlo', updated_at = NOW()
    WHERE team_id = ${teamId} AND stav IN ('ceka', 'paruji') AND scanned_at < NOW() - (${PROPADNE_PO_H} || ' hours')::interval`;
  await sql`
    UPDATE client_bill_claims SET stav = 'ceka', updated_at = NOW()
    WHERE team_id = ${teamId} AND stav = 'paruji' AND updated_at < NOW() - INTERVAL '2 minutes'`;
}

async function nactiCekajici(teamId: number): Promise<(CekajiciParovani & { customerName: string; staffName: string | null })[]> {
  const rows = await sql`
    SELECT c.id, c.customer_id, c.scanned_at, c.desk_id, c.waiter_name, us.name AS customer_name
    FROM client_bill_claims c JOIN users us ON us.id = c.customer_id
    WHERE c.team_id = ${teamId} AND c.stav = 'ceka'
    ORDER BY c.scanned_at ASC LIMIT 100` as any[];
  return rows.map(r => ({
    id: Number(r.id), customerId: Number(r.customer_id), scannedAt: String(r.scanned_at), deskId: r.desk_id ?? null,
    waiter: r.waiter_name ?? null, customerName: String(r.customer_name ?? 'Host'), staffName: r.waiter_name ?? null,
  }));
}

/** Zaplacené účty ze zrcadla v okně kolem nejstaršího a nejmladšího čekajícího skenu. */
async function nactiUcty(teamId: number, cekajici: CekajiciParovani[]): Promise<UcetZPokladny[]> {
  const casy = cekajici.map(c => casMs(c.scannedAt)).filter((x): x is number => x != null);
  if (!casy.length) return [];
  const od = new Date(Math.min(...casy) - OKNO_PRED_MIN * 60_000);
  // Obchodní den o den dřív: účet po půlnoci patří k předchozímu večeru.
  const den = dayPlus(pragueDayOf(od), -1);
  const rows = await sql`
    SELECT b.bill_id, b.paid_at, b.final_price, b.desk_id, b.created_by_name, b.paid_by_name, b.refunded, b.deleted, b.customer_id,
           EXISTS (SELECT 1 FROM client_bill_awards a WHERE a.team_id = b.team_id AND a.bill_id = b.bill_id) AS awarded
    FROM pos_bills b
    WHERE b.team_id = ${teamId} AND b.day >= ${den} AND b.paid_at IS NOT NULL AND b.final_price > 0
    ORDER BY b.paid_at DESC LIMIT 400` as any[];
  const doMs = Math.max(...casy) + OKNO_PO_MIN * 60_000;
  return rows
    .filter(r => { const t = casMs(r.paid_at); return t != null && t >= od.getTime() && t <= doMs; })
    .map(r => ({
      billId: String(r.bill_id), paidAt: r.paid_at ? String(r.paid_at) : null, finalPrice: Number(r.final_price) || 0,
      deskId: r.desk_id ?? null, createdByName: r.created_by_name ?? null, paidByName: r.paid_by_name ?? null,
      refunded: !!r.refunded, deleted: !!r.deleted, obsazeny: r.awarded === true || r.customer_id != null,
    }));
}

/**
 * Napáruje čekající párování podniku na zaplacené účty ze zrcadla. Volá se po každé
 * synchronizaci pokladny a při čtení seznamu čekajících. Best-effort: nikdy nehází.
 */
export async function parujCekajici(teamId: number): Promise<{ sparovano: number; nejasne: number }> {
  const out = { sparovano: 0, nejasne: 0 };
  try {
    await zajistiParovani();
    await uklid(teamId);
    const cekajici = await nactiCekajici(teamId);
    if (!cekajici.length) return out;
    const p = await ensureProfile(teamId);
    if (!p.loyalty_on) return out;
    const ucty = await nactiUcty(teamId, cekajici);
    const v = naparuj(cekajici, ucty);
    out.nejasne = v.nejasne.length;
    for (const par of v.pary) {
      const c = cekajici.find(x => x.id === par.claimId)!;
      // Zábor: souběžný běh (tik, webhook, obsluha) stejné párování nevezme podruhé.
      const [z] = await sql`UPDATE client_bill_claims SET stav = 'paruji', updated_at = NOW() WHERE id = ${par.claimId} AND team_id = ${teamId} AND stav = 'ceka' RETURNING staff_id` as any[];
      if (!z) continue;
      if (await jeClenBlokovan(teamId, c.customerId)) {
        await sql`UPDATE client_bill_claims SET stav = 'zruseno', updated_at = NOW() WHERE id = ${par.claimId}`;
        continue;
      }
      await join(c.customerId, teamId);
      const ucet = ucty.find(u => u.billId === par.billId);
      const bonusAt = ucet?.paidAt ? new Date(casMs(ucet.paidAt) ?? Date.now()) : undefined;
      const r = await pripisZUctu({ teamId, customer: { id: c.customerId, name: c.customerName }, billId: par.billId, staffId: z.staff_id != null ? Number(z.staff_id) : null, profil: p, claimId: par.claimId, zdroj: 'auto', bonusAt });
      if (r.ok) {
        out.sparovano++;
        const mena = await menaPodniku(teamId);
        audit(teamId, z.staff_id != null ? Number(z.staff_id) : null, 'client.parovani', 'client', c.customerId, `${c.customerName}: ${vetaSparovano(r.total, r.body, r.kredit, mena.money)} (samo po zaplacení)`);
      } else {
        // Účet mezitím připsal někdo jiný (nebo se přerušilo): párování čeká dál, příští běh ho zkusí znovu.
        await sql`UPDATE client_bill_claims SET stav = 'ceka', updated_at = NOW() WHERE id = ${par.claimId} AND stav = 'paruji'`;
      }
    }
  } catch { /* příště */ }
  return out;
}

/** Čekající párování pro obsluhu: kdo, kdy, u jakého stolu a které účty připadají v úvahu. */
export async function seznamCekajicich(teamId: number): Promise<{ ceka: CekajiciRadek[]; hotovo: any[] }> {
  await zajistiParovani();
  await uklid(teamId);
  const cekajici = await nactiCekajici(teamId);
  const ucty = cekajici.length ? await nactiUcty(teamId, cekajici) : [];
  let stoly = new Map<string, string>();
  try {
    const t = await sql`SELECT storyous_desk_id, name FROM client_tables WHERE team_id = ${teamId} AND storyous_desk_id IS NOT NULL` as any[];
    stoly = new Map(t.map(x => [String(x.storyous_desk_id), String(x.name)]));
  } catch { /* bez stolů */ }
  const ceka = cekajici.map(c => {
    // Když stůl ani číšník nesedí, obsluha dostane aspoň účty v okně (nejbližší první).
    let k = kandidatiPro(c, ucty);
    if (!k.length) {
      const s = casMs(c.scannedAt) ?? 0;
      k = ucty.filter(u => !u.obsazeny && !u.refunded && !u.deleted && casMs(u.paidAt) != null && Math.abs((casMs(u.paidAt) ?? 0) - s) <= OKNO_PO_MIN * 60_000)
        .map(u => ({ billId: u.billId, skore: 0, odchylkaMs: Math.abs((casMs(u.paidAt) ?? s) - s), finalPrice: u.finalPrice, paidAt: u.paidAt }))
        .sort((a, b) => a.odchylkaMs - b.odchylkaMs);
    }
    return {
      id: c.id, customerId: c.customerId, customerName: c.customerName, staffName: c.staffName, deskId: c.deskId,
      stul: c.deskId ? stoly.get(String(c.deskId)) ?? null : null, scannedAt: c.scannedAt,
      kandidati: k.slice(0, 6).map(x => ({ billId: x.billId, finalPrice: x.finalPrice, paidAt: x.paidAt })),
    };
  });
  const hotovo = await sql`
    SELECT c.id, c.customer_id, us.name AS customer_name, c.total, c.points, c.credit, c.matched_by, c.matched_at, c.bill_id
    FROM client_bill_claims c JOIN users us ON us.id = c.customer_id
    WHERE c.team_id = ${teamId} AND c.stav = 'sparovano' AND c.matched_at > NOW() - INTERVAL '3 hours'
    ORDER BY c.matched_at DESC LIMIT 10` as any[];
  return { ceka, hotovo };
}

/** Stoly z pokladny, které podnik spároval se svými stoly (výběr stolu k párování). */
export async function stolyKParovani(teamId: number): Promise<{ deskId: string; name: string }[]> {
  try {
    const t = await sql`SELECT storyous_desk_id, name FROM client_tables WHERE team_id = ${teamId} AND active = TRUE AND storyous_desk_id IS NOT NULL ORDER BY position, id LIMIT 40` as any[];
    return t.map(x => ({ deskId: String(x.storyous_desk_id), name: String(x.name) }));
  } catch { return []; }
}

/** Synchronizace pokladny po skenu: obejde pětiminutovou klapku, ale nejvýš jednou za 30 s. */
export async function synchronizujPoSkenu(teamId: number): Promise<void> {
  try {
    const { syncBills } = await import('./posMirror');
    const { SYNC_PO_SKENU_S } = await import('./parovaniUctu');
    await syncBills(teamId, { throttleSec: SYNC_PO_SKENU_S });
  } catch { /* další tik to dožene */ }
}
