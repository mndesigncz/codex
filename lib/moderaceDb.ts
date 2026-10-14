// Nahlášený obsah v databázi: vyřízení (vedení podniku i správce platformy) a eskalace
// provozovateli. Pravidla a texty jsou čisté v lib/moderace.ts.

import { neon } from '@neondatabase/serverless';
import { sendSpravaEmail, odkazovyZaklad } from './email';
import { emailEskalace, kontaktModerace, type DruhObsahu, type StavNahlaseni } from './moderace';

const sql = neon(process.env.DATABASE_URL!);

export interface NahlaseniRadek { id: number; teamId: number | null; kind: string; refId: number | null; status: string }

/**
 * Vyřídí nahlášení: u `removed` smaže obsah (jen obsah téhož podniku, zprávu jen z vlákna podniku)
 * a zapíše stav. `teamId` = podnik vedení (jen jeho nahlášení); `null` = správce platformy (kterékoli).
 * Vrací vyřízený řádek, nebo null, když nahlášení není (nebo patří jinému podniku).
 */
export async function vyridNahlaseni(reportId: number, stav: StavNahlaseni, kdo: number | null, teamId: number | null): Promise<NahlaseniRadek | null> {
  const [r] = teamId == null
    ? await sql`SELECT id, team_id, kind, ref_id, status FROM content_reports WHERE id = ${reportId}`
    : await sql`SELECT id, team_id, kind, ref_id, status FROM content_reports WHERE id = ${reportId} AND team_id = ${teamId}`;
  if (!r) return null;
  const tym = r.team_id == null ? null : Number(r.team_id);
  if (stav === 'removed' && tym != null) {
    if (r.kind === 'zprava') {
      await sql`DELETE FROM chat_messages WHERE id = ${r.ref_id} AND conversation_id IN (SELECT id FROM conversations WHERE team_id = ${tym})`;
    } else if (r.kind === 'napad') {
      await sql`DELETE FROM suggestion_votes WHERE suggestion_id = ${r.ref_id} AND suggestion_id IN (SELECT id FROM suggestions WHERE team_id = ${tym})`;
      await sql`DELETE FROM suggestions WHERE id = ${r.ref_id} AND team_id = ${tym}`;
    }
  }
  await sql`UPDATE content_reports SET status = ${stav}, resolved_by = ${kdo}, resolved_at = NOW() WHERE id = ${reportId}`;
  return { id: Number(r.id), teamId: tym, kind: String(r.kind), refId: r.ref_id == null ? null : Number(r.ref_id), status: stav };
}

/**
 * Nové nahlášení pošle provozovateli platformy (MODERACE_EMAIL, jinak FIRMA_EMAIL_PODPORY) a zapíše
 * `escalated_at`. Bez adresy nebo bez Resendu se nic nepošle a nahlášení zůstane jen ve správě
 * (/admin/nahlaseni), kde ho správce stejně uvidí. Nikdy nevyhazuje.
 */
export async function eskalujNahlaseni(v: { id: number; teamId: number; druh: DruhObsahu; duvod: string }): Promise<boolean> {
  try {
    const komu = kontaktModerace(process.env);
    if (!komu) return false;
    const [t] = await sql`SELECT name FROM teams WHERE id = ${v.teamId}`;
    const { subject, html } = emailEskalace({ id: v.id, podnik: String(t?.name ?? `podnik ${v.teamId}`), druh: v.druh, duvod: v.duvod, odkaz: `${odkazovyZaklad()}/admin/nahlaseni` });
    const r = await sendSpravaEmail(komu, subject, html);
    if (!r.sent) return false;
    await sql`UPDATE content_reports SET escalated_at = NOW() WHERE id = ${v.id}`;
    return true;
  } catch (e) {
    console.error('eskalace nahlášení selhala', e);
    return false;
  }
}
