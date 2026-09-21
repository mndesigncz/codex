// Operace správce platformy nad podniky.
//
// REST pro obrazovku i MCP pro Clauda jsou tenké: obojí volá tohle. Každý
// zásah se zapíše do `admin_audit` s aktérem — z obrazovky e-mail, z MCP
// „api-token" — takže je vždycky dohledatelné, kdo podnik pozastavil.
//
// Co tu schválně NENÍ: přihlášení za někoho jiného, čtení uzávěrek nebo mezd
// a mazání podniků. První je díra, druhé není k podpoře potřeba, třetí je
// nevratné — a nevratné věci nepatří na tlačítko.

import { neon } from '@neondatabase/serverless';
import { planInfoOf, PLAN_NAMES, type PlanId, type PlanInfo } from '@/lib/plan';
import { isSuperadminId } from '@/lib/superadmin';
import type { AdminActor } from '@/lib/superadminGate';

const sql = neon(process.env.DATABASE_URL!);

export class AdminError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export type StavPodniku = 'aktivni' | 'zkusebni' | 'placeny' | 'zdarma' | 'pozastaveny' | 'po_splatnosti';

export interface PodnikRadek {
  id: number;
  name: string;
  businessType: string | null;
  createdAt: string | null;
  owner: { name: string | null; email: string | null } | null;
  members: number;
  plan: PlanInfo;
  planLabel: string;
  subscriptionStatus: string | null;
  blockedAt: string | null;
  blockedReason: string | null;
  adminNote: string | null;
  lastActivity: string | null;
  stav: StavPodniku;
}

function iso(v: unknown): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function stavZ(row: Record<string, unknown>, plan: PlanInfo): StavPodniku {
  if (row.blocked_at) return 'pozastaveny';
  if (plan.pastDue) return 'po_splatnosti';
  if (plan.trialing) return 'zkusebni';
  if (plan.effective === 'free') return 'zdarma';
  return 'placeny';
}

function radek(r: Record<string, unknown>): PodnikRadek {
  const plan = planInfoOf(r as Parameters<typeof planInfoOf>[0]);
  const posledni = [r.last_audit, r.last_closing].map(iso).filter(Boolean).sort().pop() ?? null;
  return {
    id: Number(r.id),
    name: String(r.name ?? ''),
    businessType: (r.business_type as string) ?? null,
    createdAt: iso(r.created_at),
    owner: r.owner_email || r.owner_name ? { name: (r.owner_name as string) ?? null, email: (r.owner_email as string) ?? null } : null,
    members: Number(r.members ?? 0),
    plan,
    planLabel: PLAN_NAMES[plan.effective] + (plan.override ? ' (ručně)' : plan.trialing ? ' (zkušební)' : ''),
    subscriptionStatus: (r.subscription_status as string) ?? null,
    blockedAt: iso(r.blocked_at),
    blockedReason: (r.blocked_reason as string) ?? null,
    adminNote: (r.admin_note as string) ?? null,
    lastActivity: posledni,
    stav: stavZ(r, plan),
  };
}



/**
 * Všechny podniky, nejnovější první. Filtr stavu se dělá až v paměti:
 * tarif je spočítaná věc (trial, Stripe, ruční), ne sloupec. Při stovkách
 * podniků je to v pořádku; při desetitisících se to přepíše — ne dřív.
 */
