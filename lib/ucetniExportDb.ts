// Podklady pro účetní — načtení dat jednoho podniku z databáze.
//
// Každý dotaz má `team_id` podniku (i soubory: fotka cizího podniku se do ZIPu
// nedostane, ani když by její adresa byla v účtence). Výplaty a jména lidí se
// načtou jen s příznakem `mzdy` (oprávnění finance.mzdy tvůrce exportu / odkazu).
// Před migrací nových sloupců (doc_number, doc_photos) se čte bez nich.

import { neon } from '@neondatabase/serverless';
import { get } from '@vercel/blob';
import { normalizeCurrency } from './money';
import { normalizePhotos } from './closing';
import { pragueDaySafe } from './pragueTime';
import { fotkyObjednavky } from './ucetniExport';
import type { DataExportu, PosUctenkaVstup, PrijemkaVstup, UctenkaVstup, UzaverkaVstup, VyplataVstup } from './ucetniExport';

const sql = neon(process.env.DATABASE_URL!);

const cislo = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const cisloNebo = (v: unknown): number | null => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
/** Pražský den z časového razítka databáze (TIMESTAMP bez zóny = UTC). */
const den = (v: unknown): string => pragueDaySafe(v);
const ADRESA = /^\/api\/upload\/\d{1,12}$/;

export interface PodnikUcetni {
  nazev: string; ico: string | null; dic: string | null; adresa: string | null; mena: string;
  email: string | null; auto: boolean; mzdy: boolean; verze: number; posledni: string | null;
  /** Podnik zablokovaný správcem (`teams.blocked_at`) — veřejný odkaz pro účetní pak nic nevydá. */
  zablokovany: boolean;
}

/** Podnik a nastavení účetní (před migrací výchozí hodnoty). */
export async function nactiPodnik(teamId: number): Promise<PodnikUcetni | null> {
  let t: Record<string, unknown> | undefined;
  try {
    [t] = await sql`
      SELECT name, ico, dic, address, currency, accountant_email, accountant_auto, accountant_payroll, accountant_link_ver, accountant_last_sent,
             blocked_at
      FROM teams WHERE id = ${teamId}`;
  } catch {
    // Před migrací sloupců účetní: aspoň název a blokace (blocked_at je starší).
    try { [t] = await sql`SELECT name, blocked_at FROM teams WHERE id = ${teamId}`; } catch { [t] = await sql`SELECT name FROM teams WHERE id = ${teamId}`; }
  }
  if (!t) return null;
  return {
    nazev: String(t.name ?? ''), ico: (t.ico as string) || null, dic: (t.dic as string) || null, adresa: (t.address as string) || null,
    mena: normalizeCurrency(t.currency as string | null), email: (t.accountant_email as string) || null,
    auto: t.accountant_auto === true, mzdy: t.accountant_payroll === true, verze: Number(t.accountant_link_ver) > 0 ? Number(t.accountant_link_ver) : 1,
    posledni: (t.accountant_last_sent as string) || null, zablokovany: t.blocked_at != null,
  };
}

