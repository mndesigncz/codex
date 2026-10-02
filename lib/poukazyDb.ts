// Dárkové poukazy: zápis a čtení v databázi. Čistá logika (kód, stav, posudek) je v lib/poukazy.ts.
//
// Zásady:
//  • Zůstatek se mění JEN jedním příkazem `UPDATE ... WHERE balance >= částka ... RETURNING` a řádek historie
//    se zapíše ve stejném příkazu (CTE), takže dvě zařízení najednou nikdy neuplatní víc, než poukaz má,
//    a zůstatek nikdy nesedí bez záznamu v historii.
//  • Idempotence: stejné `ref` u téhož poukazu se uplatní jednou (unikátní index); opakování vrátí původní výsledek.
//  • Stav `expired` se neukládá, vyplývá z data (`stavPoukazu`); uložené jsou active / used / void.
//  • Tabulky si funkce zajistí samy při prvním použití (stejný vzor jako lib/importKartickaDb.ts), stejné DDL je
//    v app/api/init/route.ts („Kolo 74: poukazy“).

import { sql } from './client';
import { audit } from './audit';
import { generujKod, normalizujKod, kodOk, posudUplatneni, posudVraceni, stavPoukazu, MAX_DAVKA, BEZ_LIMITU, type DuvodOdmitnuti, type StavPoukazu, type LimityUplatneni } from './poukazy';

let pripraveno = false;

export async function zajistiTabulkyPoukazu(): Promise<void> {
  if (pripraveno) return;
  await sql`
    CREATE TABLE IF NOT EXISTS client_vouchers (
      id SERIAL PRIMARY KEY,
      team_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      value_amount INTEGER NOT NULL,
      balance INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'CZK',
      recipient_name TEXT,
      buyer_name TEXT,
      note TEXT,
      customer_id INTEGER,
      valid_until DATE,
      status TEXT NOT NULL DEFAULT 'active',
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (team_id, code)
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS client_voucher_uses (
      id SERIAL PRIMARY KEY,
      voucher_id INTEGER NOT NULL,
      team_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      kind TEXT NOT NULL DEFAULT 'use',
      balance_after INTEGER,
      by_user INTEGER,
      note TEXT,
      ref TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS client_vouchers_team ON client_vouchers (team_id, created_at DESC)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS client_voucher_uses_ref ON client_voucher_uses (voucher_id, ref) WHERE ref IS NOT NULL`;
  await sql`CREATE INDEX IF NOT EXISTS client_voucher_uses_voucher ON client_voucher_uses (voucher_id, created_at)`;
  // Kolo W5: e-mail obdarovaného (odeslání poukazu a připomenutí), příznaky poslaných připomenutí a limity uplatnění v profilu.
  await sql`ALTER TABLE client_vouchers ADD COLUMN IF NOT EXISTS recipient_email TEXT`;
  await sql`ALTER TABLE client_vouchers ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP`;
  await sql`ALTER TABLE client_vouchers ADD COLUMN IF NOT EXISTS expiry_notified_at DATE`;
  await sql`ALTER TABLE client_vouchers ADD COLUMN IF NOT EXISTS expiry_mailed_at DATE`;
  await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS voucher_min_use INTEGER NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS voucher_max_use INTEGER NOT NULL DEFAULT 0`;
  // Úplnost: šablona vzhledu, vazba na hosta (majitel v aplikaci, kupující s body), nejnižší účet k uplatnění, body za nákup.
  await sql`ALTER TABLE client_vouchers ADD COLUMN IF NOT EXISTS design TEXT NOT NULL DEFAULT 'klasik'`;
  await sql`ALTER TABLE client_vouchers ADD COLUMN IF NOT EXISTS buyer_customer_id INTEGER`;
  await sql`ALTER TABLE client_vouchers ADD COLUMN IF NOT EXISTS points_awarded INTEGER NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE client_vouchers ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMP`;
  await sql`CREATE INDEX IF NOT EXISTS client_vouchers_customer ON client_vouchers (customer_id) WHERE customer_id IS NOT NULL`;
  await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS voucher_min_bill INTEGER NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS voucher_points_per_100 INTEGER NOT NULL DEFAULT 0`;
  pripraveno = true;
}

