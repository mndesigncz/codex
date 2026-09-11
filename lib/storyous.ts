// Storyous (Teya) POS — klient nad veřejným API. Jen čtení, do pokladny se
// nikdy nic nezapisuje.
//
// Co API opravdu nabízí (ověřeno naživo, ne z dokumentace):
//   auth      POST login.storyous.com/api/auth/authorize (client_credentials) → token na hodinu;
//             endpoint je omezený, token se musí cachovat.
//   merchant  GET /merchants/{m}                       → provozovny, DPH, měna
//   menu      GET /menu/{m}?placeId=                   → strom kategorií a produktů;
//             cena NENÍ na kořeni produktu, ale v placeValues.priceLevels.default.price
//             (bez placeId v placesValues[placeId]) — proto tu dřív byly samé nuly.
//   bills     GET /bills/{m}-{p}?from&till | ?modifiedSince | &lastBillId | &includeDeleted
//             → seznam bez položek; _lastModifiedAt umožňuje přírůstkovou synchronizaci.
//   bill      GET /bills/{m}-{p}/{billId}              → i položky (produkt, množství, cena, DPH)
//   stocks    GET /stocks/{m}/stocks, …/{stockId}/items, …/stockUps, …/stockTakings, /stocks/{m}/suppliers
//   datasync  Storyous umí sám posílat změny na náš webhook — zapíná to jejich
//             podpora pro provozovnu na základě URL + tajemství.
//
// Platba: účtenka má `paymentMethod` (cash | card | split | bondus | checksApi |
// prepaidCredit | …) a `payments[]` s rozpadem. „split" je hotovost + karta
// dohromady; dřív padal do „jinak" a uzávěrka proti kase pak nesedela.

import { neon } from '@neondatabase/serverless';
import { open } from './secretBox';
import { businessDayOf, dayPlus } from './pragueTime';

const sql = neon(process.env.DATABASE_URL!);

export interface PosConnection {
  teamId: number;
  clientId: string;
  clientSecret: string;
  merchantId: string;
  placeId: string;
  placeName: string | null;
}

export class StoryousError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export async function getConnection(teamId: number): Promise<PosConnection | null> {
  try {
    const [row] = await sql`SELECT * FROM pos_connections WHERE team_id = ${teamId}`;
    if (!row) return null;
    return {
      teamId,
      clientId: row.client_id,
      // Uloženo zašifrovaně; staré čitelné záznamy projdou beze změny a
      // přepíšou se při nejbližším uložení připojení.
      clientSecret: open(row.client_secret) ?? '',
      merchantId: row.merchant_id,
      placeId: row.place_id,
      placeName: row.place_name ?? null,
    };
  } catch { return null; }
}

// Serverless instance žije krátce; i tak malá cache v paměti ušetří autorizaci
// v rámci jedné teplé instance — a autorizační endpoint je limitovaný.
const tokenCache = new Map<string, { token: string; exp: number }>();

async function getToken(conn: Pick<PosConnection, 'clientId' | 'clientSecret'>): Promise<string> {
  const key = conn.clientId;
  const hit = tokenCache.get(key);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  const res = await fetch('https://login.storyous.com/api/auth/authorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: conn.clientId,
      client_secret: conn.clientSecret,
      grant_type: 'client_credentials',
    }),
  });
  if (!res.ok) throw new StoryousError(`Přihlášení ke Storyous selhalo (${res.status})`, res.status);
  const d = await res.json();
  if (!d?.access_token) throw new StoryousError('Storyous nevrátil token', 502);
  const exp = d.expires_at ? new Date(d.expires_at).getTime() : Date.now() + 55 * 60_000;
  tokenCache.set(key, { token: d.access_token, exp });
  return d.access_token;
}

async function api(conn: PosConnection, path: string): Promise<any> {
  const token = await getToken(conn);
  const call = (t: string) => fetch(`https://api.storyous.com${path}`, { headers: { Authorization: `Bearer ${t}` } });
  let res = await call(token);
  if (res.status === 401) {
    tokenCache.delete(conn.clientId);
    res = await call(await getToken(conn));
  }
  if (res.status === 429) throw new StoryousError('Storyous omezuje počet požadavků — zkusí se znovu za chvíli.', 429);
  if (!res.ok) throw new StoryousError(`Storyous API ${res.status}`, res.status);
  return res.json();
}

