// Přechod z jiné věrnostní aplikace — zápis do databáze po dávkách a vrácení importu.
// Čtení souboru a převod řádků je v lib/importKarticka.ts (čisté funkce).
//
// Zásady:
//  • Člen je host (`users.role = 'customer'`), společný pro všechny podniky. Existující účet se NIKDY
//    nepřepisuje (jméno, telefon, narozeniny zůstanou, jak jsou); mění se jen členství v tomhle podniku.
//  • Nový účet dostane nepoužitelné heslo (bcrypt z náhodného řetězce, který nikdo nezná), takže se do něj nikdo
//    nepřihlásí, dokud si člen sám nenastaví heslo přes „Zapomenuté heslo“. Souhlas s novinkami je vypnutý:
//    importovaný kontakt není souhlas se zprávami (zákon 480/2004).
//  • Dávky jsou po stovkách řádků a zapisují se množinově (unnest), ne po jednom: pět tisíc členů po jednom
//    dotazu na řádek by trvalo minuty a spadlo by na limitu funkce.
//  • Každý import je v `client_importy` a každý člen v `client_import_clenove` i s hodnotami před změnou, takže
//    se dá vrátit jedním klepnutím (nové účty a členství zmizí, upravené zůstatky se vrátí).
//  • Počáteční stav se zapíše do deníku jako ruční úprava s odkazem `import:<id>`; deník je tak čitelný
//    („Import z Kartičky: počáteční stav“) a při vrácení se podle odkazu smaže.

import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { sql } from './client';
import { audit } from './audit';
import type { RadekImportu } from './importKarticka';

export const MAX_DAVKA = 500;

export type StavExistujicich = 'preskocit' | 'nastavit';

export interface NastaveniImportu {
  zdroj: 'karticka' | 'csv';
  soubor?: string | null;
  /** Co s člena, který už v podniku je: nechat, nebo nastavit zůstatky ze souboru. */
  existujici: StavExistujicich;
  /** Kampaň, do které se zapíšou razítka (bez ní se razítka nezapisují). */
  kampanRazitek: number | null;
  /** Zařadit členy do skupin podle sloupce Skupina (skupiny se založí). */
  skupiny: boolean;
  /** Pokračování už založeného importu (další dávky téhož souboru). */
  importId?: number | null;
}

export interface VysledekDavky {
  importId: number;
  noveUcty: number;
  novaClenstvi: number;
  aktualizovano: number;
  preskoceno: number;
  razitkaZapsana: number;
  razitkaBezKampane: number;
  plneKarty: number;
  zarazenoDoSkupin: number;
  chyby: { radek: number; duvod: string }[];
}

export interface NahledDavky {
  radku: number;
  noveUcty: number;
  existujiciHoste: number;
  uzJsouClenove: number;
  cizi: number;
}

let pripraveno = false;

/**
 * Tabulky importu. Stejné příkazy jsou v app/api/init/route.ts (odtud je čte kontrola SQL); tady se spustí
 * jednou za studený start, ať import funguje i dřív, než někdo otevře /api/init po nasazení.
 */
export async function zajistiTabulkyImportu(): Promise<void> {
  if (pripraveno) return;
  await sql`
    CREATE TABLE IF NOT EXISTS client_importy (
      id SERIAL PRIMARY KEY,
      team_id INTEGER NOT NULL,
      zdroj TEXT NOT NULL DEFAULT 'karticka',
      soubor TEXT,
      vytvoril INTEGER,
      hash TEXT,
      kampan_id INTEGER,
      pocty JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT NOW(),
      vraceno_at TIMESTAMP
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS client_import_clenove (
      import_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      novy_ucet BOOLEAN NOT NULL DEFAULT FALSE,
      nove_clenstvi BOOLEAN NOT NULL DEFAULT FALSE,
      pred JSONB,
      PRIMARY KEY (import_id, customer_id)
    )`;
  await sql`CREATE INDEX IF NOT EXISTS client_importy_team ON client_importy (team_id, created_at)`;
  pripraveno = true;
}

const jeHost = (r: any) => String(r?.role) === 'customer';

