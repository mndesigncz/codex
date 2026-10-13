// Společné kusy rout /api/payroll (kolo 8, R8-1): pravidla podniku, rozmezí z dotazu, zámky období.
//
// Není to routa (Next bere jen route.ts), jen modul, ze kterého si GET /api/payroll, PUT /api/payroll/rules,
// výplaty a zámky berou totéž — pravidla se normalizují na jednom místě (lib/dochazkaPrehled), ať server
// a klient počítají dýško i příplatky nad stejným tvarem.

import { neon } from '@neondatabase/serverless';
import {
  VYCHOZI_PRAVIDLA_DYSKA, normalizujPravidlaDyska, normalizujPravidlaPriplatku,
  type PravidlaDyska, type PravidlaPriplatku, type ZamekObdobi,
} from '@/lib/dochazkaPrehled';
import { dayPlus } from '@/lib/pragueTime';

const sql = neon(process.env.DATABASE_URL!);

export interface PravidlaPodniku {
  dysko: PravidlaDyska;
  priplatky: PravidlaPriplatku;
  /** Zaměstnanec vidí svůj podíl na dýšku v Mém výdělku. */
  showTipsToStaff: boolean;
  /** Měsíční výdělek z DPP, od kterého se odvádí pojištění (zadává podnik, mění se ročně); null = nehlídat. */
  hraniceOdvodu: number | null;
  payDailyCash: boolean;
  ownerId: number | null;
}

/** Pravidla z řádku podniku; před migrací (sloupce chybí) výchozí. `vylouceni` dýška se dosadí podle rolí. */
export async function nactiPravidla(teamId: number): Promise<PravidlaPodniku> {
  let radek: any = null;
  try {
    [radek] = await sql`SELECT tip_rules, pay_rules, show_tips_to_staff, pay_daily_cash, owner_id FROM teams WHERE id = ${teamId}`;
  } catch {
    try { [radek] = await sql`SELECT pay_daily_cash, owner_id FROM teams WHERE id = ${teamId}`; } catch { /* před migrací */ }
  }
  const pay = (radek?.pay_rules && typeof radek.pay_rules === 'object' ? radek.pay_rules : {}) as Record<string, unknown>;
  const hranice = Number(pay.hraniceOdvodu);
  const dysko = radek?.tip_rules ? normalizujPravidlaDyska(radek.tip_rules) : { ...VYCHOZI_PRAVIDLA_DYSKA };
  const out: PravidlaPodniku = {
    dysko,
    priplatky: normalizujPravidlaPriplatku(pay),
    showTipsToStaff: radek?.show_tips_to_staff === true,
    hraniceOdvodu: Number.isFinite(hranice) && hranice > 0 ? Math.round(hranice) : null,
    payDailyCash: radek?.pay_daily_cash === true,
    ownerId: radek?.owner_id != null ? Number(radek.owner_id) : null,
  };
  // Bez „Dělit i s vedením" se z dělení vyřadí vlastník a každý s rolí vedení v tomhle podniku.
  if (!dysko.sVedenim) {
    const ids = new Set<string>(dysko.vylouceni);
    if (out.ownerId != null) ids.add(String(out.ownerId));
    try {
      const rows = await sql`SELECT user_id FROM team_members WHERE team_id = ${teamId} AND role = 'employer'`;
      for (const r of rows as any[]) ids.add(String(r.user_id));
    } catch { /* před migrací team_members */ }
    out.dysko = { ...dysko, vylouceni: [...ids] };
  } else {
    out.dysko = { ...dysko, vylouceni: [] };
  }
  return out;
}

/** Pozice lidí v podniku (id → job_title) pro váhy dýška. */
export async function pozicePodniku(teamId: number): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  try {
    const rows = await sql`
      SELECT u.id, COALESCE(m.job_title, u.job_title) AS job_title
      FROM users u LEFT JOIN team_members m ON m.user_id = u.id AND m.team_id = ${teamId}
      WHERE m.user_id IS NOT NULL OR u.team_id = ${teamId}`;
    for (const r of rows as any[]) if (r.job_title) m.set(String(r.id), String(r.job_title));
  } catch { /* před migrací */ }
  return m;
}

const JE_DEN = /^\d{4}-\d{2}-\d{2}$/;
/** Nejdelší období na jeden dotaz (rok a kousek) — účetní chce měsíc, ne historii podniku. */
const MAX_DNI = 400;

/** Rozmezí `od`–`do` z dotazu; neplatné = null. */
export function rozmeziZDotazu(p: URLSearchParams): { od: string; do: string } | null {
  const od = String(p.get('od') ?? '');
  const doD = String(p.get('do') ?? '');
  if (!JE_DEN.test(od) || !JE_DEN.test(doD) || od > doD) return null;
  if (dayPlus(od, MAX_DNI) < doD) return null;
  return { od, do: doD };
}

/** Zámky období podniku, které zasahují do <od, do>. */
export async function nactiZamky(teamId: number, od: string, doD: string): Promise<ZamekObdobi[]> {
  try {
    const rows = await sql`
      SELECT id, period_from, period_to, locked_by, locked_at FROM payroll_locks
      WHERE team_id = ${teamId} AND period_from <= ${doD} AND period_to >= ${od}
      ORDER BY period_from DESC`;
    return (rows as any[]).map(r => ({ id: Number(r.id), od: String(r.period_from), do: String(r.period_to), lockedBy: r.locked_by != null ? Number(r.locked_by) : null, lockedAt: r.locked_at ? String(r.locked_at) : null }));
  } catch { return []; }
}

/** Ids ze sloupce cash_closings.shift_employees (JSONB pole čísel; starší řádky prázdné). */
export function idsZeSmeny(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const raw of v) { const id = Number(raw); if (Number.isFinite(id) && !out.includes(id)) out.push(id); }
  return out;
}