export interface Poukaz {
  id: number; code: string; value_amount: number; balance: number; currency: string;
  recipient_name: string | null; buyer_name: string | null; note: string | null; customer_id: number | null;
  recipient_email: string | null; sent_at: string | null;
  /** Šablona vzhledu (tisk a e-mail). */
  design: string;
  /** Člen, kterému poukaz patří v aplikaci (vidí ho v Moje), a člen, který ho koupil (dostal body). */
  buyer_customer_id: number | null; points_awarded: number;
  valid_until: string | null; status: string; created_at: string; stav: StavPoukazu;
}

function naPoukaz(r: any, dnes: string): Poukaz {
  const p = {
    id: Number(r.id), code: String(r.code), value_amount: Number(r.value_amount), balance: Number(r.balance), currency: String(r.currency),
    recipient_name: r.recipient_name ?? null, buyer_name: r.buyer_name ?? null, note: r.note ?? null,
    customer_id: r.customer_id != null ? Number(r.customer_id) : null,
    recipient_email: r.recipient_email ?? null, sent_at: r.sent_at ? String(r.sent_at) : null,
    design: String(r.design ?? 'klasik'), buyer_customer_id: r.buyer_customer_id != null ? Number(r.buyer_customer_id) : null,
    points_awarded: Number(r.points_awarded) || 0,
    valid_until: r.valid_until ? String(r.valid_until).slice(0, 10) : null, status: String(r.status), created_at: String(r.created_at),
  };
  return { ...p, stav: stavPoukazu(p, dnes) };
}

const kratce = (v: unknown, max: number): string | null => { const s = String(v ?? '').trim().slice(0, max); return s || null; };

// ---- Vytvoření -------------------------------------------------------------------

export interface NovePoukazy {
  hodnoty: number[];
  validUntil: string | null;
  recipient?: string | null;
  buyer?: string | null;
  note?: string | null;
  /** Šablona vzhledu (lib/poukazySablony). */
  design?: string | null;
  /** Člen, kterému poukaz patří v aplikaci. */
  customerId?: number | null;
  /** Člen, který poukaz kupuje (dostane body za nákup, když je zapnuté). */
  buyerCustomerId?: number | null;
}

/** Založí dávku poukazů s unikátními kódy. Kolize kódu (téměř nemožná) se dolosuje znovu. */
export async function vytvorPoukazy(teamId: number, userId: number, mena: string, n: NovePoukazy, dnes: string): Promise<Poukaz[]> {
  await zajistiTabulkyPoukazu();
  if (n.hodnoty.length < 1 || n.hodnoty.length > MAX_DAVKA) throw new Error('Nejvýš 100 poukazů najednou.');
  const hotove: Poukaz[] = [];
  let zbyva = n.hodnoty.map((h, i) => ({ h, i }));
  for (let kolo = 0; kolo < 5 && zbyva.length; kolo++) {
    const kody = zbyva.map(() => generujKod());
    const hodnoty = zbyva.map(z => z.h);
    const radky = (await sql`
      INSERT INTO client_vouchers (team_id, code, value_amount, balance, currency, recipient_name, buyer_name, note, valid_until, created_by, design, customer_id, buyer_customer_id, claimed_at)
      SELECT ${teamId}, k.code, k.hodnota, k.hodnota, ${mena}, ${kratce(n.recipient, 80)}, ${kratce(n.buyer, 80)}, ${kratce(n.note, 300)}, ${n.validUntil}::date, ${userId},
        ${n.design || 'klasik'}, ${n.customerId ?? null}::int, ${n.buyerCustomerId ?? null}::int, CASE WHEN ${n.customerId ?? null}::int IS NULL THEN NULL ELSE NOW() END
      FROM unnest(${kody}::text[], ${hodnoty}::int[]) AS k(code, hodnota)
      ON CONFLICT (team_id, code) DO NOTHING
      RETURNING id, team_id, code, value_amount, balance, currency, recipient_name, buyer_name, note, customer_id, recipient_email, sent_at, design, buyer_customer_id, points_awarded,
        to_char(valid_until, 'YYYY-MM-DD') AS valid_until, status, created_by, created_at`) as any[];
    const zapsane = new Set(radky.map(r => String(r.code)));
    for (const r of radky) hotove.push(naPoukaz(r, dnes));
    zbyva = zbyva.filter((_, j) => !zapsane.has(kody[j]));
  }
  if (zbyva.length) throw new Error('Kódy se nepodařilo vygenerovat. Zkus to znovu.');
  await audit(teamId, userId, 'klient.poukaz.vytvoren', 'client_voucher', hotove[0]?.id ?? null,
    `${hotove.length}× poukaz, celkem ${hotove.reduce((s, p) => s + p.value_amount, 0)} ${mena}`);
  return hotove;
}

