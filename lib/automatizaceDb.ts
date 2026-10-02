// Automatizace zpráv členům v databázi: nastavení, spuštění, denní průchod a deník odeslání.
// Čistá logika (texty, ověření, časování) je v lib/automatizace.ts.
//
// Idempotence: deník client_automatizace_log má unikát (podnik, druh, člen, důvod). Řádek se zapíše
// PŘED odesláním (INSERT … ON CONFLICT DO NOTHING RETURNING), takže dva souběžné běhy ani opakovaný cron
// nepošlou stejnou zprávu dvakrát; kdo řádek nezíská, končí.

import { sql } from './client';
import { zajistiSchemaClenu } from './clenoveSchema';
import { notifyUser } from './push';
import { pragueToday, dayPlus } from './pragueTime';
import {
  DRUHY_AUTOMATIZACE, DEFINICE, vychoziKonfigurace, overKonfiguraci, zpravaAutomatizace, jeKrokUvitaniNaRade, jePoZapnuti,
  maDnesNarozeniny, refUvitani, refNarozeniny, refPrvniNavsteva, OKNO_UVITANI_DNI, type DruhAutomatizace,
} from './automatizace';
import { kuponKPripsani, nactiPrijemce, pripisKuponClenum } from './clenoveDb';
import { procNedostaneEmail, procNedostanePush, odkazOdhlaseni, sestavEmailZpravy } from './zpravyEmail';
import { sendNovinkyEmail, odkazovyZaklad } from './email';
import { cistyJazyk } from './i18n/config';
import { linkFor } from './broadcasts';
import { audit } from './audit';

export interface StavAutomatizace {
  druh: DruhAutomatizace;
  enabled: boolean;
  config: any;
  enabled_at: string | null;
}

/** Nastavení všech pravidel podniku. Co není uložené, má výchozí text a je vypnuté. */
export async function nactiAutomatizace(teamId: number): Promise<StavAutomatizace[]> {
  await zajistiSchemaClenu();
  const rows = await sql`SELECT kind, enabled, config, enabled_at FROM client_automatizace WHERE team_id = ${teamId}` as any[];
  const [p] = await sql`SELECT reactivation_days, reactivation_points, birthday_points FROM client_profiles WHERE team_id = ${teamId}`;
  const by = new Map(rows.map(r => [String(r.kind), r]));
  return DRUHY_AUTOMATIZACE.map(druh => {
    const r = by.get(druh);
    const vychozi = vychoziKonfigurace(druh);
    const cfg = r?.config && typeof r.config === 'object' && Object.keys(r.config).length ? { ...vychozi, ...r.config } : vychozi;
    let enabled = r?.enabled === true;
    // „Chybíš nám“ a body k narozeninám žijí v profilu podniku (kvůli starším nastavením a importu z Kartičky).
    if (druh === 'chybis_nam') {
      const dny = Number(p?.reactivation_days) || 0;
      enabled = dny > 0;
      cfg.dny = dny > 0 ? dny : Number(cfg.dny) || 30;
      cfg.body_bodu = Number(p?.reactivation_points) || 0;
    }
    if (druh === 'narozeniny_kupon') cfg.body_bodu = Number(p?.birthday_points) || 0;
    return { druh, enabled, config: cfg, enabled_at: r?.enabled_at ? String(r.enabled_at) : null };
  });
}

export type VysledekUlozeni = { ok: true; stav: StavAutomatizace } | { ok: false; status: number; error: string };

/**
 * Uloží jedno pravidlo. Dny a body „Chybíš nám“ a body k narozeninám se zapisují do profilu podniku
 * (smí jen s `muzePravidla`, tedy s oprávněním vernost.pravidla); texty, kupony a zapnutí smí každý se zprávami.
 */
