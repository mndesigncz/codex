// Fyzické kartičky — databáze: dávky k tisku, seznam karet, blokace, náhrada, přiřazení
// hostovi u kasy, host bez aplikace, připojení karty v aplikaci hosta a převzetí čísel
// starých karet z importu. Pravidla (tvar kódu, kdo smí co) jsou v lib/kartyFyzicke.ts.
//
// Hledání karty u kasy je v lib/client.ts (najdiKartu), protože ho používají všechny cesty
// skenu a lib/client.ts by sem jinak importoval v kruhu.

import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { sql, najdiKartu, join } from './client';
import { audit } from './audit';
import { slucClena } from './clenoveDb';
import {
  kodZBajtu, managerovyKod, ciziCislo, klicCiziKarty, kodyKHledani, zobrazitelnyKod, emailBezAplikace, jeBezAplikace,
  maskaEmailu, maskaTelefonu, rozhodniAktivaci, rozhodniBlokaci, rozhodniNahradu, rozhodniPripojeni,
  type KartaStav, type NovyHost, type StavKarty, type ZdrojKarty,
} from './kartyFyzicke';

let pripraveno = false;

/**
 * Tabulky karet. Stejné příkazy jsou v app/api/init/route.ts (odtud je čte kontrola SQL); tady se spustí
 * jednou za studený start, ať karty fungují i dřív, než někdo po nasazení otevře /api/init.
 */
export async function zajistiTabulkyKaret(): Promise<void> {
  if (pripraveno) return;
  await sql`
    CREATE TABLE IF NOT EXISTS client_card_batches (
      id SERIAL PRIMARY KEY,
      team_id INTEGER NOT NULL,
      nazev TEXT,
      pocet INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS client_card_aliases (
      id SERIAL PRIMARY KEY,
      team_id INTEGER NOT NULL,
      kod TEXT NOT NULL UNIQUE,
      customer_id INTEGER,
      stav TEXT NOT NULL DEFAULT 'nova',
      zdroj TEXT NOT NULL DEFAULT 'davka',
      davka_id INTEGER,
      nahrazuje_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      activated_at TIMESTAMP,
      blocked_at TIMESTAMP
    )`;
  await sql`CREATE INDEX IF NOT EXISTS client_card_aliases_team ON client_card_aliases (team_id, davka_id)`;
  await sql`CREATE INDEX IF NOT EXISTS client_card_aliases_customer ON client_card_aliases (customer_id)`;
  await sql`CREATE INDEX IF NOT EXISTS client_card_batches_team ON client_card_batches (team_id, created_at)`;
  pripraveno = true;
}

// ---- Seznamy -----------------------------------------------------------------------------

export interface Davka { id: number; nazev: string; pocet: number; nove: number; aktivni: number; blokovane: number; created_at: string }
export interface KartaRadek {
  id: number; kod: string; cislo: string; stav: StavKarty; zdroj: ZdrojKarty; davkaId: number | null;
  hostId: number | null; host: string | null; bezAplikace: boolean;
  created_at: string; activated_at: string | null; blocked_at: string | null;
}

const naRadek = (r: any): KartaRadek => ({
  id: Number(r.id), kod: String(r.kod), cislo: zobrazitelnyKod(String(r.kod)), stav: r.stav as StavKarty, zdroj: (r.zdroj ?? 'davka') as ZdrojKarty,
  davkaId: r.davka_id == null ? null : Number(r.davka_id), hostId: r.customer_id == null ? null : Number(r.customer_id),
  host: r.host == null ? null : String(r.host), bezAplikace: jeBezAplikace(r.host_email),
  created_at: String(r.created_at), activated_at: r.activated_at ? String(r.activated_at) : null, blocked_at: r.blocked_at ? String(r.blocked_at) : null,
});