// ---- Čtení -----------------------------------------------------------------------

export interface DotazSeznam { q?: string; stav?: string; strana?: number; naStranu?: number; vse?: boolean }

/** Seznam s hledáním (kód, obdarovaný, kupující, poznámka), filtrem stavu a stránkováním. */
export async function seznamPoukazu(teamId: number, d: DotazSeznam, dnes: string): Promise<{ poukazy: Poukaz[]; celkem: number; strana: number; naStranu: number }> {
  await zajistiTabulkyPoukazu();
  const naStranu = d.vse ? 5000 : Math.max(1, Math.min(100, Math.round(d.naStranu ?? 25)));
  const strana = d.vse ? 1 : Math.max(1, Math.round(d.strana ?? 1));
  const q = String(d.q ?? '').trim().slice(0, 60);
  const vzor = q ? `%${q.replace(/[\\%_]/g, m => '\\' + m)}%` : null;
  // Kód se hledá bez pomlček a bez ohledu na velikost: „abcd 12“ najde DP-ABCD-12XX.
  const vzorKod = q ? `%${q.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^DP(?=.)/, '')}%` : null;
  const stav = ['active', 'used', 'void', 'expired'].includes(String(d.stav)) ? String(d.stav) : null;
  const rows = (await sql`
    SELECT id, team_id, code, value_amount, balance, currency, recipient_name, buyer_name, note, customer_id, recipient_email, sent_at, design, buyer_customer_id, points_awarded,
           to_char(valid_until, 'YYYY-MM-DD') AS valid_until, status, created_by, created_at, COUNT(*) OVER () AS celkem
    FROM client_vouchers
    WHERE team_id = ${teamId}
      AND (${vzor}::text IS NULL OR REPLACE(code, '-', '') LIKE ${vzorKod} OR recipient_name ILIKE ${vzor} OR buyer_name ILIKE ${vzor} OR note ILIKE ${vzor})
      AND (${stav}::text IS NULL
        OR (${stav} = 'void' AND status = 'void')
        OR (${stav} = 'used' AND status <> 'void' AND balance <= 0)
        OR (${stav} = 'expired' AND status = 'active' AND balance > 0 AND valid_until < ${dnes}::date)
        OR (${stav} = 'active' AND status = 'active' AND balance > 0 AND (valid_until IS NULL OR valid_until >= ${dnes}::date)))
    ORDER BY created_at DESC, id DESC
    LIMIT ${naStranu} OFFSET ${(strana - 1) * naStranu}`) as any[];
  return { poukazy: rows.map(r => naPoukaz(r, dnes)), celkem: rows.length ? Number(rows[0].celkem) : 0, strana, naStranu };
}

export async function poukazPodleKodu(teamId: number, kod: string, dnes: string): Promise<Poukaz | null> {
  await zajistiTabulkyPoukazu();
  const [r] = await sql`SELECT id, team_id, code, value_amount, balance, currency, recipient_name, buyer_name, note, customer_id, recipient_email, sent_at, design, buyer_customer_id, points_awarded,
    to_char(valid_until, 'YYYY-MM-DD') AS valid_until, status, created_by, created_at FROM client_vouchers WHERE team_id = ${teamId} AND code = ${kod}`;
  return r ? naPoukaz(r, dnes) : null;
}

export async function poukazPodleId(teamId: number, id: number, dnes: string): Promise<Poukaz | null> {
  await zajistiTabulkyPoukazu();
  const [r] = await sql`SELECT id, team_id, code, value_amount, balance, currency, recipient_name, buyer_name, note, customer_id, recipient_email, sent_at, design, buyer_customer_id, points_awarded,
    to_char(valid_until, 'YYYY-MM-DD') AS valid_until, status, created_by, created_at FROM client_vouchers WHERE team_id = ${teamId} AND id = ${id}`;
  return r ? naPoukaz(r, dnes) : null;
}