export async function ulozAutomatizaci(teamId: number, userId: number, druh: DruhAutomatizace, zapnuto: boolean, raw: any, muzePravidla: boolean): Promise<VysledekUlozeni> {
  await zajistiSchemaClenu();
  const v = overKonfiguraci(druh, raw, zapnuto);
  if (!v.ok) return { ok: false, status: 400, error: v.error };
  const cfg = v.cfg;
  // Kupon musí existovat a jít připsat; jinak by pravidlo mlčky nic nedávalo.
  const kuponyId: number[] = druh === 'uvitani' ? cfg.kroky.map((k: any) => k.kuponId).filter(Boolean) : cfg.kuponId ? [cfg.kuponId] : [];
  for (const id of kuponyId) {
    if (!(await kuponKPripsani(teamId, id))) return { ok: false, status: 400, error: 'Kupon u zprávy neexistuje nebo je vypnutý. Vyber jiný.' };
  }
  if (druh === 'chybis_nam' || druh === 'narozeniny_kupon') {
    if (muzePravidla) {
      if (druh === 'chybis_nam') await sql`UPDATE client_profiles SET reactivation_days = ${zapnuto ? cfg.dny : 0}, reactivation_points = ${cfg.body_bodu} WHERE team_id = ${teamId}`;
      else await sql`UPDATE client_profiles SET birthday_points = ${cfg.body_bodu} WHERE team_id = ${teamId}`;
    } else {
      // Bez práva na pravidla věrnosti jde měnit jen text a kupon; dny, body a zapnutí zůstanou, jak jsou.
      const [p] = await sql`SELECT reactivation_days, reactivation_points, birthday_points FROM client_profiles WHERE team_id = ${teamId}`;
      if (druh === 'chybis_nam') {
        if ((Number(p?.reactivation_days) > 0) !== zapnuto) return { ok: false, status: 403, error: 'Zapnout nebo vypnout „Chybíš nám“ smí jen ten, kdo spravuje pravidla věrnosti.' };
        cfg.dny = Number(p?.reactivation_days) || cfg.dny;
        cfg.body_bodu = Number(p?.reactivation_points) || 0;
      } else cfg.body_bodu = Number(p?.birthday_points) || 0;
    }
  }
  await sql`
    INSERT INTO client_automatizace (team_id, kind, enabled, config, enabled_at, updated_at)
    VALUES (${teamId}, ${druh}, ${zapnuto}, ${JSON.stringify(cfg)}::jsonb, ${zapnuto ? new Date().toISOString() : null}, NOW())
    ON CONFLICT (team_id, kind) DO UPDATE SET
      enabled = EXCLUDED.enabled, config = EXCLUDED.config, updated_at = NOW(),
      enabled_at = CASE WHEN EXCLUDED.enabled AND NOT client_automatizace.enabled THEN NOW()
                        WHEN EXCLUDED.enabled THEN client_automatizace.enabled_at ELSE NULL END`;
  const nazev = DEFINICE.find(d => d.id === druh)?.nazev ?? druh;
  void audit(teamId, userId, 'client.automatizace', 'client', null, `${nazev}: ${zapnuto ? 'zapnuto' : 'vypnuto'}`);
  const stav = (await nactiAutomatizace(teamId)).find(s => s.druh === druh)!;
  return { ok: true, stav };
}

// ---- Doručení ----------------------------------------------------------------------

export interface Dorucovane { teamId: number; customerId: number; title: string; body: string; kuponId: number | null; linkKind?: string }

/** Připíše kupon (vždy) a pošle oznámení a e-mail těm, kdo souhlasili. Vrací stav pro deník. */
export async function dorucClenovi(d: Dorucovane): Promise<{ status: string; channels: string }> {
  const [prijemce] = await nactiPrijemce(d.teamId, [d.customerId]);
  if (!prijemce || prijemce.blocked) return { status: 'chyba', channels: '' };
  let kupon: string | null = null;
  if (d.kuponId) {
    const k = await kuponKPripsani(d.teamId, d.kuponId);
    if (k) { await pripisKuponClenum(d.teamId, d.kuponId, [d.customerId]); kupon = k.title; }
  }
  const [p] = await sql`SELECT slug FROM client_profiles WHERE team_id = ${d.teamId}`;
  let podnik = 'náš podnik'; let jazykPodniku: string | null = null;
  try {
    const [t] = await sql`SELECT COALESCE(NULLIF(share_theme->>'businessName', ''), name) AS business, default_lang FROM teams WHERE id = ${d.teamId}`;
    if (t?.business) podnik = String(t.business);
    jazykPodniku = t?.default_lang ?? null;
  } catch { /* před migrací */ }
  const link = linkFor(d.linkKind ?? 'loyalty', p?.slug ?? null);
  const kanaly: string[] = [];
  if (procNedostanePush(prijemce) === null) {
    await notifyUser(d.customerId, { title: d.title, body: d.body || undefined, link, type: 'info', category: 'novinky' });
    kanaly.push('push');
  }
  if (procNedostaneEmail(prijemce) === null) {
    const odh = odkazOdhlaseni(odkazovyZaklad(), d.customerId);
    const mail = sestavEmailZpravy({
      podnik, title: d.title, body: d.body, odkaz: `${odkazovyZaklad()}${link}`, kuponNazev: kupon, promoKod: null,
      odhlasitStranka: odh.stranka, jazyk: cistyJazyk(prijemce.lang) ?? cistyJazyk(jazykPodniku) ?? 'cs',
    });
    const r = await sendNovinkyEmail(String(prijemce.email), podnik, mail.subject, mail.html, odh.api);
    if (r.sent) kanaly.push('email');
  }
  if (kanaly.length) return { status: 'odeslano', channels: kanaly.join('+') };
  return { status: kupon ? 'kupon_pripsan' : 'bez_souhlasu', channels: '' };
}