export async function seznamDavek(teamId: number): Promise<{ davky: Davka[]; pocty: Record<StavKarty, number>; zImportu: number }> {
  await zajistiTabulkyKaret();
  const rows = (await sql`
    SELECT b.id, b.nazev, b.pocet, b.created_at,
      COUNT(a.id) FILTER (WHERE a.stav = 'nova')::int AS nove,
      COUNT(a.id) FILTER (WHERE a.stav = 'aktivni')::int AS aktivni,
      COUNT(a.id) FILTER (WHERE a.stav = 'blokovana')::int AS blokovane
    FROM client_card_batches b
    LEFT JOIN client_card_aliases a ON a.davka_id = b.id AND a.team_id = b.team_id
    WHERE b.team_id = ${teamId}
    GROUP BY b.id ORDER BY b.created_at DESC, b.id DESC LIMIT 50`) as any[];
  const souhrn = (await sql`
    SELECT stav, zdroj, COUNT(*)::int AS n FROM client_card_aliases WHERE team_id = ${teamId} GROUP BY stav, zdroj`) as any[];
  const pocty: Record<StavKarty, number> = { nova: 0, aktivni: 0, blokovana: 0 };
  let zImportu = 0;
  for (const s of souhrn) {
    if (s.stav in pocty) pocty[s.stav as StavKarty] += Number(s.n);
    if (s.zdroj === 'import') zImportu += Number(s.n);
  }
  return {
    davky: rows.map(r => ({
      id: Number(r.id), nazev: r.nazev ? String(r.nazev) : `Dávka ${r.id}`, pocet: Number(r.pocet), created_at: String(r.created_at),
      nove: Number(r.nove), aktivni: Number(r.aktivni), blokovane: Number(r.blokovane),
    })),
    pocty, zImportu,
  };
}

const ESC_LIKE = (s: string) => s.replace(/[\\%_]/g, m => `\\${m}`);

export async function seznamKaret(teamId: number, f: { davkaId?: number | null; stav?: StavKarty | null; q?: string | null; limit?: number; offset?: number }): Promise<{ karty: KartaRadek[]; dalsi: boolean }> {
  await zajistiTabulkyKaret();
  const limit = Math.max(1, Math.min(200, f.limit ?? 60));
  const offset = Math.max(0, f.offset ?? 0);
  const q = (f.q ?? '').trim().slice(0, 60);
  const vzor = q ? `%${ESC_LIKE(q)}%` : null;
  const vzorKod = q ? `%${ESC_LIKE(q.toUpperCase().replace(/[^A-Z0-9]/g, ''))}%` : null;
  const rows = (await sql`
    SELECT a.id, a.kod, a.stav, a.zdroj, a.davka_id, a.customer_id, a.created_at, a.activated_at, a.blocked_at,
           u.name AS host, u.email AS host_email
    FROM client_card_aliases a LEFT JOIN users u ON u.id = a.customer_id
    WHERE a.team_id = ${teamId}
      AND (${f.davkaId ?? null}::int IS NULL OR a.davka_id = ${f.davkaId ?? null}::int)
      AND (${f.stav ?? null}::text IS NULL OR a.stav = ${f.stav ?? null}::text)
      AND (${vzor}::text IS NULL OR u.name ILIKE ${vzor}::text OR replace(a.kod, '-', '') ILIKE ${vzorKod}::text)
    ORDER BY a.id DESC
    LIMIT ${limit + 1} OFFSET ${offset}`) as any[];
  return { karty: rows.slice(0, limit).map(naRadek), dalsi: rows.length > limit };
}

/** Karty jedné dávky k tisku (jen nepřiřazené: přiřazená karta se znovu netiskne, vznikl by dvojník). */
export async function kartyKTisku(teamId: number, davkaId: number): Promise<{ davka: Davka | null; kody: string[]; vynechano: number }> {
  await zajistiTabulkyKaret();
  const [b] = await sql`SELECT id, nazev, pocet, created_at FROM client_card_batches WHERE id = ${davkaId} AND team_id = ${teamId}`;
  if (!b) return { davka: null, kody: [], vynechano: 0 };
  const rows = (await sql`SELECT kod, stav FROM client_card_aliases WHERE team_id = ${teamId} AND davka_id = ${davkaId} ORDER BY id`) as any[];
  const kody = rows.filter(r => r.stav === 'nova').map(r => String(r.kod));
  return {
    davka: { id: Number(b.id), nazev: b.nazev ? String(b.nazev) : `Dávka ${b.id}`, pocet: Number(b.pocet), created_at: String(b.created_at), nove: kody.length, aktivni: 0, blokovane: 0 },
    kody, vynechano: rows.length - kody.length,
  };
}

