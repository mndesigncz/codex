// Storyous (Teya) POS client. Read-only: we pull closed bills to know the real
// revenue — nothing is ever written back to the register.
//
// Auth: POST login.storyous.com/api/auth/authorize (client_credentials) → 1h token.
// Bills: GET api.storyous.com/bills/{merchantId}-{placeId}?from&till&limit → { data, nextPage }.

import { neon } from '@neondatabase/serverless';

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
}

/** Paid, non-refunded bills of one day, summed by payment method. */
export async function daySummary(conn: PosConnection, date: string): Promise<DaySummary> {
  const out: DaySummary = { date, bills: 0, total: 0, cash: 0, card: 0, other: 0, tips: 0 };
  const next = new Date(date + 'T12:00:00'); next.setDate(next.getDate() + 1);
  const till = next.toISOString().slice(0, 10);
  let path: string | null = `/bills/${conn.merchantId}-${conn.placeId}?from=${date}&till=${till}&limit=100`;
  let guard = 0;
  while (path && guard < 10) {
    guard++;
    const page = await api(conn, path);
    for (const b of page?.data ?? []) {
      if (b.deleted || b.refunded) continue;
      const price = Number(b.finalPrice) || 0;
      out.bills++;
      out.total += price;
      out.tips += Number(b.tips) || 0;
      const pm = String(b.paymentMethod ?? '').toLowerCase();
      if (pm === 'cash') out.cash += price;
      else if (pm.includes('card')) out.card += price;
      else out.other += price;
    }
    path = page?.nextPage ? String(page.nextPage).replace('https://api.storyous.com', '') : null;
  }
  return out;
}
