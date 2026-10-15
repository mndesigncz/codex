// DSA v databázi: uložení oznámení z veřejného formuláře, eskalace provozovateli, potvrzení
// a rozhodnutí oznamovateli, odůvodnění omezení autorovi. Pravidla a texty: lib/dsa.ts.
// Eskalace nahlášení z chatu (lib/moderaceDb.ts) zůstává, jak je; tady se jen používá stejná adresa
// provozovatele (kontaktModerace) a stejná správa (/admin/nahlaseni).

import { neon } from '@neondatabase/serverless';
import { sendSpravaEmail, sendPravniEmail, odkazovyZaklad } from './email';
import { kontaktModerace, nazevDuvodu } from './moderace';
import { notifyUser } from './push';
import { firma, jeEmail } from './firma';
import {
  DRUH_WEB, emailNovehoOznameni, emailPotvrzeniOznameni, emailRozhodnutiOznameni, oduvodneni, opisOznameni, slugZOdkazu,
  type DruhOmezeni, type OznameniDsa, type RozhodnutiDsa,
} from './dsa';

const sql = neon(process.env.DATABASE_URL!);

/** Kontakt pro oznamovatele a dotčené (čl. 12): e-mail podpory, jinak e-mail moderace. */
export function kontaktDsa(): string {
  const f = firma();
  if (jeEmail(f.emailPodpory)) return f.emailPodpory;
  return kontaktModerace(process.env) ?? f.emailPodpory;
}

/** Podnik podle odkazu na jeho stránku (`/client/<slug>`); jinak null. */
async function podnikZOdkazu(url: string | null): Promise<{ id: number; nazev: string } | null> {
  const slug = slugZOdkazu(url);
  if (!slug) return null;
  try {
    const [p] = await sql`SELECT p.team_id, t.name FROM client_profiles p JOIN teams t ON t.id = p.team_id WHERE p.slug = ${slug}`;
    return p ? { id: Number(p.team_id), nazev: String(p.name) } : null;
  } catch { return null; }
}

/**
 * Uloží oznámení z /nahlasit. `reporterId` = přihlášený (jinak null). Vrací id, nebo null (databáze
 * před migrací sloupců — volající to řekne poctivě, oznámení nesmí tiše zmizet).
 */
export async function ulozOznameniWeb(v: OznameniDsa, reporterId: number | null): Promise<{ id: number; teamId: number | null; podnik: string | null } | null> {
  const podnik = await podnikZOdkazu(v.url);
  try {
    const [r] = await sql`
      INSERT INTO content_reports (team_id, reporter_id, reported_user_id, kind, ref_id, reason, detail, snapshot,
        source, reporter_name, reporter_email, content_url, declaration_at)
      VALUES (${podnik?.id ?? null}, ${reporterId}, NULL, ${DRUH_WEB}, NULL, ${v.kategorie}, ${v.zduvodneni}, ${opisOznameni(v)},
        'web', ${v.jmeno}, ${v.email}, ${v.url}, NOW())
      RETURNING id`;
    return { id: Number(r.id), teamId: podnik?.id ?? null, podnik: podnik?.nazev ?? null };
  } catch (e) {
    console.error('DSA: oznámení se nepodařilo uložit', (e as { code?: string })?.code ?? e);
    return null;
  }
}

/** Provozovateli e-mail o novém oznámení a zápis `escalated_at`. Nikdy nevyhazuje. */
export async function eskalujOznameniWeb(id: number, kategorie: string, podnik: string | null): Promise<boolean> {
  try {
    const komu = kontaktModerace(process.env);
    if (!komu) return false;
    const { subject, html } = emailNovehoOznameni({ id, kategorie, podnik, odkaz: `${odkazovyZaklad()}/admin/nahlaseni` });
    const r = await sendSpravaEmail(komu, subject, html);
    if (!r.sent) return false;
    await sql`UPDATE content_reports SET escalated_at = NOW() WHERE id = ${id}`;
    return true;
  } catch (e) {
    console.error('DSA: eskalace selhala', e);
    return false;
  }
}

/** Oznamovateli potvrzení přijetí (čl. 16 odst. 4). Nikdy nevyhazuje. */
export async function potvrdOznamovateli(id: number, email: string | null, kategorie: string): Promise<boolean> {
  if (!email) return false;
  try {
    const { subject, html } = emailPotvrzeniOznameni({ id, kategorie, kontakt: kontaktDsa() });
    return (await sendPravniEmail(email, subject, html)).sent;
  } catch { return false; }
}

/**
 * Po vyřízení nahlášení (vedení podniku i správce platformy): oznamovateli z webu rozhodnutí
 * (čl. 16 odst. 5) a autorovi odstraněného obsahu odůvodnění (čl. 17). Nikdy nevyhazuje — vyřízení
 * už je zapsané a e-mail je doplněk.
 */
export async function poVyrizeniNahlaseni(reportId: number, stavSurovy: string, kdo: 'podnik' | 'provozovatel', poznamka?: string | null): Promise<void> {
  if (stavSurovy !== 'removed' && stavSurovy !== 'resolved' && stavSurovy !== 'dismissed') return;
  const stav: RozhodnutiDsa = stavSurovy;
  try {
    const [r] = await sql`
      SELECT r.id, r.kind, r.reason, r.reported_user_id, r.reporter_email, r.team_id, t.name AS podnik
      FROM content_reports r LEFT JOIN teams t ON t.id = r.team_id WHERE r.id = ${reportId}`;
    if (!r) return;
    if (r.kind === DRUH_WEB && r.reporter_email) {
      const { subject, html } = emailRozhodnutiOznameni({ id: reportId, stav, kontakt: kontaktDsa() });
      await sendPravniEmail(String(r.reporter_email), subject, html);
    }
    if (stav === 'removed' && r.reported_user_id && (r.kind === 'zprava' || r.kind === 'napad')) {
      await oznamOduvodneni(Number(r.reported_user_id), {
        druh: r.kind === 'zprava' ? 'odstraneni_zpravy' : 'odstraneni_napadu',
        duvod: nazevDuvodu(String(r.reason)), podnik: r.podnik ? String(r.podnik) : null, kdo, poznamka: poznamka ?? null,
      });
    }
    try { await sql`UPDATE content_reports SET oduvodneni_at = NOW() WHERE id = ${reportId}`; } catch { /* před migrací */ }
  } catch (e) {
    console.error('DSA: oznámení po vyřízení selhalo', e);
  }
}

/** Odůvodnění omezení autorovi (čl. 17): oznámení v aplikaci a e-mail, pokud účet e-mail má. Nikdy nevyhazuje. */
export async function oznamOduvodneni(userId: number, v: { druh: DruhOmezeni; duvod: string; podnik: string | null; kdo: 'podnik' | 'provozovatel'; poznamka?: string | null }): Promise<void> {
  try {
    const o = oduvodneni({ ...v, kontakt: kontaktDsa() });
    // Bez kategorie: jde o rozhodnutí o účtu, ne o novinky, a nesmí ho ztlumit žádná předvolba.
    await notifyUser(userId, { title: o.title, body: o.body, type: 'info' }).catch(() => false);
    const [u] = await sql`SELECT email FROM users WHERE id = ${userId}`;
    const email = String(u?.email ?? '');
    if (email && !email.endsWith('@managero.invalid') && jeEmail(email)) await sendPravniEmail(email, o.subject, o.html);
  } catch (e) {
    console.error('DSA: odůvodnění se nepodařilo doručit', e);
  }
}