export async function listTeams(opts: { q?: string; stav?: StavPodniku | 'vse'; limit?: number; offset?: number } = {}) {
  const q = (opts.q ?? '').trim();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const vzor = `%${q}%`;
  // Sloupce jsou stejné jako v getTeam — obě místa se mění spolu.
  const rows = (await sql`
    SELECT
      t.id, t.name, t.business_type, t.created_at,
      t.plan, t.plan_override, t.trial_ends_at, t.subscription_status, t.subscription_interval,
      t.current_period_end, t.cancel_at_period_end, t.trial_end, t.max_offer_until,
      t.stripe_subscription_id, t.had_subscription,
      t.blocked_at, t.blocked_reason, t.admin_note,
      o.name AS owner_name, o.email AS owner_email,
      (SELECT COUNT(*) FROM users u WHERE u.team_id = t.id AND u.role IN ('employer','employee')) AS members,
      (SELECT MAX(a.created_at) FROM audit_log a WHERE a.team_id = t.id) AS last_audit,
      (SELECT MAX(c.created_at) FROM cash_closings c WHERE c.team_id = t.id) AS last_closing
    FROM teams t LEFT JOIN users o ON o.id = t.owner_id
    WHERE ${q} = '' OR t.name ILIKE ${vzor} OR o.email ILIKE ${vzor} OR o.name ILIKE ${vzor} OR CAST(t.id AS TEXT) = ${q}
    ORDER BY t.created_at DESC NULLS LAST, t.id DESC
    LIMIT 2000`) as Record<string, unknown>[];
  let vse = rows.map(radek);
  if (opts.stav && opts.stav !== 'vse') vse = vse.filter(p => p.stav === opts.stav);
  return { total: vse.length, teams: vse.slice(offset, offset + limit) };
}

export async function getTeam(id: number) {
  if (!Number.isFinite(id)) throw new AdminError(400, 'Neplatné id podniku.');
  const [r] = (await sql`
    SELECT
      t.id, t.name, t.business_type, t.created_at,
      t.plan, t.plan_override, t.trial_ends_at, t.subscription_status, t.subscription_interval,
      t.current_period_end, t.cancel_at_period_end, t.trial_end, t.max_offer_until,
      t.stripe_subscription_id, t.had_subscription,
      t.blocked_at, t.blocked_reason, t.admin_note,
      o.name AS owner_name, o.email AS owner_email,
      (SELECT COUNT(*) FROM users u WHERE u.team_id = t.id AND u.role IN ('employer','employee')) AS members,
      (SELECT MAX(a.created_at) FROM audit_log a WHERE a.team_id = t.id) AS last_audit,
      (SELECT MAX(c.created_at) FROM cash_closings c WHERE c.team_id = t.id) AS last_closing
    FROM teams t LEFT JOIN users o ON o.id = t.owner_id
    WHERE t.id = ${id}`) as Record<string, unknown>[];
  if (!r) throw new AdminError(404, 'Podnik s tímhle id neexistuje.');
  const members = await sql`
    SELECT id, name, email, role, avatar, created_at FROM users
    WHERE team_id = ${id} AND role IN ('employer','employee','kiosk')
    ORDER BY role DESC, name ASC`;
  const zasahy = await adminAudit({ teamId: id, limit: 30 });
  return {
    team: radek(r),
    members: (members as Record<string, unknown>[]).map(m => ({
      id: Number(m.id), name: String(m.name ?? ''), email: String(m.email ?? ''),
      role: String(m.role ?? ''), avatar: (m.avatar as string) ?? null, createdAt: iso(m.created_at),
    })),
    zasahy,
  };
}

export async function logAdmin(actor: AdminActor, action: string, teamId: number | null, detail?: string) {
  try {
    await sql`INSERT INTO admin_audit (actor, action, team_id, detail)
              VALUES (${actor.email}, ${action.slice(0, 60)}, ${teamId}, ${detail ? detail.slice(0, 500) : null})`;
  } catch { /* zásah se stal; chybějící záznam se nesmí tvářit jako neúspěch */ }
}

async function ownerJeSpravce(teamId: number): Promise<boolean> {
  const [t] = await sql`SELECT owner_id FROM teams WHERE id = ${teamId}`;
  return isSuperadminId(t?.owner_id);
}

export async function blockTeam(id: number, reason: string, actor: AdminActor) {
  const duvod = reason.trim();
  if (!duvod) throw new AdminError(400, 'Napiš důvod — podnik ho uvidí.');
  if (await ownerJeSpravce(id)) throw new AdminError(400, 'Podnik správce platformy nejde pozastavit — zamkl by sis dveře.');
  const [r] = await sql`UPDATE teams SET blocked_at = NOW(), blocked_reason = ${duvod.slice(0, 300)} WHERE id = ${id} RETURNING id`;
  if (!r) throw new AdminError(404, 'Podnik s tímhle id neexistuje.');
  await logAdmin(actor, 'team.block', id, duvod);
  return getTeam(id);
}