export interface Pouziti { id: number; kind: string; amount: number; balance_after: number | null; by_name: string | null; note: string | null; ref: string | null; created_at: string }

export async function historiePoukazu(teamId: number, voucherId: number): Promise<Pouziti[]> {
  await zajistiTabulkyPoukazu();
  const rows = (await sql`
    SELECT u.id, u.kind, u.amount, u.balance_after, us.name AS by_name, u.note, u.ref, u.created_at
    FROM client_voucher_uses u LEFT JOIN users us ON us.id = u.by_user
    WHERE u.voucher_id = ${voucherId} AND u.team_id = ${teamId}
    ORDER BY u.created_at DESC, u.id DESC`) as any[];
  return rows.map(r => ({ id: Number(r.id), kind: String(r.kind), amount: Number(r.amount), balance_after: r.balance_after != null ? Number(r.balance_after) : null,
    by_name: r.by_name ?? null, note: r.note ?? null, ref: r.ref ?? null, created_at: String(r.created_at) }));
}

// ---- Limity uplatnění (nastavení podniku) ----

/** Nejmenší a největší částka jednoho uplatnění (0 = bez omezení). Chybí-li sloupec nebo profil, bez omezení. */
export async function nactiLimity(teamId: number): Promise<LimityUplatneni> {
  try {
    await zajistiTabulkyPoukazu();
    const [r] = await sql`SELECT voucher_min_use, voucher_max_use, voucher_min_bill FROM client_profiles WHERE team_id = ${teamId}`;
    return {
      min: Math.max(0, Math.trunc(Number(r?.voucher_min_use)) || 0), max: Math.max(0, Math.trunc(Number(r?.voucher_max_use)) || 0),
      minUtrata: Math.max(0, Math.trunc(Number(r?.voucher_min_bill)) || 0),
    };
  } catch { return BEZ_LIMITU; }
}

/** Uloží limity (už ověřené normalizujLimity) a zapíše do historie změn. Vrací false, když podnik nemá profil. */
export async function ulozLimity(teamId: number, userId: number, limity: LimityUplatneni): Promise<boolean> {
  await zajistiTabulkyPoukazu();
  const rows = await sql`UPDATE client_profiles SET voucher_min_use = ${limity.min}, voucher_max_use = ${limity.max} WHERE team_id = ${teamId} RETURNING team_id` as any[];
  if (!rows.length) return false;
  await audit(teamId, userId, 'klient.poukaz.limity', 'client_profile', teamId, `uplatnění: nejméně ${limity.min || 'bez limitu'}, nejvíce ${limity.max || 'bez limitu'}`);
  return true;
}

// ---- Změny zůstatku ----------------------------------------------------------------

export type Vysledek =
  | { ok: true; poukaz: Poukaz; castka: number; opakovani: boolean }
  | { ok: false; duvod: DuvodOdmitnuti | 'souboh'; poukaz?: Poukaz; limity?: LimityUplatneni };

const jeDuplicita = (e: any) => /duplicate key|unique/i.test(String(e?.message ?? e)) || String(e?.code) === '23505';