/** Jedna karta k tisku (poškozená karta, náhrada). Zablokovaná se netiskne. */
export async function kartaKTisku(teamId: number, id: number): Promise<string | null> {
  await zajistiTabulkyKaret();
  const [a] = await sql`SELECT kod, stav FROM client_card_aliases WHERE id = ${id} AND team_id = ${teamId}`;
  return a && a.stav !== 'blokovana' && managerovyKod(a.kod) ? String(a.kod) : null;
}

// ---- Dávka -------------------------------------------------------------------------------

/**
 * Nová dávka karet. Kódy jsou náhodné; kolize (s jinou kartou nebo s kartičkou z aplikace)
 * se přeskočí a dogenerují. Zapisuje se množinově, 500 karet je jeden dotaz.
 */
export async function vytvorDavku(teamId: number, userId: number, pocet: number, nazev: string | null): Promise<{ id: number; pocet: number }> {
  await zajistiTabulkyKaret();
  const [d] = await sql`
    INSERT INTO client_card_batches (team_id, nazev, pocet, created_by) VALUES (${teamId}, ${nazev}, ${pocet}, ${userId}) RETURNING id`;
  const davkaId = Number(d.id);
  let zbyva = pocet;
  for (let pokus = 0; zbyva > 0 && pokus < 6; pokus++) {
    const kody = Array.from(new Set(Array.from({ length: zbyva }, () => kodZBajtu(crypto.randomBytes(8)))));
    const vlozene = (await sql`
      INSERT INTO client_card_aliases (team_id, kod, stav, zdroj, davka_id)
      SELECT ${teamId}, t.kod, 'nova', 'davka', ${davkaId}
      FROM unnest(${kody}::text[]) AS t(kod)
      WHERE NOT EXISTS (SELECT 1 FROM client_cards c WHERE c.code = t.kod)
      ON CONFLICT (kod) DO NOTHING
      RETURNING id`) as any[];
    zbyva -= vlozene.length;
  }
  const vytvoreno = pocet - zbyva;
  if (zbyva > 0) await sql`UPDATE client_card_batches SET pocet = ${vytvoreno} WHERE id = ${davkaId}`;
  if (!nazev) await sql`UPDATE client_card_batches SET nazev = ${`Dávka ${davkaId}`} WHERE id = ${davkaId}`;
  void audit(teamId, userId, 'client.karta.davka', 'client_card_batches', davkaId, `${nazev ?? `Dávka ${davkaId}`}: ${vytvoreno} karet`);
  return { id: davkaId, pocet: vytvoreno };
}

// ---- Jedna karta -------------------------------------------------------------------------

async function kartaPodleId(teamId: number, id: number): Promise<(KartaStav & { id: number; kod: string }) | null> {
  const [a] = await sql`SELECT id, team_id, kod, stav, customer_id FROM client_card_aliases WHERE id = ${id} AND team_id = ${teamId}`;
  return a ? { id: Number(a.id), kod: String(a.kod), teamId: Number(a.team_id), stav: a.stav as StavKarty, customerId: a.customer_id == null ? null : Number(a.customer_id) } : null;
}

