// Scheduling rules the generator obeys. Today that is one rule: how many days
// in a row a person may be rostered — a team-wide default with an optional
// per-person override (some people want doubles, some burn out on three).

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

/** Team default: null = no limit. Anything outside 1–14 is nonsense for a rota. */
function cleanTeamLimit(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(14, Math.max(1, n));
}

/**
 * Per-person override, three states:
 *   null → follow the team default
 *   0    → explicitly no limit for this person (even when the team has one)
 *   1–14 → their own limit
 */
function cleanPersonLimit(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0) return null;
  if (n === 0) return 0;
  return Math.min(14, Math.max(1, n));
}

async function employer() {
  const s = await getServerSession(authOptions);
  if (!s?.user) return null;
  const meId = parseInt((s.user as any).id);
  const [u] = await sql`SELECT id, role, team_id FROM users WHERE id = ${meId}`;
  if (!u || u.role !== 'employer' || !u.team_id) return null;
  return u;
}

export async function GET() {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  let teamMax: number | null = null;
  try {
    const [t] = await sql`SELECT max_consecutive_days FROM teams WHERE id = ${u.team_id}`;
    teamMax = t?.max_consecutive_days ?? null;
  } catch { /* not migrated yet */ }

  let members: any[] = [];
  try {
    members = await sql`
      SELECT id, name, avatar, role, max_consecutive_days AS "maxConsecutive"
      FROM users WHERE team_id = ${u.team_id} AND role IN ('employee','employer')
      ORDER BY role DESC, name ASC`;
  } catch {
    members = await sql`
      SELECT id, name, avatar, role, NULL AS "maxConsecutive"
      FROM users WHERE team_id = ${u.team_id} AND role IN ('employee','employer')
      ORDER BY role DESC, name ASC`;
  }

  return NextResponse.json({ teamMax, members });
}

// PUT { teamMax?: number|null, overrides?: [{ id, maxConsecutive }] }
export async function PUT(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const b = await req.json().catch(() => ({}));

  try {
    if (b.teamMax !== undefined) {
      await sql`UPDATE teams SET max_consecutive_days = ${cleanTeamLimit(b.teamMax)} WHERE id = ${u.team_id}`;
    }
    if (Array.isArray(b.overrides)) {
      for (const o of b.overrides.slice(0, 100)) {
        const id = parseInt(o?.id);
        if (!Number.isFinite(id)) continue;
        // Team-scoped: a stray id can never rewrite someone else's rota rule.
        await sql`
          UPDATE users SET max_consecutive_days = ${cleanPersonLimit(o?.maxConsecutive)}
          WHERE id = ${id} AND team_id = ${u.team_id}`;
      }
    }
  } catch {
    return NextResponse.json({ error: 'Pravidla nejsou dostupná — spusť /api/init.' }, { status: 400 });
  }

  audit(u.team_id, u.id, 'schedule.rules', 'schedule', null,
    b.teamMax !== undefined ? `Max dní po sobě: ${cleanTeamLimit(b.teamMax) ?? 'bez omezení'}` : 'Výjimky u lidí');
  return NextResponse.json({ ok: true });
}