/** Všechno, co jde do exportu za období <od, do> (pražské dny). */
export async function nactiDataExportu(teamId: number, od: string, doD: string, o: { mzdy: boolean }): Promise<DataExportu | null> {
  const podnik = await nactiPodnik(teamId);
  if (!podnik) return null;

  // Účtenky: podle data nákupu; bez něj podle dne nafocení (pražský den) — stejně jako Finance.
  let uctRows: any[] = [];
  try {
    uctRows = await sql`
      SELECT id, photo_url, supplier, amount, note, created_at, purchase_date, category FROM receipts
      WHERE team_id = ${teamId}
        AND COALESCE(purchase_date, to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD')) >= ${od}
        AND COALESCE(purchase_date, to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD')) <= ${doD}
      ORDER BY id` as any[];
  } catch { /* před migrací */ }
  const uctenky: UctenkaVstup[] = uctRows.map(r => ({
    id: Number(r.id), datum: r.purchase_date ? String(r.purchase_date) : den(r.created_at),
    dodavatel: r.supplier ?? null, castka: cisloNebo(r.amount), kategorie: r.category ?? null, poznamka: r.note ?? null,
    foto: typeof r.photo_url === 'string' && ADRESA.test(r.photo_url) ? r.photo_url : null,
  }));

  // Příjemky: přijaté objednávky podle dne příjmu.
  let objRows: any[] = [];
  try {
    objRows = await sql`
      SELECT id, supplier, total_cost, received_at, items, doc_number, doc_photos FROM orders
      WHERE team_id = ${teamId} AND status = 'received' AND received_at IS NOT NULL
        AND to_char((received_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') >= ${od}
        AND to_char((received_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') <= ${doD}
      ORDER BY id` as any[];
  } catch {
    try {
      objRows = await sql`
        SELECT id, supplier, total_cost, received_at, items FROM orders
        WHERE team_id = ${teamId} AND status = 'received' AND received_at IS NOT NULL
          AND to_char((received_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') >= ${od}
          AND to_char((received_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') <= ${doD}
        ORDER BY id` as any[];
    } catch { /* před migrací */ }
  }
  const prijemky: PrijemkaVstup[] = objRows.map(r => ({
    id: Number(r.id), datum: den(r.received_at), dodavatel: r.supplier ?? null, castka: cisloNebo(r.total_cost),
    cisloDokladu: r.doc_number ? String(r.doc_number) : null, fotky: fotkyObjednavky(r.doc_photos),
    polozek: Array.isArray(r.items) ? r.items.length : 0,
  }));

  // Uzávěrky podle dne směny (u noční směny den, kdy začala).
  let uzRows: any[] = [];
  try {
    uzRows = await sql`
      SELECT cc.id, cc.created_by, COALESCE(cc.shift_date, cc.date) AS den, cc.shift_label, ev.title AS akce,
             cc.opening_cash, cc.cash_revenue, cc.card_revenue, cc.tips, cc.tips_card, cc.expenses, cc.cash_removed,
             cc.self_payout, cc.final_removal, cc.closing_cash, cc.payout_from_register, cc.tips_in_drawer,
             cc.approved, cc.movements, cc.photos
      FROM cash_closings cc LEFT JOIN events ev ON ev.id = cc.event_id AND ev.team_id = cc.team_id
      WHERE cc.team_id = ${teamId}
        AND COALESCE(cc.shift_date, cc.date) >= ${od} AND COALESCE(cc.shift_date, cc.date) <= ${doD}
      ORDER BY den, cc.id` as any[];
  } catch { /* před migrací */ }
  const uzaverky: UzaverkaVstup[] = uzRows.map(r => ({
    id: Number(r.id), den: String(r.den).slice(0, 10), popis: r.akce ? String(r.akce) : r.shift_label ? String(r.shift_label) : null, createdBy: Number(r.created_by),
    opening_cash: cislo(r.opening_cash), cash_revenue: cislo(r.cash_revenue), card_revenue: cislo(r.card_revenue), tips: cislo(r.tips),
    tips_card: cisloNebo(r.tips_card), expenses: cislo(r.expenses), cash_removed: cislo(r.cash_removed), self_payout: cislo(r.self_payout),
    final_removal: cisloNebo(r.final_removal), closing_cash: cislo(r.closing_cash), payout_from_register: r.payout_from_register ?? null,
    tips_in_drawer: r.tips_in_drawer ?? null, approved: r.approved ?? null, movements: r.movements, photos: r.photos,
  }));

  // Tržby z pokladny: po dnech sečtené v databázi (rok účtenek se do paměti netahá), DPH podle sazeb z tax_summaries.
  const pos: PosUctenkaVstup[] = [];
  try {
    const dny = await sql`
      SELECT day, COUNT(*)::int AS pocet, SUM(final_price) AS celkem, SUM(tips) AS tips, SUM(cash) AS cash, SUM(card) AS card, SUM(other) AS other,
             CASE WHEN COUNT(without_tax) = COUNT(*) THEN SUM(without_tax) END AS bez_dph
      FROM pos_bills
      WHERE team_id = ${teamId} AND day >= ${od} AND day <= ${doD} AND deleted = FALSE AND refunded = FALSE
      GROUP BY day ORDER BY day` as any[];
    // DPH po sazbách ve vlastním try: vadný tax_summaries (text, pole, null hodnota) nesmí shodit
    // celé tržby. Bere se jen objekt { "<sazba %>": <částka DPH> } a z něj jen číselné hodnoty
    // s číselným klíčem (tak to ukládá lib/storyous.ts toBillHead → lib/posMirror.ts).
    const dphDne = new Map<string, Record<string, number>>();
    try {
      const sazby = await sql`
        SELECT b.day, t.key AS sazba, SUM((t.value #>> '{}')::numeric) AS dph
        FROM pos_bills b CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(b.tax_summaries) = 'object' THEN b.tax_summaries ELSE '{}'::jsonb END) AS t
        WHERE b.team_id = ${teamId} AND b.day >= ${od} AND b.day <= ${doD} AND b.deleted = FALSE AND b.refunded = FALSE
          AND jsonb_typeof(t.value) = 'number' AND t.key ~ '^[0-9]+([.,][0-9]+)?$'
        GROUP BY b.day, t.key` as any[];
      for (const s of sazby) {
        const m = dphDne.get(String(s.day)) ?? {};
        m[String(s.sazba)] = cislo(s.dph);
        dphDne.set(String(s.day), m);
      }
    } catch (e) { console.error('ucetni/pos-dph', e instanceof Error ? e.message : ''); }
    for (const d of dny) {
      pos.push({
        den: String(d.day), pocet: Number(d.pocet) || 0, finalPrice: cislo(d.celkem), withoutTax: cisloNebo(d.bez_dph), tips: cislo(d.tips),
        cash: cislo(d.cash), card: cislo(d.card), other: cislo(d.other), refunded: false, deleted: false, taxSummaries: dphDne.get(String(d.day)) ?? null,
      });
    }
  } catch { /* podnik bez pokladny nebo před migrací */ }

  // Výplaty a jména jen se svolením mezd.
  let vyplaty: VyplataVstup[] | null = null;
  let jmenaAutoru: Record<number, string> | undefined;
  if (o.mzdy) {
    vyplaty = [];
    try {
      const rows = await sql`
        SELECT p.paid_at, p.period_from, p.period_to, p.amount, p.method, p.note, u.name
        FROM payroll_payments p LEFT JOIN users u ON u.id = p.user_id
        WHERE p.team_id = ${teamId} AND LEFT(p.paid_at, 10) >= ${od} AND LEFT(p.paid_at, 10) <= ${doD}
        ORDER BY p.paid_at, p.id` as any[];
      vyplaty = rows.map(r => ({
        datum: String(r.paid_at).slice(0, 10), jmeno: String(r.name ?? ''), od: String(r.period_from ?? ''), do: String(r.period_to ?? ''),
        castka: cislo(r.amount), zpusob: r.method ? String(r.method) : null, poznamka: r.note ? String(r.note) : null,
      }));
    } catch { /* před migrací */ }
    const autori = [...new Set(uzaverky.filter(z => z.self_payout > 0).map(z => z.createdBy))];
    if (autori.length) {
      jmenaAutoru = {};
      try {
        // Jen autoři uzávěrek tohoto podniku (id z dotazu výš, ten má team_id).
        const rows = await sql`SELECT id, name FROM users WHERE id = ANY(${autori})` as any[];
        for (const r of rows) jmenaAutoru[Number(r.id)] = String(r.name ?? '');
      } catch { /* bez jmen */ }
    }
  }

  // Nahrané soubory, na které doklady odkazují — jen tohoto podniku.
  const adresy = new Set<string>();
  for (const u of uctenky) if (u.foto) adresy.add(u.foto);
  for (const p of prijemky) for (const f of p.fotky) adresy.add(f);
  for (const z of uzaverky) for (const f of normalizePhotos(z.photos)) adresy.add(f.url);
  const ids = [...adresy].map(a => Number(a.split('/').pop())).filter(n => Number.isSafeInteger(n) && n > 0);
  const soubory: DataExportu['soubory'] = {};
  if (ids.length) {
    try {
      const rows = await sql`SELECT id, mime FROM uploads WHERE team_id = ${teamId} AND id = ANY(${ids})` as any[];
      for (const r of rows) soubory[`/api/upload/${r.id}`] = { mime: r.mime ?? null };
    } catch { /* bez fotek */ }
  }

  return {
    podnik: { nazev: podnik.nazev, ico: podnik.ico, dic: podnik.dic, adresa: podnik.adresa, mena: podnik.mena },
    od, do: doD, uctenky, prijemky, uzaverky, pos, vyplaty, jmenaAutoru, soubory,
  };
}

/**
 * Obsah nahraného souboru podniku jako proud (Blob), nebo bajty (záložní base64 v databázi).
 * null = soubor není (smazaný, cizí podnik, úložiště nedostupné) — export pak jen zapíše, že chybí.
 */
export async function otevriSoubor(teamId: number, uploadId: number): Promise<ReadableStream<Uint8Array> | Uint8Array | null> {
  let row: Record<string, unknown> | undefined;
  try {
    [row] = await sql`SELECT blob_path, data FROM uploads WHERE id = ${uploadId} AND team_id = ${teamId}`;
  } catch { return null; }
  if (!row) return null;
  if (row.blob_path && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const r = await get(String(row.blob_path), { access: 'private' });
      if (r?.stream) return r.stream as ReadableStream<Uint8Array>;
    } catch (e) {
      console.error('ucetni: blob get failed', uploadId, e instanceof Error ? e.message : '');
    }
  }
  if (typeof row.data === 'string' && row.data) {
    try { return new Uint8Array(Buffer.from(row.data, 'base64')); } catch { return null; }
  }
  return null;
}