/** Co by se stalo: kolik je nových účtů, kolik hostů už existuje, kolik už je členy a kolik e-mailů patří lidem z aplikace. */
export async function nahledDavky(teamId: number, radky: RadekImportu[]): Promise<NahledDavky> {
  const emaily = radky.map(r => r.email);
  const lide = emaily.length
    ? (await sql`SELECT id, lower(email) AS email, role FROM users WHERE lower(email) = ANY(${emaily})`) as any[]
    : [];
  const hoste = lide.filter(jeHost);
  const ids = hoste.map(u => Number(u.id));
  const clenove = ids.length
    ? (await sql`SELECT customer_id FROM client_memberships WHERE team_id = ${teamId} AND customer_id = ANY(${ids})`) as any[]
    : [];
  return {
    radku: radky.length,
    noveUcty: radky.length - lide.length,
    existujiciHoste: hoste.length,
    uzJsouClenove: clenove.length,
    cizi: lide.length - hoste.length,
  };
}

interface PoctyImportu {
  noveUcty: number; novaClenstvi: number; aktualizovano: number; preskoceno: number;
  razitkaZapsana: number; razitkaBezKampane: number; plneKarty: number; zarazenoDoSkupin: number;
  chyb: number; radku: number;
  skupiny: { id: number; nazev: string; nova: boolean }[];
}

const prazdnePocty = (): PoctyImportu => ({
  noveUcty: 0, novaClenstvi: 0, aktualizovano: 0, preskoceno: 0, razitkaZapsana: 0, razitkaBezKampane: 0, plneKarty: 0,
  zarazenoDoSkupin: 0, chyb: 0, radku: 0, skupiny: [],
});