/** Uplatní `castka` z poukazu atomicky. `ref` dělá volání idempotentní (dvojklik, opakování po výpadku sítě). */
export async function uplatniPoukaz(teamId: number, userId: number, kod: string, castka: number, o: { ref?: string | null; note?: string | null; mena?: string | null; dnes: string; utrata?: number | null }): Promise<Vysledek> {
  await zajistiTabulkyPoukazu();
  const p = await poukazPodleKodu(teamId, kod, o.dnes);
  const ref = kratce(o.ref, 80);
  // Opakované volání s týmž ref: původní výsledek, nic se neodečte podruhé.
  if (p && ref) {
    const [u] = await sql`SELECT amount FROM client_voucher_uses WHERE voucher_id = ${p.id} AND ref = ${ref} AND kind = 'use'`;
    if (u) return { ok: true, poukaz: p, castka: Number(u.amount), opakovani: true };
  }
  const limity = await nactiLimity(teamId);
  const posudek = posudUplatneni(p, castka, o.dnes, o.mena, limity, o.utrata);
  if (!posudek.ok || !p) return { ok: false, duvod: posudek.ok ? 'nenalezen' : posudek.duvod, poukaz: p ?? undefined, limity };
  try {
    const zapsano = (await sql`
      WITH upd AS (
        UPDATE client_vouchers
        SET balance = balance - ${castka}, status = CASE WHEN balance - ${castka} = 0 THEN 'used' ELSE 'active' END
        WHERE id = ${p.id} AND team_id = ${teamId} AND status = 'active' AND balance >= ${castka}
          AND (valid_until IS NULL OR valid_until >= ${o.dnes}::date)
          AND (${limity.max}::int = 0 OR ${castka}::int <= ${limity.max}::int)
          AND (${limity.min}::int = 0 OR ${castka}::int >= ${limity.min}::int OR balance = ${castka}::int)
        RETURNING id, balance)
      INSERT INTO client_voucher_uses (voucher_id, team_id, amount, kind, balance_after, by_user, note, ref)
      SELECT id, ${teamId}, ${castka}, 'use', balance, ${userId}, ${kratce(o.note, 200)}, ${ref} FROM upd
      RETURNING id`) as any[];
    if (!zapsano.length) {
      // Mezitím ho někdo uplatnil, zrušil nebo mu skončila platnost: ukaž aktuální důvod.
      const ted = await poukazPodleKodu(teamId, kod, o.dnes);
      const znovu = posudUplatneni(ted, castka, o.dnes, o.mena, limity, o.utrata);
      return { ok: false, duvod: znovu.ok ? 'souboh' : znovu.duvod, poukaz: ted ?? undefined, limity };
    }
  } catch (e) {
    if (ref && jeDuplicita(e)) {
      const ted = await poukazPodleKodu(teamId, kod, o.dnes);
      return { ok: true, poukaz: ted ?? p, castka, opakovani: true };
    }
    throw e;
  }
  const po = (await poukazPodleId(teamId, p.id, o.dnes)) ?? p;
  await audit(teamId, userId, 'klient.poukaz.uplatnen', 'client_voucher', p.id, `${p.code}: −${castka} ${p.currency}, zbývá ${po.balance}`);
  return { ok: true, poukaz: po, castka, opakovani: false };
}

/** Vrátí část uplatněné částky (storno omylu): zůstatek nikdy nepřeroste původní hodnotu. */
export async function vratPoukaz(teamId: number, userId: number, id: number, castka: number, o: { note?: string | null; ref?: string | null; dnes: string }): Promise<Vysledek> {
  await zajistiTabulkyPoukazu();
  const p = await poukazPodleId(teamId, id, o.dnes);
  const posudek = posudVraceni(p, castka);
  if (!posudek.ok || !p) return { ok: false, duvod: posudek.ok ? 'nenalezen' : posudek.duvod, poukaz: p ?? undefined };
  const ref = kratce(o.ref, 80);
  try {
    const zapsano = (await sql`
      WITH upd AS (
        UPDATE client_vouchers SET balance = balance + ${castka}, status = 'active'
        WHERE id = ${p.id} AND team_id = ${teamId} AND status IN ('active', 'used') AND balance + ${castka} <= value_amount
        RETURNING id, balance)
      INSERT INTO client_voucher_uses (voucher_id, team_id, amount, kind, balance_after, by_user, note, ref)
      SELECT id, ${teamId}, ${castka}, 'refund', balance, ${userId}, ${kratce(o.note, 200)}, ${ref} FROM upd
      RETURNING id`) as any[];
    if (!zapsano.length) return { ok: false, duvod: 'souboh', poukaz: (await poukazPodleId(teamId, id, o.dnes)) ?? p };
  } catch (e) {
    if (ref && jeDuplicita(e)) return { ok: true, poukaz: (await poukazPodleId(teamId, id, o.dnes)) ?? p, castka, opakovani: true };
    throw e;
  }
  const po = (await poukazPodleId(teamId, id, o.dnes)) ?? p;
  await audit(teamId, userId, 'klient.poukaz.vracen', 'client_voucher', p.id, `${p.code}: +${castka} ${p.currency}, zbývá ${po.balance}`);
  return { ok: true, poukaz: po, castka, opakovani: false };
}

