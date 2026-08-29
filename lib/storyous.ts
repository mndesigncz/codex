// Storyous (Teya) POS client. Read-only: we pull closed bills to know the real
// revenue — nothing is ever written back to the register.
//
// Auth: POST login.storyous.com/api/auth/authorize (client_credentials) → 1h token.
// Bills: GET api.storyous.com/bills/{merchantId}-{placeId}?from&till&limit → { data, nextPage }.

import { neon } from '@neondatabase/serverless';
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

export async function getConnection(teamId: number): Promise<PosConnection | null> {
  try {
    const [row] = await sql`SELECT * FROM pos_connections WHERE team_id = ${teamId}`;
    if (!row) return null;
    return {
      teamId,
      clientId: row.client_id,
      clientSecret: row.client_secret,
      merchantId: row.merchant_id,
      placeId: row.place_id,
      placeName: row.place_name ?? null,
    };
  } catch { return null; }
}

// Serverless instances are short-lived; a tiny in-memory cache still saves the
// auth round-trip within one warm instance.
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
  if (!res.ok) throw new Error(`Storyous auth failed (${res.status})`);
  const d = await res.json();
  if (!d?.access_token) throw new Error('Storyous auth: no token');
  const exp = d.expires_at ? new Date(d.expires_at).getTime() : Date.now() + 55 * 60_000;
  tokenCache.set(key, { token: d.access_token, exp });
  return d.access_token;
}

async function api(conn: PosConnection, path: string): Promise<any> {
  const token = await getToken(conn);
  const res = await fetch(`https://api.storyous.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    tokenCache.delete(conn.clientId);
    const t2 = await getToken(conn);
    const res2 = await fetch(`https://api.storyous.com${path}`, { headers: { Authorization: `Bearer ${t2}` } });
    if (!res2.ok) throw new Error(`Storyous API ${res2.status}`);
    return res2.json();
  }
  if (!res.ok) throw new Error(`Storyous API ${res.status}`);
  return res.json();
}

/** Verify credentials and resolve the place name — used when connecting. */
export async function verifyConnection(conn: PosConnection): Promise<{ ok: boolean; placeName?: string; error?: string }> {
  try {
    const m = await api(conn, `/merchants/${conn.merchantId}`);
    const place = (m?.places ?? []).find((p: any) => p.placeId === conn.placeId);
    if (!place) return { ok: false, error: 'Provozovna (placeId) u tohoto merchanta neexistuje.' };
    return { ok: true, placeName: place.name ?? null };
  } catch (e) {
    return { ok: false, error: 'Přihlášení ke Storyous selhalo — zkontroluj Client ID a Secret.' };
  }
}

export interface DaySummary {
  date: string;
  bills: number;
  total: number;
  cash: number;
  card: number;
  other: number;
  tips: number;
  /** Tips split by how the bill was paid. Cash tips land in the drawer and are
   *  counted with the takings; card tips never touch it. Bills whose payment
   *  method we can't read keep their tips in `tipsOther` — reported honestly
   *  instead of guessed into one of the two. */
  tipsCash: number;
  tipsCard: number;
  tipsOther: number;
}

/** Paid, non-refunded bills of one BUSINESS day, summed by payment method.
 *
 *  Obchodní den končí až s poslední účtenkou, ne o půlnoci: podnik zavírá po
 *  půlnoci a účtenka z 1:30 patří k předešlému večeru — stejně jako uzávěrka,
 *  kterou po ní někdo vyplní. Proto se stahuje i následující kalendářní den a
 *  účtenky se roztřídí podle obchodního dne. Bez toho by uzávěrka nabídla
 *  menší tržbu, než jaká byla, a kontrola proti kase by hlásila rozdíl, který
 *  si aplikace vyrobila sama. */
export async function daySummary(conn: PosConnection, date: string): Promise<DaySummary> {
  const out: DaySummary = {
    date, bills: 0, total: 0, cash: 0, card: 0, other: 0,
    tips: 0, tipsCash: 0, tipsCard: 0, tipsOther: 0,
  };
  const till = dayPlus(date, 2);
  let path: string | null = `/bills/${conn.merchantId}-${conn.placeId}?from=${date}&till=${till}&limit=100`;
  let guard = 0;
  while (path && guard < 12) {
    guard++;
    const page = await api(conn, path);
    for (const b of page?.data ?? []) {
      if (b.deleted || b.refunded) continue;
      const when = new Date(String(b.paidAt ?? b.createdAt ?? ''));
      // Bez čitelného času účtenku raději nezapočítáme, než abychom ji dali
      // do špatného dne.
      if (businessDayOf(when) !== date) continue;
      const price = Number(b.finalPrice) || 0;
      out.bills++;
      out.total += price;
      const tip = Number(b.tips) || 0;
      out.tips += tip;
      const pm = String(b.paymentMethod ?? '').toLowerCase();
      if (pm === 'cash') { out.cash += price; out.tipsCash += tip; }
      else if (pm.includes('card')) { out.card += price; out.tipsCard += tip; }
      else { out.other += price; out.tipsOther += tip; }
    }
    path = page?.nextPage ? String(page.nextPage).replace('https://api.storyous.com', '') : null;
  }
  return out;
}