/** Karta podle kódu z karty (kód Managera, nebo staré číslo v podniku). */
async function kartaPodleKodu(raw: string, teamId: number): Promise<(KartaStav & { id: number; kod: string }) | null> {
  const kody = kodyKHledani(raw, teamId);
  if (!kody.length) return null;
  const [a] = await sql`
    SELECT id, team_id, kod, stav, customer_id FROM client_card_aliases
    WHERE kod = ANY(${kody}) ORDER BY (kod LIKE 'T%:%') LIMIT 1`;
  return a ? { id: Number(a.id), kod: String(a.kod), teamId: Number(a.team_id), stav: a.stav as StavKarty, customerId: a.customer_id == null ? null : Number(a.customer_id) } : null;
}

export type Vysledek<T = object> = ({ ok: true } & T) | { ok: false; status: number; chyba: string };

export async function zablokujKartu(teamId: number, userId: number, id: number): Promise<Vysledek<{ kod: string }>> {
  await zajistiTabulkyKaret();
  const k = await kartaPodleId(teamId, id);
  const r = rozhodniBlokaci(k, teamId);
  if (!r.ok) return { ok: false, status: r.status, chyba: r.chyba };
  const [u] = await sql`
    UPDATE client_card_aliases SET stav = 'blokovana', blocked_at = NOW()
    WHERE id = ${id} AND team_id = ${teamId} AND stav <> 'blokovana' RETURNING kod, customer_id`;
  if (!u) return { ok: false, status: 409, chyba: 'Karta už je zablokovaná.' };
  void audit(teamId, userId, 'client.karta.blokace', 'client', u.customer_id == null ? null : Number(u.customer_id), `Karta ${zobrazitelnyKod(String(u.kod))}`);
  return { ok: true, kod: zobrazitelnyKod(String(u.kod)) };
}

/**
 * Náhrada ztracené karty: host dostane novou kartu (opsanou z krabice, nebo nově vytvořenou
 * k vytištění), stará se zablokuje. Body a razítka jsou na účtu hosta, karta je jen klíč.
 */
export async function nahradKartu(teamId: number, userId: number, id: number, novyKod: string | null): Promise<Vysledek<{ nova: { id: number; kod: string }; tisk: boolean }>> {
  await zajistiTabulkyKaret();
  const stara = await kartaPodleId(teamId, id);
  const nova = novyKod ? await kartaPodleKodu(novyKod, teamId) : undefined;
  if (novyKod && nova && stara && nova.id === stara.id) return { ok: false, status: 400, chyba: 'Nová karta je stejná jako stará.' };
  const r = rozhodniNahradu(stara, nova, teamId);
  if (!r.ok) return { ok: false, status: r.status, chyba: r.chyba };
  const hostId = stara!.customerId!;
  let novaKarta: { id: number; kod: string } | null = null;
  if (nova) {
    const [u] = await sql`
      UPDATE client_card_aliases SET customer_id = ${hostId}, stav = 'aktivni', activated_at = NOW(), nahrazuje_id = ${stara!.id}
      WHERE id = ${nova.id} AND team_id = ${teamId} AND stav = 'nova' AND customer_id IS NULL RETURNING id, kod`;
    if (!u) return { ok: false, status: 409, chyba: 'Nová karta mezitím připadla jinému hostovi.' };
    novaKarta = { id: Number(u.id), kod: String(u.kod) };
  } else {
    for (let pokus = 0; pokus < 5 && !novaKarta; pokus++) {
      const kod = kodZBajtu(crypto.randomBytes(8));
      const [u] = await sql`
        INSERT INTO client_card_aliases (team_id, kod, customer_id, stav, zdroj, nahrazuje_id, activated_at)
        SELECT ${teamId}, ${kod}, ${hostId}, 'aktivni', 'nahrada', ${stara!.id}, NOW()
        WHERE NOT EXISTS (SELECT 1 FROM client_cards c WHERE c.code = ${kod})
        ON CONFLICT (kod) DO NOTHING RETURNING id, kod`;
      if (u) novaKarta = { id: Number(u.id), kod: String(u.kod) };
    }
    if (!novaKarta) return { ok: false, status: 500, chyba: 'Novou kartu se nepodařilo vytvořit. Zkus to znovu.' };
  }
  await sql`UPDATE client_card_aliases SET stav = 'blokovana', blocked_at = NOW() WHERE id = ${stara!.id} AND team_id = ${teamId}`;
  void audit(teamId, userId, 'client.karta.nahrada', 'client', hostId, `Karta ${zobrazitelnyKod(stara!.kod)} → ${zobrazitelnyKod(novaKarta.kod)}`);
  return { ok: true, nova: { id: novaKarta.id, kod: zobrazitelnyKod(novaKarta.kod) }, tisk: !nova };
}