async function jmenoClena(teamId: number, customerId: number): Promise<string> {
  const [u] = await sql`SELECT name FROM users WHERE id = ${customerId}`;
  return String(u?.name ?? '');
}

async function nazevPodniku(teamId: number): Promise<string> {
  try {
    const [t] = await sql`SELECT COALESCE(NULLIF(share_theme->>'businessName', ''), name) AS business FROM teams WHERE id = ${teamId}`;
    return t?.business ? String(t.business) : 'náš podnik';
  } catch { return 'náš podnik'; }
}

/**
 * Spustí jedno pravidlo pro jednoho člena (jednou na „důvod“ `ref`). Nic neudělá, když je pravidlo vypnuté,
 * člen blokovaný, nebo se už stalo. Nikdy nevyhazuje: volá se z cest, které nesmí selhat kvůli zprávě.
 */
export async function spustAutomatizaci(druh: DruhAutomatizace, teamId: number, customerId: number, ref: string): Promise<boolean> {
  try {
    await zajistiSchemaClenu();
    const stav = (await nactiAutomatizace(teamId)).find(s => s.druh === druh);
    if (!stav?.enabled) return false;
    const [m] = await sql`SELECT blocked FROM client_memberships WHERE team_id = ${teamId} AND customer_id = ${customerId}`;
    if (!m || m.blocked === true) return false;
    // Krok uvítací série se najde podle dnů v `ref` (krok:<dny>).
    let krok = 0;
    if (druh === 'uvitani') {
      const dny = Number(/^krok:(\d+)$/.exec(ref)?.[1]);
      krok = (stav.config.kroky ?? []).findIndex((k: any) => k.dny === dny);
      if (krok < 0) return false;
    }
    const [zapis] = await sql`
      INSERT INTO client_automatizace_log (team_id, kind, customer_id, ref, status)
      VALUES (${teamId}, ${druh}, ${customerId}, ${ref}, 'odeslano')
      ON CONFLICT (team_id, kind, customer_id, ref) DO NOTHING RETURNING id`;
    if (!zapis) return false;
    const zdroj = druh === 'uvitani' ? stav.config.kroky[krok] : stav.config;
    const zprava = zpravaAutomatizace(druh, stav.config, { jmeno: await jmenoClena(teamId, customerId), podnik: await nazevPodniku(teamId), dny: Number(stav.config.dny) || undefined, body: Number(stav.config.body_bodu) || 0 }, krok);
    if (!zprava) { await sql`UPDATE client_automatizace_log SET status = 'chyba', note = 'Zpráva nemá nadpis' WHERE id = ${zapis.id}`; return false; }
    const v = await dorucClenovi({ teamId, customerId, title: zprava.title, body: zprava.body, kuponId: zdroj?.kuponId ?? null });
    await sql`UPDATE client_automatizace_log SET status = ${v.status}, channels = ${v.channels || null} WHERE id = ${zapis.id}`;
    return true;
  } catch (e) {
    console.error('automatizace selhala', druh, teamId, customerId, e);
    return false;
  }
}

/** Zapíše do deníku odeslání, které už proběhlo jinde (Chybíš nám má vlastní idempotenci v deníku bodů). */
export async function zapisDoLogu(teamId: number, druh: DruhAutomatizace, customerId: number, ref: string, status: string, channels: string | null): Promise<void> {
  try {
    await zajistiSchemaClenu();
    await sql`
      INSERT INTO client_automatizace_log (team_id, kind, customer_id, ref, status, channels)
      VALUES (${teamId}, ${druh}, ${customerId}, ${ref}, ${status}, ${channels})
      ON CONFLICT (team_id, kind, customer_id, ref) DO NOTHING`;
  } catch { /* deník nesmí shodit odeslání */ }
}

// ---- Denní průchod --------------------------------------------------------------------

/**
 * Doběhne to, co se nespustilo při události (cron běží jednou denně): kroky uvítací série po dnech,
 * narozeninový kupon, první návštěva a zmeškané uvítání. Vrací počet odeslaných zpráv.
 */