// ---- Menu (product catalog) --------------------------------------------------

export interface MenuProduct {
  productId: string;
  name: string;
  category: string;
  /**
   * Prodejní cena v korunách, když ji katalog uvádí. Storyous ji podle typu
   * produktu vrací pod různými klíči, a u některých položek vůbec — proto
   * null znamená „kasa cenu nedala“, ne nula.
   */
  price: number | null;
}

/** Vytáhne cenu z produktu, ať už ji kasa pojmenovala jakkoliv. */
function productPrice(it: any): number | null {
  const kandidati = [
    it?.price, it?.priceWithVat, it?.finalPrice, it?.unitPrice,
    Array.isArray(it?.prices) ? (it.prices[0]?.price ?? it.prices[0]?.priceWithVat) : undefined,
  ];
  for (const c of kandidati) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return null;
}

/** Flattened product list with a readable category path. */
export async function menuProducts(conn: PosConnection): Promise<MenuProduct[]> {
  const menu = await api(conn, `/menu/${conn.merchantId}`);
  const out: MenuProduct[] = [];
  const walk = (items: any[], path: string[]) => {
    for (const it of items ?? []) {
      const kids = it.items;
      if (Array.isArray(kids) && kids.length) {
        walk(kids, [...path, String(it.name ?? '')]);
      } else if (it.productId) {
        out.push({
          productId: String(it.productId),
          name: String(it.name ?? '').trim(),
          category: path.filter(Boolean).join(' › '),
          price: productPrice(it),
        });
      }
    }
  };
  walk(menu?.items ?? [], []);
  return out;
}

// ---- Bills with items (for stock write-off) ----------------------------------

export interface BillLite { billId: string; createdAt: string; }

/** Non-refunded, non-deleted bills of a date range (paginated). */
export async function listBills(conn: PosConnection, from: string, tillExclusive: string): Promise<BillLite[]> {
  const out: BillLite[] = [];
  let path: string | null = `/bills/${conn.merchantId}-${conn.placeId}?from=${from}&till=${tillExclusive}&limit=100`;
  let guard = 0;
  while (path && guard < 20) {
    guard++;
    const page = await api(conn, path);
    for (const b of page?.data ?? []) {
      if (b.deleted || b.refunded) continue;
      out.push({ billId: String(b.billId), createdAt: String(b.createdAt ?? '') });
    }
    path = page?.nextPage ? String(page.nextPage).replace('https://api.storyous.com', '') : null;
  }
  return out;
}

export interface BillItem { productId: string | null; name: string; amount: number; }

/** The list endpoint has no items — each bill needs its own detail call. */
export async function billItems(conn: PosConnection, billId: string): Promise<BillItem[]> {
  const d = await api(conn, `/bills/${conn.merchantId}-${conn.placeId}/${billId}`);
  return (d?.items ?? []).map((it: any) => ({
    productId: it.productId ? String(it.productId) : null,
    name: String(it.name ?? '').trim(),
    amount: Number(it.amount) || 0,
  }));
}

/** Refunded bills of one day — count and value. */
export async function listRefunds(conn: PosConnection, date: string): Promise<{ count: number; total: number }> {
  const next = new Date(date + 'T12:00:00'); next.setDate(next.getDate() + 1);
  const tillEx = next.toISOString().slice(0, 10);
  let path: string | null = `/bills/${conn.merchantId}-${conn.placeId}?from=${date}&till=${tillEx}&limit=100`;
  let count = 0, total = 0, guard = 0;
  while (path && guard < 10) {
    guard++;
    const page = await api(conn, path);
    for (const b of page?.data ?? []) {
      if (b.refunded && !b.deleted) { count++; total += Number(b.finalPrice) || 0; }
    }
    path = page?.nextPage ? String(page.nextPage).replace('https://api.storyous.com', '') : null;
  }
  return { count, total };
}