// ---- U kasy: přiřazení hostovi -------------------------------------------------------------

/** Nová karta naskenovaná u kasy se přiřadí hostovi; host se stane členem podniku. */
export async function aktivujKartu(teamId: number, staffId: number, kodRaw: string, customerId: number): Promise<Vysledek<{ host: { id: number; name: string }; kod: string }>> {
  await zajistiTabulkyKaret();
  const n = await najdiKartu(kodRaw, teamId);
  if (n?.typ === 'host' && !n.karta) return { ok: false, status: 409, chyba: 'To je kartička z aplikace hosta, ne plastová karta.' };
  const stav: KartaStav | null = !n ? null
    : n.typ === 'nova' ? { stav: 'nova', teamId: n.teamId, customerId: null }
    : n.typ === 'blokovana' ? { stav: 'blokovana', teamId: n.teamId, customerId: null }
    : { stav: 'aktivni', teamId: n.karta!.teamId, customerId: n.id };
  const r = rozhodniAktivaci(stav, teamId);
  if (!r.ok) return { ok: false, status: r.status, chyba: r.chyba };
  const kartaId = n!.typ === 'nova' ? n!.kartaId : 0;
  let host: any;
  try { [host] = await sql`SELECT id, name FROM users WHERE id = ${customerId} AND role = 'customer' AND deleted_at IS NULL`; }
  catch { [host] = await sql`SELECT id, name FROM users WHERE id = ${customerId} AND role = 'customer'`; }
  if (!host) return { ok: false, status: 404, chyba: 'Hosta nenacházíme.' };
  const [u] = await sql`
    UPDATE client_card_aliases SET customer_id = ${customerId}, stav = 'aktivni', activated_at = NOW()
    WHERE id = ${kartaId} AND team_id = ${teamId} AND stav = 'nova' AND customer_id IS NULL RETURNING kod`;
  if (!u) return { ok: false, status: 409, chyba: 'Karta mezitím připadla jinému hostovi.' };
  // Členství bez razítka a bodů (jako „Přidat mezi členy“ u čtečky); uvítací kupony dostane jako každý nový člen.
  await join(customerId, teamId);
  void audit(teamId, staffId, 'client.karta.aktivace', 'client', customerId, `${host.name} · karta ${zobrazitelnyKod(String(u.kod))}`);
  return { ok: true, host: { id: Number(host.id), name: String(host.name) }, kod: String(u.kod) };
}

/**
 * Host bez aplikace (založí obsluha u kasy): stejně jako import z Kartičky dostane účet hosta
 * s nepoužitelným heslem a bez souhlasu s novinkami. Bez e-mailu má technický e-mail
 * (lib/kartyFyzicke.ts, emailBezAplikace) a převezme si ho připojením karty v aplikaci;
 * s e-mailem se do účtu dostane přes „Zapomenuté heslo“ jako importovaný člen.
 */