export async function unblockTeam(id: number, actor: AdminActor) {
  const [r] = await sql`UPDATE teams SET blocked_at = NULL, blocked_reason = NULL WHERE id = ${id} RETURNING id`;
  if (!r) throw new AdminError(404, 'Podnik s tímhle id neexistuje.');
  await logAdmin(actor, 'team.unblock', id);
  return getTeam(id);
}

export async function setPlanOverride(id: number, plan: PlanId | null, actor: AdminActor) {
  if (plan !== null && plan !== 'free' && plan !== 'pro' && plan !== 'max') throw new AdminError(400, 'Tarif musí být free, pro, max, nebo null (zpět na Stripe).');
  const [r] = await sql`UPDATE teams SET plan_override = ${plan} WHERE id = ${id} RETURNING id`;
  if (!r) throw new AdminError(404, 'Podnik s tímhle id neexistuje.');
  await logAdmin(actor, 'team.plan', id, plan ? `ručně ${PLAN_NAMES[plan]}` : 'zpět podle Stripe');
  return getTeam(id);
}

/**
 * Prodloužení zkušební doby. Týká se jen týmů na tarifu Zdarma bez karty —
 * `trial_ends_at` je jejich trial; trial se zadanou kartou vede Stripe a tam
 * se sahá přes Stripe, ne odsud.
 */
export async function extendTrial(id: number, days: number, actor: AdminActor) {
  const dny = Math.round(Number(days));
  if (!Number.isFinite(dny) || dny < 1 || dny > 365) throw new AdminError(400, 'Počet dní musí být 1 až 365.');
  const [r] = await sql`
    UPDATE teams
    SET trial_ends_at = GREATEST(COALESCE(trial_ends_at, NOW()), NOW()) + (${dny} * INTERVAL '1 day')
    WHERE id = ${id}
    RETURNING id, trial_ends_at, plan`;
  if (!r) throw new AdminError(404, 'Podnik s tímhle id neexistuje.');
  await logAdmin(actor, 'team.trial', id, `+${dny} dní → ${iso(r.trial_ends_at)?.slice(0, 10)}`);
  return getTeam(id);
}

export async function setNote(id: number, note: string, actor: AdminActor) {
  const text = note.trim().slice(0, 2000);
  const [r] = await sql`UPDATE teams SET admin_note = ${text || null} WHERE id = ${id} RETURNING id`;
  if (!r) throw new AdminError(404, 'Podnik s tímhle id neexistuje.');
  await logAdmin(actor, 'team.note', id, text ? 'poznámka upravena' : 'poznámka smazána');
  return getTeam(id);
}

export async function adminAudit(opts: { teamId?: number; limit?: number } = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  try {
    const rows = opts.teamId != null
      ? await sql`SELECT a.*, t.name AS team_name FROM admin_audit a LEFT JOIN teams t ON t.id = a.team_id WHERE a.team_id = ${opts.teamId} ORDER BY a.created_at DESC LIMIT ${limit}`
      : await sql`SELECT a.*, t.name AS team_name FROM admin_audit a LEFT JOIN teams t ON t.id = a.team_id ORDER BY a.created_at DESC LIMIT ${limit}`;
    return (rows as Record<string, unknown>[]).map(a => ({
      id: Number(a.id), actor: String(a.actor), action: String(a.action),
      teamId: a.team_id == null ? null : Number(a.team_id), teamName: (a.team_name as string) ?? null,
      detail: (a.detail as string) ?? null, createdAt: iso(a.created_at),
    }));
  } catch { return []; }
}

export async function overview() {
  const { teams } = await listTeams({ limit: 200 });
  const pocet = (s: StavPodniku) => teams.filter(t => t.stav === s).length;
  const tyden = Date.now() - 7 * 86400000;
  return {
    celkem: teams.length,
    aktivniTyden: teams.filter(t => t.lastActivity && new Date(t.lastActivity).getTime() > tyden).length,
    placeny: pocet('placeny'), zkusebni: pocet('zkusebni'), zdarma: pocet('zdarma'),
    pozastaveny: pocet('pozastaveny'), poSplatnosti: pocet('po_splatnosti'),
  };
}