/** Dotaz na stránkovaný seznam: volá `onPage` pro každou stránku, dokud je nextPage. */
async function paged(conn: PosConnection, firstPath: string, onPage: (data: any[]) => void | boolean, maxPages = 60, budget?: () => boolean): Promise<{ pages: number; complete: boolean }> {
  let path: string | null = firstPath;
  let pages = 0;
  while (path && pages < maxPages) {
    // Serverless funkce má minutu. Když čas dochází, průchod se ukončí jako
    // neúplný — volající pak neposune kurzor a zbytek dobere příští běh.
    if (budget && !budget()) return { pages, complete: false };
    pages++;
    const page = await api(conn, path);
    const stop = onPage(page?.data ?? []);
    if (stop === true) return { pages, complete: true };
    path = page?.nextPage ? String(page.nextPage).replace('https://api.storyous.com', '') : null;
  }
  return { pages, complete: !path };
}

/** POST na Storyous — Delivery API a Reservations API zapisují do pokladny. */
async function apiPost(conn: PosConnection, path: string, body: any): Promise<any> {
  const token = await getToken(conn);
  const call = (t: string) => fetch(`https://api.storyous.com${path}`, {
    method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  let res = await call(token);
  if (res.status === 401) { tokenCache.delete(conn.clientId); res = await call(await getToken(conn)); }
  if (res.status === 429) throw new StoryousError('Storyous omezuje počet požadavků — zkusí se znovu za chvíli.', 429);
  const text = await res.text();
  let data: any = null; try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new StoryousError(`Storyous API ${res.status}: ${String(data?.message ?? data?.error ?? text).slice(0, 160)}`, res.status);
  return data;
}

// ---- Stoly, objednávky od stolu, rezervace (Managero client) ------------------

export interface Desk { deskId: string; name: string; code: string | null; type: string; section: string | null; virtual: boolean }

/** Stoly provozovny, jak je má pokladna. Virtuální (rozvoz, e-shop) se přeskakují. */
export async function listDesks(conn: PosConnection): Promise<Desk[]> {
  const d = await api(conn, `/deskViews/${src(conn)}`);
  const out: Desk[] = [];
  for (const sec of d?.sections ?? []) {
    for (const k of sec.desks ?? []) {
      if (k._removed || k._virtual) continue;
      out.push({ deskId: String(k.deskId), name: String(k.name ?? k.code ?? k.deskId), code: k.code ?? null, type: String(k.type ?? 'desk'), section: sec.name ?? null, virtual: !!k._virtual });
    }
  }
  return out;
}

export interface OrderLine { itemId: string; count: number; unitPriceWithVat: number; note?: string | null }

/**
 * Objednávka od stolu přes Delivery API. Bez `autoConfirm` ji musí obsluha na
 * pokladně do pěti minut potvrdit, jinak ji pokladna sama zamítne — proto se
 * posílá až ve chvíli, kdy ji u nás obsluha potvrdí, a `autoConfirm: true`.
 */
export async function createTableOrder(conn: PosConnection, o: { externalId: string; deskId: string; items: OrderLine[]; note?: string | null; customerName?: string | null; notification?: { confirm: string; dispatch: string; decline: string } }): Promise<{ orderId: string; state: string }> {
  const d = await apiPost(conn, `/delivery/orders/${src(conn)}`, {
    externalId: o.externalId,
    deliveryType: 'orderToTable',
    timing: { asSoonAsPossible: true },
    customer: { name: o.customerName || 'Host' },
    items: o.items.map(l => ({ itemId: l.itemId, count: l.count, unitPriceWithVat: l.unitPriceWithVat, note: l.note ?? undefined })),
    note: o.note ?? undefined,
    deskId: o.deskId,
    alreadyPaid: false,
    autoConfirm: true,
    // Pokladna zavolá GET, když objednávku potvrdí, vydá nebo odmítne. Bez
    // opakování, takže stav se navíc dotahuje i dotazem.
    notification: o.notification,
  });
  return { orderId: String(d?.orderId ?? d?.id ?? o.externalId), state: String(d?.state ?? 'NEW') };
}

/** Stav objednávky v pokladně: NEW, CONFIRMED, DECLINED, DISPATCHED… */
export async function tableOrderState(conn: PosConnection, orderId: string): Promise<string | null> {
  try {
    const d = await api(conn, `/delivery/orders/${src(conn)}/${encodeURIComponent(orderId)}`);
    return d?.state ? String(d.state) : null;
  } catch (e) {
    if (e instanceof StoryousError && e.status === 404) return null;
    throw e;
  }
}

/**
 * Usazení rezervace: pokladna otevře na stole účet s údaji z rezervace.
 * Volá se, když hosté dorazí — ne při vytvoření rezervace.
 */
export async function seatReservation(conn: PosConnection, r: { externalReservationId: string; name: string; deskId: string; deposit?: number }): Promise<{ reservationId: string | null }> {
  const d = await apiPost(conn, `/reservations/${src(conn)}/reservations`, {
    externalReservationId: r.externalReservationId,
    name: r.name,
    reservationDeposit: r.deposit ?? 0,
    deskId: r.deskId,
    autoConfirm: true,
  });
  return { reservationId: d?.reservationId ? String(d.reservationId) : null };
}

// ---- Provozovna ---------------------------------------------------------------

export interface MerchantInfo {
  merchantId: string; name: string; isVatPayer: boolean; currencyCode: string;
  places: { placeId: string; name: string; state?: string }[];
}

export async function merchantInfo(conn: PosConnection): Promise<MerchantInfo> {
  const m = await api(conn, `/merchants/${conn.merchantId}`);
  return {
    merchantId: String(m.merchantId), name: String(m.name ?? ''), isVatPayer: !!m.isVatPayer,
    currencyCode: String(m.currencyCode ?? 'CZK'),
    places: (m.places ?? []).map((p: any) => ({ placeId: String(p.placeId), name: String(p.name ?? ''), state: p.state })),
  };
}

/** Ověření přístupů při připojování — a rovnou název provozovny. */
export async function verifyConnection(conn: PosConnection): Promise<{ ok: boolean; placeName?: string; error?: string; places?: { placeId: string; name: string }[] }> {
  try {
    const m = await merchantInfo(conn);
    const place = m.places.find(p => p.placeId === conn.placeId);
    if (!place) {
      return { ok: false, error: 'Provozovna (Place ID) u tohoto merchanta neexistuje. Nabízí se: ' + m.places.map(p => `${p.name} (${p.placeId})`).join(', '), places: m.places };
    }
    return { ok: true, placeName: place.name ?? null, places: m.places };
  } catch (e) {
    const status = e instanceof StoryousError ? e.status : 0;
    return { ok: false, error: status === 401 || status === 403
      ? 'Přihlášení ke Storyous selhalo — zkontroluj Client ID a Secret.'
      : 'Storyous teď neodpovídá — zkus to za chvíli.' };
  }
}

// ---- Platby --------------------------------------------------------------------

/** Lidský název způsobu platby, jak ho posílá Storyous. */
export function paymentLabel(method: string): string {
  const m = method.toLowerCase();
  const map: Record<string, string> = {
    cash: 'hotově', card: 'kartou', split: 'kombinace', bondus: 'stravenky', checksapi: 'stravenky (elektronické)',
    prepaidcredit: 'kredit / předplatné', invoice: 'faktura', bank: 'převodem', banktransfer: 'převodem',
    loyalty: 'věrnostní', voucher: 'poukaz', gift: 'dárkový poukaz', online: 'online', qr: 'QR platba',
    delivery: 'rozvoz', unpaid: 'nezaplaceno', check: 'stravenky', meal: 'stravenky',
  };
  return map[m] ?? method;
}

export interface Buckets { cash: number; card: number; other: number; methods: Record<string, number> }

/** Rozpad účtenky na hotovost / kartu / ostatní podle `payments[]`. Když
 *  rozpad chybí, bere se `paymentMethod` a celá částka. */
export function paymentBuckets(bill: any): Buckets {
  const out: Buckets = { cash: 0, card: 0, other: 0, methods: {} };
  const price = Number(bill?.finalPrice) || 0;
  const pays: any[] = Array.isArray(bill?.payments) && bill.payments.length ? bill.payments : null as any;
  const add = (methodRaw: string, amount: number) => {
    const m = String(methodRaw ?? '').toLowerCase();
    // Storno je účtenka se záporem — v kase opravdu ubylo, takže se počítá.
    if (!Number.isFinite(amount)) return;
    if (m === 'cash') out.cash += amount;
    else if (m.includes('card') || m === 'terminal') out.card += amount;
    else { out.other += amount; out.methods[m || 'unknown'] = (out.methods[m || 'unknown'] ?? 0) + amount; }
  };
  if (pays) {
    let sum = 0;
    for (const p of pays) {
      const a = Number(p?.priceWithVat ?? p?.amount ?? 0) || 0;
      sum += a;
      add(String(p?.paymentMethod ?? ''), a);
    }
    // Rozpad nesedí na účtenku (zaokrouhlení, chybějící řádek) — zbytek
    // přičti k převažujícímu způsobu, ať součet vždycky dává finalPrice.
    const rest = Math.round((price - sum) * 100) / 100;
    if (Math.abs(rest) >= 0.01) {
      const main = String(bill?.paymentMethod ?? '').toLowerCase();
      if (main === 'cash' || (main === 'split' && out.cash >= out.card)) out.cash += rest;
      else if (main.includes('card') || main === 'split') out.card += rest;
      else out.other += rest;
    }
  } else {
    add(String(bill?.paymentMethod ?? ''), price);
  }
  const r = (n: number) => Math.round(n * 100) / 100;
  out.cash = r(out.cash); out.card = r(out.card); out.other = r(out.other);
  return out;
}

// ---- Účtenky ----------------------------------------------------------------------

export interface BillHead {
  billId: string;
  createdAt: string;
  paidAt: string | null;
  modifiedAt: string;
  /** Obchodní den (účtenka po půlnoci patří k předchozímu večeru). */
  day: string;
  finalPrice: number;
  withoutTax: number | null;
  tips: number;
  discount: number;
  rounding: number;
  currency: string;
  paymentMethod: string;
  buckets: Buckets;
  refunded: boolean;
  deleted: boolean;
  refundedBillId: string | null;
  personCount: number | null;
  deskId: string | null;
  createdById: string | null; createdByName: string | null;
  paidById: string | null; paidByName: string | null;
  orderProvider: string | null;
  taxSummaries: Record<string, number> | null;
  fiscalized: boolean;
}

export function toBillHead(b: any): BillHead | null {
  if (!b?.billId) return null;
  const whenStr = String(b.paidAt ?? b.createdAt ?? '');
  const when = whenStr ? new Date(whenStr) : null;
  const day = when && !Number.isNaN(when.getTime()) ? businessDayOf(when) : '';
  if (!day) return null;
  const ts: Record<string, number> | null = b.taxSummaries && typeof b.taxSummaries === 'object'
    ? Object.fromEntries(Object.entries(b.taxSummaries).map(([k, v]) => [k, Number(v) || 0])) : null;
  return {
    billId: String(b.billId),
    createdAt: String(b.createdAt ?? whenStr),
    paidAt: b.paidAt ? String(b.paidAt) : null,
    modifiedAt: String(b._lastModifiedAt ?? b.createdAt ?? whenStr),
    day,
    finalPrice: Number(b.finalPrice) || 0,
    withoutTax: b.finalPriceWithoutTax != null && Number.isFinite(Number(b.finalPriceWithoutTax)) ? Number(b.finalPriceWithoutTax) : null,
    tips: Number(b.tips) || 0,
    discount: Number(b.discount) || 0,
    rounding: Number(b.rounding) || 0,
    currency: String(b.currencyCode ?? 'CZK'),
    paymentMethod: String(b.paymentMethod ?? ''),
    buckets: paymentBuckets(b),
    refunded: !!b.refunded,
    deleted: !!b.deleted,
    refundedBillId: b.refundedBillIdentifier ? String(b.refundedBillIdentifier) : null,
    personCount: Number(b.personCount) > 0 ? Number(b.personCount) : null,
    deskId: b.deskId != null ? String(b.deskId) : null,
    createdById: b.createdBy?.personId != null ? String(b.createdBy.personId) : null,
    createdByName: b.createdBy?.fullName ?? null,
    paidById: b.paidBy?.personId != null ? String(b.paidBy.personId) : null,
    paidByName: b.paidBy?.fullName ?? null,
    orderProvider: b.orderProvider ? String(b.orderProvider) : null,
    taxSummaries: ts,
    fiscalized: !!b.fiscalizedAt,
  };
}

const src = (conn: PosConnection) => `${conn.merchantId}-${conn.placeId}`;

/** Účtenky změněné od daného okamžiku (včetně refundací a smazaných). */
export async function billsModifiedSince(conn: PosConnection, sinceIso: string, onBill: (b: BillHead, raw: any) => void, maxPages = 40, budget?: () => boolean) {
  const q = `modifiedSince=${encodeURIComponent(sinceIso)}&includeDeleted=true&limit=100`;
  return paged(conn, `/bills/${src(conn)}?${q}`, (data) => {
    for (const raw of data) { const h = toBillHead(raw); if (h) onBill(h, raw); }
  }, maxPages, budget);
}

/** Účtenky z období (kalendářní dny `from` až `tillExclusive`), včetně refundací a smazaných. */
export async function billsInRange(conn: PosConnection, from: string, tillExclusive: string, onBill: (b: BillHead, raw: any) => void, maxPages = 80, budget?: () => boolean) {
  const q = `from=${from}&till=${tillExclusive}&includeDeleted=true&limit=100`;
  return paged(conn, `/bills/${src(conn)}?${q}`, (data) => {
    for (const raw of data) { const h = toBillHead(raw); if (h) onBill(h, raw); }
  }, maxPages, budget);
}

export interface BillItem {
  productId: string | null;
  name: string;
  amount: number;
  /** Jednotková cena s DPH, jak ji vydala pokladna. */
  price: number | null;
  vatRate: number | null;
  categoryId: string | null;
  measure: string | null;
  discounts: any | null;
}

/** Detail účtenky — seznam položky nemá, každá účtenka je jeden dotaz. */
export async function billDetail(conn: PosConnection, billId: string): Promise<{ head: BillHead | null; items: BillItem[] }> {
  const d = await api(conn, `/bills/${src(conn)}/${encodeURIComponent(billId)}`);
  const items: BillItem[] = (d?.items ?? []).map((it: any) => ({
    productId: it.productId ? String(it.productId) : null,
    name: String(it.name ?? '').trim(),
    amount: Number(it.amount) || 0,
    price: it.price != null && Number.isFinite(Number(it.price)) ? Number(it.price) : null,
    vatRate: it.vatRate != null && Number.isFinite(Number(it.vatRate)) ? Number(it.vatRate) : null,
    categoryId: it.categoryId ? String(it.categoryId) : null,
    measure: it.measure ? String(it.measure) : null,
    discounts: it.discounts ?? null,
  }));
  return { head: toBillHead(d), items };
}

/** Jen položky — pro odpis skladu. */
export async function billItems(conn: PosConnection, billId: string): Promise<BillItem[]> {
  return (await billDetail(conn, billId)).items;
}

export interface BillLite { billId: string; createdAt: string; }

/** Nesmazané, nerefundované účtenky období (kompatibilita se starým odpisem). */
export async function listBills(conn: PosConnection, from: string, tillExclusive: string): Promise<BillLite[]> {
  const out: BillLite[] = [];
  await billsInRange(conn, from, tillExclusive, (b) => {
    if (!b.deleted && !b.refunded) out.push({ billId: b.billId, createdAt: b.createdAt });
  }, 20);
  return out;
}

export interface DaySummary {
  date: string;
  bills: number;
  total: number;
  cash: number;
  card: number;
  other: number;
  /** Ostatní způsoby platby rozepsané (stravenky, kredit, faktura…). */
  methods: Record<string, number>;
  tips: number;
  tipsCash: number;
  tipsCard: number;
  tipsOther: number;
  withoutTax: number | null;
  discounts: number;
  refundCount: number;
  refundTotal: number;
}

export function emptyDay(date: string): DaySummary {
  return { date, bills: 0, total: 0, cash: 0, card: 0, other: 0, methods: {}, tips: 0, tipsCash: 0, tipsCard: 0, tipsOther: 0, withoutTax: 0, discounts: 0, refundCount: 0, refundTotal: 0 };
}

/** Přičte účtenku do denního souhrnu — jedna logika pro zrcadlo i živé API. */
export function addToDay(out: DaySummary, b: BillHead) {
  if (b.deleted) return;
  if (b.refunded) { out.refundCount++; out.refundTotal += b.finalPrice; return; }
  out.bills++;
  out.total += b.finalPrice;
  out.cash += b.buckets.cash; out.card += b.buckets.card; out.other += b.buckets.other;
  for (const [m, v] of Object.entries(b.buckets.methods)) out.methods[m] = (out.methods[m] ?? 0) + v;
  out.tips += b.tips;
  // Spropitné jde tam, kam šla většina peněz z účtenky.
  if (b.buckets.cash >= b.buckets.card && b.buckets.cash >= b.buckets.other) out.tipsCash += b.tips;
  else if (b.buckets.card >= b.buckets.other) out.tipsCard += b.tips;
  else out.tipsOther += b.tips;
  if (out.withoutTax != null) out.withoutTax = b.withoutTax != null ? out.withoutTax + b.withoutTax : null;
  out.discounts += b.discount;
}

export function roundDay(out: DaySummary): DaySummary {
  const r = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);
  return { ...out, total: r(out.total)!, cash: r(out.cash)!, card: r(out.card)!, other: r(out.other)!,
    tips: r(out.tips)!, tipsCash: r(out.tipsCash)!, tipsCard: r(out.tipsCard)!, tipsOther: r(out.tipsOther)!,
    withoutTax: r(out.withoutTax), discounts: r(out.discounts)!, refundTotal: r(out.refundTotal)!,
    methods: Object.fromEntries(Object.entries(out.methods).map(([k, v]) => [k, r(v)!])) };
}

/** Souhrn jednoho OBCHODNÍHO dne přímo z pokladny (bez zrcadla). Obchodní den
 *  končí až poslední účtenkou: stahují se dva kalendářní dny a třídí podle
 *  obchodního dne, jinak by uzávěrka nabídla menší tržbu, než jaká byla. */
export async function daySummary(conn: PosConnection, date: string): Promise<DaySummary> {
  const out = emptyDay(date);
  await billsInRange(conn, date, dayPlus(date, 2), (b) => { if (b.day === date) addToDay(out, b); }, 12);
  return roundDay(out);
}

/** Refundované účtenky jednoho dne — počet a hodnota (kompatibilita). */
export async function listRefunds(conn: PosConnection, date: string): Promise<{ count: number; total: number }> {
  const s = await daySummary(conn, date);
  return { count: s.refundCount, total: s.refundTotal };
}

// ---- Menu (katalog produktů) ---------------------------------------------------

export interface MenuProduct {
  productId: string;
  name: string;
  category: string;
  /** Prodejní cena s DPH pro NAŠI provozovnu; null = pokladna cenu nedala. */
  price: number | null;
  vatRate: number | null;
  measure: string | null;
  ean: string | null;
  imageUrl: string | null;
  showInPos: boolean;
  priceVariable: boolean;
  type: string | null;
}

export interface MenuSnapshot { products: MenuProduct[]; modifiedAt: string | null; version: string | null; currency: string }

/** Cena a DPH z hodnot pro provozovnu — s `?placeId=` je to `placeValues`,
 *  bez něj `placesValues[placeId]`. Nikde jinde cena není. */
function placeValuesOf(it: any, placeId: string): any {
  if (it?.placeValues && typeof it.placeValues === 'object') return it.placeValues;
  const all = it?.placesValues;
  if (all && typeof all === 'object') return all[placeId] ?? null;
  return null;
}

export async function fetchMenu(conn: PosConnection): Promise<MenuSnapshot> {
  const menu = await api(conn, `/menu/${conn.merchantId}?placeId=${encodeURIComponent(conn.placeId)}`);
  const out: MenuProduct[] = [];
  const walk = (items: any[], path: string[]) => {
    for (const it of items ?? []) {
      const kids = it.items;
      if (Array.isArray(kids) && kids.length) {
        walk(kids, [...path, String(it.name ?? '')]);
      } else if (it.productId) {
        const pv = placeValuesOf(it, conn.placeId);
        const p = Number(pv?.priceLevels?.default?.price);
        out.push({
          productId: String(it.productId),
          name: String(it.name ?? '').trim(),
          category: path.filter(Boolean).join(' › '),
          price: Number.isFinite(p) && p > 0 ? Math.round(p * 100) / 100 : null,
          vatRate: pv?.vatRate != null && Number.isFinite(Number(pv.vatRate)) ? Number(pv.vatRate) : null,
          measure: it.measure ? String(it.measure) : null,
          ean: it.ean ? String(it.ean) : null,
          imageUrl: it.imageUrl ? String(it.imageUrl) : null,
          showInPos: pv?.showInPos !== false,
          priceVariable: !!it.isPriceVariable,
          type: it.type ? String(it.type) : null,
        });
      }
    }
  };
  walk(menu?.items ?? [], []);
  return {
    products: out,
    modifiedAt: menu?._lastModifiedAt ? String(menu._lastModifiedAt) : null,
    version: menu?._version != null ? String(menu._version) : null,
    currency: String(menu?.currencyCode ?? 'CZK'),
  };
}

/** Plochý seznam produktů (kompatibilita se staršími místy). */
export async function menuProducts(conn: PosConnection): Promise<MenuProduct[]> {
  return (await fetchMenu(conn)).products;
}

// ---- Sklad ve Storyous -----------------------------------------------------------

export interface PosStock { stockId: string; name: string | null; isCentral: boolean; placeId: string | null }
export interface PosStockItem {
  itemId: string; name: string; categoryName: string | null; measure: string | null;
  amount: number | null; priceWithoutVat: number | null; priceWithVat: number | null;
  criticalAmount: number | null; optimalAmount: number | null; ean: string | null;
}
export interface PosStockUp {
  stockUpId: string; createdAt: string; note: string | null; number: string | null;
  supplierName: string | null; supplierId: string | null; personName: string | null;
  totalPriceWithoutVat: number | null; isDraft: boolean;
}

export async function listStocks(conn: PosConnection): Promise<PosStock[]> {
  const d = await api(conn, `/stocks/${conn.merchantId}/stocks`);
  return (d?.data ?? []).map((s: any) => ({
    stockId: String(s.stockId), name: s.name ?? null, isCentral: !!s.isCentral, placeId: s.placeId ? String(s.placeId) : null,
  }));
}

/** Sklad provozovny (nebo centrální, když vlastní nemá). */
export async function stockForPlace(conn: PosConnection): Promise<PosStock | null> {
  const all = await listStocks(conn);
  return all.find(s => s.placeId === conn.placeId) ?? all.find(s => s.isCentral) ?? null;
}

export async function stockItems(conn: PosConnection, stockId: string, maxPages = 20): Promise<PosStockItem[]> {
  const out: PosStockItem[] = [];
  let path: string | null = `/stocks/${conn.merchantId}/stocks/${encodeURIComponent(stockId)}/items`;
  let guard = 0;
  while (path && guard < maxPages) {
    guard++;
    const d = await api(conn, path);
    const data: any[] = d?.data ?? [];
    for (const it of data) {
      const n = (v: any) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
      out.push({
        itemId: String(it.itemId), name: String(it.name ?? ''), categoryName: it.categoryName ?? null,
        measure: it.measure ?? null, amount: n(it.amount), priceWithoutVat: n(it.priceWithoutVat),
        priceWithVat: n(it.priceWithVat), criticalAmount: n(it.criticalAmount), optimalAmount: n(it.optimalAmount),
        ean: it.ean ?? null,
      });
    }
    path = d?.nextPage ? String(d.nextPage).replace('https://api.storyous.com', '') : null;
  }
  return out;
}

export async function stockUps(conn: PosConnection, stockId: string, maxPages = 5): Promise<PosStockUp[]> {
  const out: PosStockUp[] = [];
  let path: string | null = `/stocks/${conn.merchantId}/stocks/${encodeURIComponent(stockId)}/stockUps`;
  let guard = 0;
  while (path && guard < maxPages) {
    guard++;
    const d = await api(conn, path);
    for (const s of d?.data ?? []) {
      out.push({
        stockUpId: String(s.stockUpId), createdAt: String(s.createdAt ?? ''), note: s.note ?? null,
        number: s.number != null ? String(s.number) : null, supplierName: s.supplierName ?? null,
        supplierId: s.supplierId != null ? String(s.supplierId) : null, personName: s.personName ?? null,
        totalPriceWithoutVat: s.totalPriceWithoutVat != null ? Number(s.totalPriceWithoutVat) : null,
        isDraft: !!s.isDraft,
      });
    }
    path = d?.nextPage ? String(d.nextPage).replace('https://api.storyous.com', '') : null;
  }
  return out;
}

export async function suppliers(conn: PosConnection): Promise<{ supplierId: string; supplierName: string }[]> {
  const d = await api(conn, `/stocks/${conn.merchantId}/suppliers`);
  return (d?.data ?? []).map((s: any) => ({ supplierId: String(s.supplierId), supplierName: String(s.supplierName ?? '') }));
}