export async function zalozHostaBezAplikace(teamId: number, staffId: number, h: NovyHost): Promise<Vysledek<{ host: { id: number; name: string } }>> {
  if (h.email) {
    const [ex] = await sql`SELECT id FROM users WHERE lower(email) = ${h.email}`;
    if (ex) return { ok: false, status: 409, chyba: 'S tímhle e-mailem už účet je. Vyhledej hosta podle e-mailu.' };
  }
  const hash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
  const email = h.email ?? emailBezAplikace(crypto.randomBytes(9).toString('hex'));
  const prefs = JSON.stringify({ novinky: false, bezAplikace: !h.email, zalozenoUKasy: teamId });
  let row: any;
  try {
    [row] = await sql`
      INSERT INTO users (name, email, password_hash, role, avatar, job_title, phone, notif_prefs)
      VALUES (${h.jmeno}, ${email}, ${hash}, 'customer', '👤', 'Host', ${h.telefon}, ${prefs}::jsonb)
      ON CONFLICT DO NOTHING RETURNING id, name`;
  } catch {
    // Před migrací (sloupec notif_prefs ještě není): výchozí stav je bez souhlasu s novinkami.
    [row] = await sql`
      INSERT INTO users (name, email, password_hash, role, avatar, job_title, phone)
      VALUES (${h.jmeno}, ${email}, ${hash}, 'customer', '👤', 'Host', ${h.telefon})
      ON CONFLICT DO NOTHING RETURNING id, name`;
  }
  if (!row) return { ok: false, status: 409, chyba: 'S tímhle e-mailem už účet je. Vyhledej hosta podle e-mailu.' };
  void audit(teamId, staffId, 'client.karta.host', 'client', Number(row.id), String(row.name));
  return { ok: true, host: { id: Number(row.id), name: String(row.name) } };
}

export interface NalezenyHost { id: number; name: string; kontakt: string | null; clen: boolean; body: number; bezAplikace: boolean }

/**
 * Hledání hosta u kasy: členové podniku podle jména, e-mailu nebo telefonu; mimo členy jen
 * přesná shoda e-mailu (host s aplikací, který tu ještě nebyl — svůj e-mail obsluze řekne sám).
 * Kontakt se obsluze ukáže zakrytý.
 */
export async function hledejHosty(teamId: number, d: { text: string; cislice: string; email: boolean }): Promise<NalezenyHost[]> {
  const vzor = `%${ESC_LIKE(d.text)}%`;
  const vzorTel = d.cislice ? `%${d.cislice.slice(-9)}` : null;
  let rows: any[];
  const dotaz = (sDeleted: boolean) => sDeleted
    ? sql`
        SELECT u.id, u.name, u.email, u.phone, m.points
        FROM client_memberships m JOIN users u ON u.id = m.customer_id
        WHERE m.team_id = ${teamId} AND u.deleted_at IS NULL
          AND (u.name ILIKE ${vzor} OR u.email ILIKE ${vzor}
               OR (${vzorTel}::text IS NOT NULL AND regexp_replace(COALESCE(u.phone, ''), '[^0-9]', '', 'g') LIKE ${vzorTel}::text))
        ORDER BY m.last_visit_at DESC NULLS LAST, u.name LIMIT 10`
    : sql`
        SELECT u.id, u.name, u.email, u.phone, m.points
        FROM client_memberships m JOIN users u ON u.id = m.customer_id
        WHERE m.team_id = ${teamId}
          AND (u.name ILIKE ${vzor} OR u.email ILIKE ${vzor}
               OR (${vzorTel}::text IS NOT NULL AND regexp_replace(COALESCE(u.phone, ''), '[^0-9]', '', 'g') LIKE ${vzorTel}::text))
        ORDER BY m.last_visit_at DESC NULLS LAST, u.name LIMIT 10`;
  try { rows = (await dotaz(true)) as any[]; } catch { rows = (await dotaz(false)) as any[]; }
  const out: NalezenyHost[] = rows.map(r => ({
    id: Number(r.id), name: String(r.name), kontakt: maskaEmailu(r.email) ?? maskaTelefonu(r.phone), clen: true, body: Number(r.points) || 0, bezAplikace: jeBezAplikace(r.email),
  }));
  if (d.email) {
    const [u] = await sql`SELECT id, name, email FROM users WHERE lower(email) = ${d.text.toLowerCase()} AND role = 'customer'`;
    if (u && !out.some(h => h.id === Number(u.id))) out.push({ id: Number(u.id), name: String(u.name), kontakt: maskaEmailu(u.email), clen: false, body: 0, bezAplikace: false });
  }
  return out;
}