/** Jedna dávka (nejvýš MAX_DAVKA řádků). První dávka založí import, další ho doplňují. */
export async function importujDavku(
  teamId: number, userId: number, radky: RadekImportu[], nastaveni: NastaveniImportu,
): Promise<VysledekDavky> {
  if (radky.length > MAX_DAVKA) throw new Error(`Nejvýš ${MAX_DAVKA} členů najednou.`);
  await zajistiTabulkyImportu();

  // --- Import (nový, nebo pokračování) ---
  let importId = nastaveni.importId ?? null;
  let hash: string;
  let pocty = prazdnePocty();
  if (importId) {
    const [imp] = await sql`SELECT id, hash, pocty, vraceno_at FROM client_importy WHERE id = ${importId} AND team_id = ${teamId}`;
    if (!imp) throw new Error('Import nenalezen.');
    if (imp.vraceno_at) throw new Error('Tenhle import už byl vrácen.');
    hash = String(imp.hash ?? '');
    pocty = { ...prazdnePocty(), ...(imp.pocty ?? {}) };
  } else {
    // Jeden bcrypt na import (náklad 10): heslo je náhodné a nikdo ho nezná, hash slouží jen jako nepoužitelné heslo
    // a jako značka „účet je pořád nedotčený import“ pro vrácení.
    hash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
    const [novy] = await sql`
      INSERT INTO client_importy (team_id, zdroj, soubor, vytvoril, hash, kampan_id)
      VALUES (${teamId}, ${nastaveni.zdroj}, ${nastaveni.soubor ? String(nastaveni.soubor).slice(0, 120) : null}, ${userId}, ${hash}, ${nastaveni.kampanRazitek})
      RETURNING id`;
    importId = Number(novy.id);
  }
  const vysl: VysledekDavky = {
    importId, noveUcty: 0, novaClenstvi: 0, aktualizovano: 0, preskoceno: 0, razitkaZapsana: 0, razitkaBezKampane: 0,
    plneKarty: 0, zarazenoDoSkupin: 0, chyby: [],
  };
  if (radky.length === 0) return vysl;
  const ref = `import:${importId}`;

  // --- Účty ---
  const emaily = radky.map(r => r.email);
  const znamy = (await sql`SELECT id, lower(email) AS email, role FROM users WHERE lower(email) = ANY(${emaily})`) as any[];
  const poEmailu = new Map<string, any>(znamy.map(u => [String(u.email), u]));
  const chybi = radky.filter(r => !poEmailu.has(r.email));
  const novyUcet = new Set<number>();
  if (chybi.length) {
    const prefs = JSON.stringify({ novinky: false, importovano: true });
    const jmena = chybi.map(r => r.jmeno), em = chybi.map(r => r.email), tel = chybi.map(r => r.telefon ?? ''), nar = chybi.map(r => r.narozeniny ?? '');
    let vlozene: any[];
    try {
      vlozene = (await sql`
        INSERT INTO users (name, email, password_hash, role, avatar, job_title, phone, birthday, notif_prefs)
        SELECT t.jmeno, t.email, ${hash}, 'customer', '👤', 'Host', NULLIF(t.tel, ''), NULLIF(t.nar, ''), ${prefs}::jsonb
        FROM unnest(${jmena}::text[], ${em}::text[], ${tel}::text[], ${nar}::text[]) AS t(jmeno, email, tel, nar)
        ON CONFLICT DO NOTHING
        RETURNING id, lower(email) AS email`) as any[];
    } catch {
      // Před migrací (sloupec notif_prefs ještě není): import nesmí spadnout, jen se souhlas nezapíše (výchozí je bez souhlasu).
      vlozene = (await sql`
        INSERT INTO users (name, email, password_hash, role, avatar, job_title, phone, birthday)
        SELECT t.jmeno, t.email, ${hash}, 'customer', '👤', 'Host', NULLIF(t.tel, ''), NULLIF(t.nar, '')
        FROM unnest(${jmena}::text[], ${em}::text[], ${tel}::text[], ${nar}::text[]) AS t(jmeno, email, tel, nar)
        ON CONFLICT DO NOTHING
        RETURNING id, lower(email) AS email`) as any[];
    }
    for (const u of vlozene) { poEmailu.set(String(u.email), { id: u.id, email: u.email, role: 'customer' }); novyUcet.add(Number(u.id)); }
    // Souběh s registrací: e-mail mezitím vznikl jinde — dotáhne se, ať řádek nepropadne.
    const stale = chybi.filter(r => !poEmailu.has(r.email)).map(r => r.email);
    if (stale.length) {
      const dohledane = (await sql`SELECT id, lower(email) AS email, role FROM users WHERE lower(email) = ANY(${stale})`) as any[];
      for (const u of dohledane) poEmailu.set(String(u.email), u);
    }
  }

  // --- Členství ---
  const kandidati: { r: RadekImportu; id: number }[] = [];
  for (const r of radky) {
    const u = poEmailu.get(r.email);
    if (!u) { vysl.chyby.push({ radek: r.radek, duvod: 'Účet se nepodařilo založit.' }); continue; }
    if (!jeHost(u)) { vysl.chyby.push({ radek: r.radek, duvod: 'E-mail patří uživateli aplikace (zaměstnanec nebo vedení), ne hostovi.' }); continue; }
    kandidati.push({ r, id: Number(u.id) });
  }
  const idsVse = kandidati.map(k => k.id);
  const stavajici = new Map<number, any>();
  if (idsVse.length) {
    const rows = (await sql`
      SELECT customer_id, points, stamps, visits, credit, last_visit_at
      FROM client_memberships WHERE team_id = ${teamId} AND customer_id = ANY(${idsVse})`) as any[];
    for (const m of rows) stavajici.set(Number(m.customer_id), m);
  }

  // Kampaň razítek (jen kampaň tohohle podniku).
  let kampan: { id: number; required: number } | null = null;
  if (nastaveni.kampanRazitek) {
    const [c] = await sql`SELECT id, required_stamps FROM client_stamp_campaigns WHERE id = ${nastaveni.kampanRazitek} AND team_id = ${teamId}`;
    if (c) kampan = { id: Number(c.id), required: Math.max(1, Number(c.required_stamps) || 1) };
    else throw new Error('Kampaň razítek nenalezena.');
  }
  const stavajiciRazitka = new Map<number, number>();
  if (kampan && idsVse.length) {
    const rows = (await sql`SELECT customer_id, stamps FROM client_stamp_progress WHERE campaign_id = ${kampan.id} AND customer_id = ANY(${idsVse})`) as any[];
    for (const p of rows) stavajiciRazitka.set(Number(p.customer_id), Number(p.stamps));
  }

  const nova: typeof kandidati = [], uprava: typeof kandidati = [];
  for (const k of kandidati) {
    const m = stavajici.get(k.id);
    if (!m) nova.push(k);
    else if (nastaveni.existujici === 'nastavit') uprava.push(k);
    else vysl.preskoceno++;
  }

  const sloupce = (a: typeof kandidati) => ({
    id: a.map(k => k.id), points: a.map(k => k.r.body), visits: a.map(k => k.r.navstevy), credit: a.map(k => k.r.kredit),
    last: a.map(k => k.r.posledniNavsteva ?? ''),
  });

  if (nova.length) {
    const c = sloupce(nova);
    await sql`
      INSERT INTO client_memberships (customer_id, team_id, points, stamps, visits, credit, last_visit_at)
      SELECT t.id, ${teamId}, t.points, 0, t.visits, t.credit, NULLIF(t.last, '')::timestamp
      FROM unnest(${c.id}::int[], ${c.points}::int[], ${c.visits}::int[], ${c.credit}::int[], ${c.last}::text[]) AS t(id, points, visits, credit, last)
      ON CONFLICT (customer_id, team_id) DO NOTHING`;
    vysl.novaClenstvi = nova.length;
  }
  if (uprava.length) {
    const c = sloupce(uprava);
    await sql`
      UPDATE client_memberships m SET points = t.points, visits = t.visits, credit = t.credit,
        last_visit_at = COALESCE(NULLIF(t.last, '')::timestamp, m.last_visit_at)
      FROM unnest(${c.id}::int[], ${c.points}::int[], ${c.visits}::int[], ${c.credit}::int[], ${c.last}::text[]) AS t(id, points, visits, credit, last)
      WHERE m.team_id = ${teamId} AND m.customer_id = t.id`;
    vysl.aktualizovano = uprava.length;
  }

  const zapsane = [...nova, ...uprava];
  // --- Deník počátečního stavu (rozdíl proti dosavadnímu zůstatku) ---
  if (zapsane.length) {
    const radkyDeniku = zapsane.map(k => {
      const m = stavajici.get(k.id);
      return {
        id: k.id,
        d: k.r.body - Number(m?.points ?? 0),
        c: k.r.kredit - Number(m?.credit ?? 0),
        note: `Import${nastaveni.zdroj === 'karticka' ? ' z Kartičky' : ''}: počáteční stav${k.r.cisloKarty ? ` (stará karta ${k.r.cisloKarty})` : ''}`.slice(0, 200),
      };
    }).filter(x => x.d !== 0 || x.c !== 0 || x.note.includes('stará karta'));
    if (radkyDeniku.length) {
      await sql`
        INSERT INTO client_loyalty_ledger (team_id, customer_id, delta, credit_delta, kind, ref, note)
        SELECT ${teamId}, t.id, t.d, t.c, 'manual', ${ref}, t.note
        FROM unnest(${radkyDeniku.map(x => x.id)}::int[], ${radkyDeniku.map(x => x.d)}::int[], ${radkyDeniku.map(x => x.c)}::int[], ${radkyDeniku.map(x => x.note)}::text[]) AS t(id, d, c, note)`;
    }
  }

  // --- Razítka ---
  if (zapsane.length) {
    const sRazitky = zapsane.filter(k => k.r.razitka > 0);
    if (!kampan) vysl.razitkaBezKampane = sRazitky.length;
    else if (sRazitky.length) {
      const hodnoty = sRazitky.map(k => {
        if (k.r.razitka >= kampan!.required) vysl.plneKarty++;
        return k.r.razitka % kampan!.required;
      });
      await sql`
        INSERT INTO client_stamp_progress (campaign_id, customer_id, team_id, stamps, last_stamp_at)
        SELECT ${kampan.id}, t.id, ${teamId}, t.s, NOW()
        FROM unnest(${sRazitky.map(k => k.id)}::int[], ${hodnoty}::int[]) AS t(id, s)
        ON CONFLICT (campaign_id, customer_id) DO UPDATE SET stamps = EXCLUDED.stamps, last_stamp_at = NOW()`;
      vysl.razitkaZapsana = sRazitky.length;
    }
  }

  // --- Skupiny ---
  if (nastaveni.skupiny && zapsane.length) {
    const poSkupine = new Map<string, number[]>();
    for (const k of zapsane) if (k.r.skupina) {
      const kl = k.r.skupina.trim();
      poSkupine.set(kl, [...(poSkupine.get(kl) ?? []), k.id]);
    }
    for (const [nazev, ids] of poSkupine) {
      let [g] = await sql`SELECT id FROM client_groups WHERE team_id = ${teamId} AND LOWER(name) = ${nazev.toLowerCase()} LIMIT 1` as any[];
      let jeNova = false;
      if (!g) {
        [g] = await sql`INSERT INTO client_groups (team_id, name) VALUES (${teamId}, ${nazev.slice(0, 60)}) RETURNING id` as any[];
        jeNova = true;
      }
      const gid = Number(g.id);
      await sql`
        INSERT INTO client_group_members (group_id, customer_id, team_id)
        SELECT ${gid}, c, ${teamId} FROM unnest(${ids}::int[]) AS c
        ON CONFLICT (group_id, customer_id) DO NOTHING`;
      vysl.zarazenoDoSkupin += ids.length;
      if (!pocty.skupiny.some(s => s.id === gid)) pocty.skupiny.push({ id: gid, nazev, nova: jeNova });
    }
  }

  // --- Záznam pro vrácení ---
  if (zapsane.length) {
    const pred = zapsane.map(k => {
      const m = stavajici.get(k.id);
      return m ? JSON.stringify({
        points: Number(m.points), stamps: Number(m.stamps), visits: Number(m.visits), credit: Number(m.credit),
        last_visit_at: m.last_visit_at ?? null, razitka: stavajiciRazitka.has(k.id) ? stavajiciRazitka.get(k.id) : null,
      }) : '';
    });
    await sql`
      INSERT INTO client_import_clenove (import_id, customer_id, novy_ucet, nove_clenstvi, pred)
      SELECT ${importId}, t.id, t.ucet, t.clen, NULLIF(t.pred, '')::jsonb
      FROM unnest(${zapsane.map(k => k.id)}::int[], ${zapsane.map(k => novyUcet.has(k.id))}::boolean[], ${zapsane.map(k => !stavajici.has(k.id))}::boolean[], ${pred}::text[]) AS t(id, ucet, clen, pred)
      ON CONFLICT (import_id, customer_id) DO NOTHING`;
  }

  vysl.noveUcty = novyUcet.size;
  pocty.noveUcty += vysl.noveUcty; pocty.novaClenstvi += vysl.novaClenstvi; pocty.aktualizovano += vysl.aktualizovano;
  pocty.preskoceno += vysl.preskoceno; pocty.razitkaZapsana += vysl.razitkaZapsana; pocty.razitkaBezKampane += vysl.razitkaBezKampane;
  pocty.plneKarty += vysl.plneKarty; pocty.zarazenoDoSkupin += vysl.zarazenoDoSkupin; pocty.chyb += vysl.chyby.length; pocty.radku += radky.length;
  await sql`UPDATE client_importy SET pocty = ${JSON.stringify(pocty)}::jsonb WHERE id = ${importId}`;
  await audit(teamId, userId, 'klient.import', 'client_importy', importId,
    `Import členů: ${vysl.novaClenstvi} nových, ${vysl.aktualizovano} upravených, ${vysl.preskoceno} přeskočeno`);
  return vysl;
}

