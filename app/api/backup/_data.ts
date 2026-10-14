// Obsah zálohy jednoho podniku — skládá se za běhu při stažení (/api/backup/stahnout),
// nikde se neukládá ani neposílá e-mailem.
//
// Co v záloze NENÍ (spuštění, balík P):
//  * soukromé konverzace (type 'direct') — ani zprávy, ani členové. Vlastník podniku
//    nemá číst cizí soukromé zprávy a záloha k tomu nesmí být zadní vrátka;
//  * zprávy mimo týmový kanál vůbec: do zálohy jde jen kanál 'team', ve kterém je celý
//    tým, takže příjemce zálohy dostane jen to, co v aplikaci stejně vidí. Kdyby někdy
//    přibyly skupinové konverzace, příjemce v nich být nemusí — proto bílá listina,
//    ne černá (KONVERZACE_V_ZALOZE);
//  * sazby a mzdové údaje (VYRAZENE_SLOUPCE): hodinová sazba v členství i v users,
//    výdělek a sazba v uzávěrce, výplata z kasy, smlouvy, pravidla výplat; tabulky
//    úprav mezd, výplat a zámků výplat v seznamu nejsou vůbec;
//  * oznámení (notifications): nesou texty jako „Prémie k výplatě +500" nebo „Trest",
//    pro obnovu podniku nemají cenu;
//  * hash hesla, tokeny pozvánek a sdílených odkazů, push klíče.
import { bezVyrazenych, KONVERZACE_V_ZALOZE } from '@/lib/pravni/zalohaOdkaz';

/**
 * Jak se tabulka zúží na JEDEN podnik:
 *   team          … WHERE team_id = $team
 *   user:<col>    … WHERE <col> IN (členové $team)
 *   conversation  … WHERE conversation_id IN (konverzace $team v bílé listině)
 *   scopedBy      … vlastní WHERE pro tabulky, ke kterým se jde přes víc kroků
 * Když nejnovější sloupec ještě není, padá se z `team` na `user:<col>`; když nevyjde
 * nic, tabulka se pro podnik vynechá (vynechat je bezpečné, vydat cizí řádky ne).
 */
const TABLES: { name: string; team?: boolean; user?: string; conversation?: boolean; scopedBy?: string }[] = [
  { name: 'invitations', team: true },
  { name: 'team_members', team: true },
  { name: 'roles', team: true },
  { name: 'organizations', scopedBy: 'id = (SELECT organization_id FROM teams WHERE id = $1)' },
  { name: 'shifts', team: true, user: 'employee_id' },
  { name: 'shift_requests', team: true, user: 'employee_id' },
  { name: 'availability_requests', team: true, user: 'employee_id' },
  { name: 'time_entries', team: true, user: 'employee_id' },
  { name: 'time_off_requests', team: true, user: 'employee_id' },
  { name: 'shift_offers', team: true },
  { name: 'shift_reviews', team: true, user: 'employee_id' },
  { name: 'cash_closings', team: true, user: 'created_by' },
  { name: 'inventory_items', team: true },
  { name: 'inventory_categories', team: true },
  { name: 'inventory_log', scopedBy: 'item_id IN (SELECT id FROM inventory_items WHERE team_id = $1)' },
  { name: 'inventory_reports', team: true, user: 'reported_by' },
  { name: 'guide_categories', team: true },
  { name: 'guides', team: true },
  { name: 'procedures', team: true, user: 'created_by' },
  { name: 'procedure_runs', team: true, user: 'user_id' },
  { name: 'tasks', team: true, user: 'created_by' },
  { name: 'planning_cards', team: true, user: 'created_by' },
  { name: 'daily_reports', team: true, user: 'created_by' },
  { name: 'recipes', team: true, user: 'created_by' },
  { name: 'announcements', team: true, user: 'author_id' },
  { name: 'suggestions', team: true, user: 'author_id' },
  { name: 'share_links', team: true },
  { name: 'menu_boards', team: true },
  { name: 'menu_sections', scopedBy: 'board_id IN (SELECT id FROM menu_boards WHERE team_id = $1)' },
  { name: 'menu_items', scopedBy: 'section_id IN (SELECT id FROM menu_sections WHERE board_id IN (SELECT id FROM menu_boards WHERE team_id = $1))' },
  // Chat: jen konverzace z bílé listiny (týmový kanál), jejich členové a zprávy.
  { name: 'conversations', scopedBy: 'team_id = $1 AND type = ANY($2::text[])' },
  { name: 'conversation_members', conversation: true },
  { name: 'chat_messages', conversation: true },
];

// users BEZ password_hash a bez hourly_rate; push_subscriptions (klíče) se nevydávají nikdy.
const USERS_QUERY =
  'SELECT id, name, email, role, avatar, phone, job_title, shift_preference, employer_id, team_id, theme, created_at FROM users WHERE team_id = $1';

/** Data jednoho podniku po tabulkách, bez vyřazených sloupců. */
export async function dumpTeam(sql: any, teamId: number): Promise<{ dump: Record<string, any[]>; rowCount: number }> {
  const dump: Record<string, any[]> = {};
  let rowCount = 0;
  const put = (name: string, rows: any[]) => { const cista = rows.map(r => bezVyrazenych(r)); dump[name] = cista; rowCount += cista.length; };
  const druhy = [...KONVERZACE_V_ZALOZE];

  try { put('teams', await sql.query('SELECT * FROM teams WHERE id = $1', [teamId])); } catch { dump['teams'] = []; }
  try { put('users', await sql.query(USERS_QUERY, [teamId])); } catch { dump['users'] = []; }

  for (const t of TABLES) {
    let rows: any[] | null = null;
    if (t.team) {
      try { rows = await sql.query(`SELECT * FROM ${t.name} WHERE team_id = $1`, [teamId]); } catch { rows = null; }
    }
    if (rows === null && t.user) {
      try {
        rows = await sql.query(`SELECT * FROM ${t.name} WHERE ${t.user} IN (SELECT id FROM users WHERE team_id = $1)`, [teamId]);
      } catch { rows = null; }
    }
    if (rows === null && t.scopedBy) {
      const parametry = t.scopedBy.includes('$2') ? [teamId, druhy] : [teamId];
      try { rows = await sql.query(`SELECT * FROM ${t.name} WHERE ${t.scopedBy}`, parametry); } catch { rows = null; }
    }
    if (rows === null && t.conversation) {
      try {
        rows = await sql.query(
          `SELECT * FROM ${t.name} WHERE conversation_id IN (SELECT id FROM conversations WHERE team_id = $1 AND type = ANY($2::text[]))`,
          [teamId, druhy],
        );
      } catch { rows = null; }
    }
    put(t.name, rows ?? []);
  }
  return { dump, rowCount };
}

/** Co se do zálohy nedostane — jde do souboru, ať je zřejmé, že chybí záměrně. */
export const POPIS_VYNECHANEHO = 'Bez soukromých zpráv (jen týmový kanál), bez sazeb a mzdových údajů, bez oznámení, hesel a tokenů.';