// ---- Host v aplikaci -------------------------------------------------------------------------

export interface KartaHosta { id: number; kod: string; podnik: string; stav: StavKarty; activated_at: string | null }

/** Plastové karty přiřazené hostovi (Moje → Kartička). Zablokované se neukazují. */
export async function kartyHosta(customerId: number): Promise<KartaHosta[]> {
  try {
    const rows = (await sql`
      SELECT a.id, a.kod, a.stav, a.activated_at, t.name AS podnik
      FROM client_card_aliases a LEFT JOIN teams t ON t.id = a.team_id
      WHERE a.customer_id = ${customerId} AND a.stav = 'aktivni'
      ORDER BY a.activated_at DESC NULLS LAST, a.id DESC LIMIT 20`) as any[];
    return rows.map(r => ({ id: Number(r.id), kod: zobrazitelnyKod(String(r.kod)), podnik: String(r.podnik ?? ''), stav: r.stav as StavKarty, activated_at: r.activated_at ? String(r.activated_at) : null }));
  } catch { return []; /* před migrací tabulka není */ }
}

/**
 * Host si v aplikaci připojí plastovou kartu (opíše kód z karty). Nová karta se mu přiřadí;
 * karta hosta bez aplikace se převezme — členství, body, razítka, kupony i deník přejdou na
 * jeho účet (stejné sloučení jako u duplicit ve správě členů) a technický účet zanikne.
 */
export type StavPripojeni = 'pripojena' | 'prevzata' | 'uz_tvoje';

export async function pripojKartu(meId: number, kodRaw: string): Promise<Vysledek<{ stav: StavPripojeni; zprava: string; podnik: string }>> {
  await zajistiTabulkyKaret();
  const kod = managerovyKod(kodRaw);
  if (!kod) return { ok: false, status: 400, chyba: 'Kód karty má osm znaků, třeba ABCD-EFGH.' };
  const k = await kartaPodleKodu(kod, 0);
  let vlastnikBezAplikace = false;
  if (k?.customerId != null && k.customerId !== meId) {
    const [v] = await sql`SELECT email FROM users WHERE id = ${k.customerId}`;
    vlastnikBezAplikace = jeBezAplikace(v?.email);
  }
  const r = rozhodniPripojeni(k, meId, vlastnikBezAplikace);
  if (r.akce === 'odmitnout') return { ok: false, status: r.status, chyba: r.chyba };
  const [t] = await sql`SELECT name FROM teams WHERE id = ${k!.teamId}`;
  const podnik = String(t?.name ?? '');
  if (r.akce === 'uz_tvoje') return { ok: true, stav: 'uz_tvoje', zprava: 'Tahle karta už je tvoje.', podnik };
  if (r.akce === 'aktivovat') {
    const [u] = await sql`
      UPDATE client_card_aliases SET customer_id = ${meId}, stav = 'aktivni', activated_at = NOW()
      WHERE id = ${k!.id} AND stav = 'nova' AND customer_id IS NULL RETURNING team_id`;
    if (!u) return { ok: false, status: 409, chyba: 'Karta mezitím připadla někomu jinému.' };
    await join(meId, Number(u.team_id));
    void audit(Number(u.team_id), null, 'client.karta.prevzeti', 'client', meId, `Nová karta ${kod}`);
    return { ok: true, stav: 'pripojena', zprava: 'Karta je připojená. U kasy teď funguje stejně jako kartička v aplikaci.', podnik };
  }
  // Převzetí účtu hosta bez aplikace: po podnicích, kde je členem, sloučit do mého členství.
  const zId = r.zId;
  const tymy = (await sql`SELECT team_id FROM client_memberships WHERE customer_id = ${zId}`) as any[];
  for (const radek of tymy) {
    const tid = Number(radek.team_id);
    // Členství bez uvítacích kuponů a automatizací (host tu už členem byl, jen pod jiným účtem).
    await sql`INSERT INTO client_memberships (customer_id, team_id) VALUES (${meId}, ${tid}) ON CONFLICT (customer_id, team_id) DO NOTHING`;
    const s = await slucClena(tid, meId, zId, null);
    if (!s.ok && s.status !== 409) return { ok: false, status: s.status, chyba: 'Kartu se teď nepodařilo připojit. Zkus to za chvíli.' };
    void audit(tid, null, 'client.karta.prevzeti', 'client', meId, `Převzat účet hosta bez aplikace (karta ${kod})`);
  }
  await sql`UPDATE client_card_aliases SET customer_id = ${meId} WHERE customer_id = ${zId}`;
  await sql`DELETE FROM client_cards WHERE customer_id = ${zId}`;
  // Technický účet bez členství zanikne (nikdo se do něj nepřihlásí a nic na něm nezůstalo).
  try { await sql`UPDATE users SET name = 'Převzatý host', phone = NULL, deleted_at = NOW() WHERE id = ${zId} AND role = 'customer'`; }
  catch { /* před migrací bez deleted_at: účet zůstane prázdný, karta už patří novému majiteli */ }
  return { ok: true, stav: tymy.length ? 'prevzata' : 'pripojena', zprava: tymy.length ? 'Karta je připojená a body z ní jsou teď na tvém účtu.' : 'Karta je připojená.', podnik };
}