export interface ZaznamImportu {
  id: number; zdroj: string; soubor: string | null; created_at: string; vraceno_at: string | null; pocty: Partial<PoctyImportu>;
}

export async function seznamImportu(teamId: number): Promise<ZaznamImportu[]> {
  await zajistiTabulkyImportu();
  const rows = (await sql`
    SELECT id, zdroj, soubor, created_at, vraceno_at, pocty FROM client_importy
    WHERE team_id = ${teamId} ORDER BY created_at DESC, id DESC LIMIT 20`) as any[];
  return rows.map(r => ({ id: Number(r.id), zdroj: String(r.zdroj), soubor: r.soubor ?? null, created_at: String(r.created_at), vraceno_at: r.vraceno_at ? String(r.vraceno_at) : null, pocty: r.pocty ?? {} }));
}

/**
 * Vrátí import: nová členství a nedotčené nové účty zmizí, upravené zůstatky se vrátí, deník a razítka z importu
 * se smažou. Účet, do kterého se člen mezitím přihlásil (heslo už není z importu) nebo který má členství jinde,
 * zůstane — maže se jen to, co je jistě jen z importu.
 */
export async function vratImport(teamId: number, userId: number, importId: number): Promise<{ vraceno: number; smazanoUctu: number }> {
  await zajistiTabulkyImportu();
  const [imp] = await sql`SELECT id, hash, kampan_id, pocty, vraceno_at FROM client_importy WHERE id = ${importId} AND team_id = ${teamId}`;
  if (!imp) throw new Error('Import nenalezen.');
  if (imp.vraceno_at) throw new Error('Tenhle import už byl vrácen.');
  const clenove = (await sql`SELECT customer_id, novy_ucet, nove_clenstvi, pred FROM client_import_clenove WHERE import_id = ${importId}`) as any[];
  const nove = clenove.filter(c => c.nove_clenstvi).map(c => Number(c.customer_id));
  const upravene = clenove.filter(c => !c.nove_clenstvi && c.pred);
  const ref = `import:${importId}`;
  const kampan = imp.kampan_id ? Number(imp.kampan_id) : null;

  await sql`DELETE FROM client_loyalty_ledger WHERE team_id = ${teamId} AND ref = ${ref}`;
  if (nove.length) {
    await sql`DELETE FROM client_memberships WHERE team_id = ${teamId} AND customer_id = ANY(${nove})`;
    if (kampan) await sql`DELETE FROM client_stamp_progress WHERE team_id = ${teamId} AND campaign_id = ${kampan} AND customer_id = ANY(${nove})`;
    await sql`DELETE FROM client_group_members WHERE team_id = ${teamId} AND customer_id = ANY(${nove})`;
  }
  for (const u of upravene) {
    const p = u.pred ?? {};
    await sql`
      UPDATE client_memberships SET points = ${Number(p.points) || 0}, stamps = ${Number(p.stamps) || 0}, visits = ${Number(p.visits) || 0},
        credit = ${Number(p.credit) || 0}, last_visit_at = ${p.last_visit_at ?? null}
      WHERE team_id = ${teamId} AND customer_id = ${Number(u.customer_id)}`;
    if (kampan) {
      if (p.razitka == null) await sql`DELETE FROM client_stamp_progress WHERE campaign_id = ${kampan} AND customer_id = ${Number(u.customer_id)}`;
      else await sql`UPDATE client_stamp_progress SET stamps = ${Number(p.razitka)} WHERE campaign_id = ${kampan} AND customer_id = ${Number(u.customer_id)}`;
    }
  }
  // Skupiny založené importem, které jsou po vrácení prázdné.
  const skupiny = (imp.pocty?.skupiny ?? []) as { id: number; nova: boolean }[];
  for (const g of skupiny.filter(s => s.nova)) {
    const [{ n }] = (await sql`SELECT COUNT(*)::int AS n FROM client_group_members WHERE group_id = ${g.id}`) as any[];
    if (Number(n) === 0) await sql`DELETE FROM client_groups WHERE id = ${g.id} AND team_id = ${teamId}`;
  }
  // Nové účty: jen nedotčené (heslo pořád z importu) a bez členství jinde.
  const ucty = clenove.filter(c => c.novy_ucet).map(c => Number(c.customer_id));
  let smazanoUctu = 0;
  if (ucty.length && imp.hash) {
    const smazane = (await sql`
      DELETE FROM users u
      WHERE u.id = ANY(${ucty}) AND u.role = 'customer' AND u.password_hash = ${String(imp.hash)}
        AND NOT EXISTS (SELECT 1 FROM client_memberships m WHERE m.customer_id = u.id)
      RETURNING u.id`) as any[];
    smazanoUctu = smazane.length;
    if (smazane.length) {
      await sql`DELETE FROM client_cards WHERE customer_id = ANY(${smazane.map(s => Number(s.id))})`;
    }
  }
  await sql`UPDATE client_importy SET vraceno_at = NOW() WHERE id = ${importId}`;
  await audit(teamId, userId, 'klient.import.vraceni', 'client_importy', importId, `Vrácen import členů (${nove.length} členství, ${smazanoUctu} účtů)`);
  return { vraceno: nove.length + upravene.length, smazanoUctu };
}