export async function spustAutomatizaceCron(now: Date = new Date()): Promise<number> {
  await zajistiSchemaClenu();
  let n = 0;
  const povolene = await sql`SELECT team_id, kind, config, enabled_at FROM client_automatizace WHERE enabled = TRUE AND kind IN ('uvitani', 'narozeniny_kupon', 'prvni_navsteva')` as any[];
  const dnes = pragueToday();
  for (const r of povolene) {
    const teamId = Number(r.team_id);
    const druh = String(r.kind) as DruhAutomatizace;
    try {
      if (druh === 'uvitani') {
        const kroky = (r.config?.kroky ?? []) as { dny: number }[];
        for (const k of kroky) {
          const od = dayPlus(dnes, -(k.dny + OKNO_UVITANI_DNI)), do_ = dayPlus(dnes, -k.dny);
          const kandidati = await sql`
            SELECT m.customer_id, m.joined_at FROM client_memberships m
            WHERE m.team_id = ${teamId} AND m.blocked = FALSE
              AND (m.joined_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Prague')::date BETWEEN ${od}::date AND ${do_}::date
              AND NOT EXISTS (SELECT 1 FROM client_automatizace_log l WHERE l.team_id = m.team_id AND l.kind = 'uvitani' AND l.customer_id = m.customer_id AND l.ref = ${refUvitani(k.dny)})
            LIMIT 500` as any[];
          for (const c of kandidati) {
            if (!jeKrokUvitaniNaRade(c.joined_at, k.dny, now, r.enabled_at)) continue;
            if (await spustAutomatizaci('uvitani', teamId, Number(c.customer_id), refUvitani(k.dny))) n++;
          }
        }
      } else if (druh === 'narozeniny_kupon') {
        const rok = dnes.slice(0, 4);
        const kandidati = await sql`
          SELECT m.customer_id, us.birthday FROM client_memberships m JOIN users us ON us.id = m.customer_id
          WHERE m.team_id = ${teamId} AND m.blocked = FALSE AND us.birthday IS NOT NULL
            AND substr(us.birthday, 6, 5) IN (${dnes.slice(5)}, '02-29')
            AND NOT EXISTS (SELECT 1 FROM client_automatizace_log l WHERE l.team_id = m.team_id AND l.kind = 'narozeniny_kupon' AND l.customer_id = m.customer_id AND l.ref = ${refNarozeniny(rok)})
          LIMIT 500` as any[];
        for (const c of kandidati) {
          if (!maDnesNarozeniny(String(c.birthday), dnes)) continue;
          if (await spustAutomatizaci('narozeniny_kupon', teamId, Number(c.customer_id), refNarozeniny(rok))) n++;
        }
      } else if (druh === 'prvni_navsteva') {
        const kandidati = await sql`
          SELECT m.customer_id, m.last_visit_at FROM client_memberships m
          WHERE m.team_id = ${teamId} AND m.blocked = FALSE AND m.visits = 1 AND m.last_visit_at IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM client_automatizace_log l WHERE l.team_id = m.team_id AND l.kind = 'prvni_navsteva' AND l.customer_id = m.customer_id AND l.ref = ${refPrvniNavsteva()})
          LIMIT 500` as any[];
        for (const c of kandidati) {
          if (!jePoZapnuti(c.last_visit_at, r.enabled_at)) continue;
          if (await spustAutomatizaci('prvni_navsteva', teamId, Number(c.customer_id), refPrvniNavsteva())) n++;
        }
      }
    } catch (e) { console.error('automatizace cron selhal', druh, teamId, e); }
  }
  return n;
}

// ---- Deník -------------------------------------------------------------------------------

export interface RadekLogu { id: number; kind: string; customer_id: number; name: string | null; ref: string; status: string; channels: string | null; created_at: string }

export async function logAutomatizace(teamId: number, druh: DruhAutomatizace | null, limit = 30, sJmeny = true): Promise<RadekLogu[]> {
  await zajistiSchemaClenu();
  const rows = (druh
    ? await sql`
        SELECT l.id, l.kind, l.customer_id, us.name, l.ref, l.status, l.channels, l.created_at
        FROM client_automatizace_log l LEFT JOIN users us ON us.id = l.customer_id
        WHERE l.team_id = ${teamId} AND l.kind = ${druh} ORDER BY l.created_at DESC, l.id DESC LIMIT ${limit}`
    : await sql`
        SELECT l.id, l.kind, l.customer_id, us.name, l.ref, l.status, l.channels, l.created_at
        FROM client_automatizace_log l LEFT JOIN users us ON us.id = l.customer_id
        WHERE l.team_id = ${teamId} ORDER BY l.created_at DESC, l.id DESC LIMIT ${limit}`) as any[];
  return rows.map(r => ({ id: Number(r.id), kind: String(r.kind), customer_id: Number(r.customer_id), name: sJmeny ? (r.name ?? null) : null, ref: String(r.ref), status: String(r.status), channels: r.channels ?? null, created_at: String(r.created_at) }));
}

/** Kolik zpráv které pravidlo poslo celkem a za posledních 30 dní. */
export async function poctyAutomatizace(teamId: number): Promise<Record<string, { celkem: number; mesic: number }>> {
  await zajistiSchemaClenu();
  const rows = await sql`
    SELECT kind, COUNT(*)::int AS celkem, COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS mesic
    FROM client_automatizace_log WHERE team_id = ${teamId} GROUP BY kind` as any[];
  return Object.fromEntries(rows.map(r => [String(r.kind), { celkem: Number(r.celkem) || 0, mesic: Number(r.mesic) || 0 }]));
}