// ---- Import z Kartičky ----------------------------------------------------------------------

/**
 * Čísla starých karet z importu se uloží jako aktivní karty podniku, ať stará plastová karta
 * funguje u kasy dál. Číslo platí jen v podniku (klíč T<podnik>:<číslo>). Číslo, které v podniku
 * už patří jinému hostovi, se nepřepíše — vrátí se jako kolize.
 */
export async function prevezmiCislaKaret(teamId: number, userId: number | null, polozky: { customerId: number; cislo: string | null }[]): Promise<{ ulozeno: number; kolize: number; neplatne: number }> {
  const platne: { customerId: number; kod: string }[] = [];
  let neplatne = 0;
  const videne = new Set<string>();
  for (const p of polozky) {
    if (!p.cislo) continue;
    const c = ciziCislo(p.cislo);
    if (!c) { neplatne++; continue; }
    const kod = klicCiziKarty(teamId, c);
    if (videne.has(kod)) continue;
    videne.add(kod);
    platne.push({ customerId: p.customerId, kod });
  }
  if (!platne.length) return { ulozeno: 0, kolize: 0, neplatne };
  await zajistiTabulkyKaret();
  const vlozene = (await sql`
    INSERT INTO client_card_aliases (team_id, kod, customer_id, stav, zdroj, activated_at)
    SELECT ${teamId}, t.kod, t.cid, 'aktivni', 'import', NOW()
    FROM unnest(${platne.map(p => p.kod)}::text[], ${platne.map(p => p.customerId)}::int[]) AS t(kod, cid)
    ON CONFLICT (kod) DO NOTHING
    RETURNING kod, customer_id`) as any[];
  // Totéž číslo u téhož hosta (opakovaný import) není kolize.
  const vlozeneKody = new Set(vlozene.map(v => String(v.kod)));
  const zbyle = platne.filter(p => !vlozeneKody.has(p.kod));
  let kolize = 0;
  if (zbyle.length) {
    const stavajici = (await sql`SELECT kod, customer_id FROM client_card_aliases WHERE kod = ANY(${zbyle.map(z => z.kod)})`) as any[];
    const podleKodu = new Map(stavajici.map(s => [String(s.kod), s.customer_id == null ? null : Number(s.customer_id)]));
    kolize = zbyle.filter(z => podleKodu.get(z.kod) !== z.customerId).length;
  }
  if (vlozene.length) void audit(teamId, userId, 'client.karta.import', 'client_card_aliases', null, `${vlozene.length} karet${kolize ? `, ${kolize} čísel už patří jinému hostovi` : ''}`);
  return { ulozeno: vlozene.length, kolize, neplatne };
}
