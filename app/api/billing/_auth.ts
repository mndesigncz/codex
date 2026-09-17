import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

/** Přihlášené vedení s týmem — jen to smí sahat na předplatné. */
export async function employerCtx() {
  const s = await getServerSession(authOptions);
  if (!s?.user) return null;
  const id = parseInt((s.user as any).id);
  const role = (s.user as any).role as string;
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${id}`;
  return { id, role, teamId: (u?.team_id as number | null) ?? null };
}