/** Zruší poukaz: zbývající zůstatek se vynuluje a zapíše se do historie. Zrušený se už neobnovuje. */
export async function zrusPoukaz(teamId: number, userId: number, id: number, dnes: string, note?: string | null): Promise<Poukaz | null> {
  await zajistiTabulkyPoukazu();
  const zapsano = (await sql`
    WITH stary AS (SELECT id, balance FROM client_vouchers WHERE id = ${id} AND team_id = ${teamId} AND status <> 'void' FOR UPDATE),
    upd AS (UPDATE client_vouchers v SET status = 'void', balance = 0 FROM stary WHERE v.id = stary.id RETURNING v.id)
    INSERT INTO client_voucher_uses (voucher_id, team_id, amount, kind, balance_after, by_user, note)
    SELECT stary.id, ${teamId}, stary.balance, 'void', 0, ${userId}, ${kratce(note, 200)} FROM stary JOIN upd ON upd.id = stary.id
    RETURNING amount`) as any[];
  const p = await poukazPodleId(teamId, id, dnes);
  if (zapsano.length && p) await audit(teamId, userId, 'klient.poukaz.zrusen', 'client_voucher', id, `${p.code}: zrušeno se zůstatkem ${Number(zapsano[0].amount)} ${p.currency}`);
  return p;
}

/** Úprava poznámky, jmen a platnosti (prodloužení i zkrácení). Zrušený poukaz se neupravuje. */
export async function upravPoukaz(teamId: number, userId: number, id: number, zmeny: { validUntil?: string | null; note?: string | null; recipient?: string | null; buyer?: string | null }, dnes: string): Promise<Poukaz | null> {
  await zajistiTabulkyPoukazu();
  const maDatum = 'validUntil' in zmeny, maPoznamku = 'note' in zmeny, maObdarovaneho = 'recipient' in zmeny, maKupujiciho = 'buyer' in zmeny;
  const rows = (await sql`
    UPDATE client_vouchers SET
      valid_until = CASE WHEN ${maDatum} THEN ${zmeny.validUntil ?? null}::date ELSE valid_until END,
      expiry_notified_at = CASE WHEN ${maDatum} THEN NULL ELSE expiry_notified_at END,
      expiry_mailed_at = CASE WHEN ${maDatum} THEN NULL ELSE expiry_mailed_at END,
      note = CASE WHEN ${maPoznamku} THEN ${kratce(zmeny.note, 300)} ELSE note END,
      recipient_name = CASE WHEN ${maObdarovaneho} THEN ${kratce(zmeny.recipient, 80)} ELSE recipient_name END,
      buyer_name = CASE WHEN ${maKupujiciho} THEN ${kratce(zmeny.buyer, 80)} ELSE buyer_name END
    WHERE id = ${id} AND team_id = ${teamId} AND status <> 'void'
    RETURNING id, code`) as any[];
  if (!rows.length) return null;
  const detail = [maDatum ? `platnost do ${zmeny.validUntil ?? 'bez omezení'}` : '', maPoznamku ? 'poznámka' : '', maObdarovaneho || maKupujiciho ? 'jména' : ''].filter(Boolean).join(', ');
  await audit(teamId, userId, 'klient.poukaz.upraven', 'client_voucher', id, `${rows[0].code}: ${detail}`);
  return poukazPodleId(teamId, id, dnes);
}

// ---- Host (jen čtení) ----------------------------------------------------------------

/**
 * Co smí vidět host, který opsal kód: jen zůstatek, měnu a platnost PLATNÉHO poukazu. Cokoli jiného (neexistuje,
 * špatný kontrolní znak, zrušený, vyčerpaný, propadlý) je pro hosta stejné `null`, ať se z odpovědi nedá poznat,
 * které kódy existují. Jména a poznámky se hostovi nikdy nevrací.
 */
export async function poukazProHosta(teamId: number, vstup: unknown, dnes: string): Promise<{ balance: number; value_amount: number; currency: string; valid_until: string | null } | null> {
  const kod = normalizujKod(vstup);
  if (!kod || !kodOk(kod)) return null;
  const p = await poukazPodleKodu(teamId, kod, dnes);
  if (!p || p.stav !== 'active') return null;
  return { balance: p.balance, value_amount: p.value_amount, currency: p.currency, valid_until: p.valid_until };
}
