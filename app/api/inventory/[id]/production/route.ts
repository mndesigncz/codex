import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { recipeOf, saveRecipe } from '@/lib/production';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function me() {
  const s = await getServerSession(authOptions);
  if (!s?.user) return null;
  const id = parseInt((s.user as any).id);
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${id}`;
  return { id, role: (s.user as any).role as string, teamId: u?.team_id as number | null };
}

// GET: výrobní receptura položky včetně toho, co je ve skladu (každá role).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const c = await me();
  if (!c?.teamId) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const id = parseInt(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });
  const r = await recipeOf(c.teamId, id);
  if (!r) return NextResponse.json({ error: 'Položka nenalezena' }, { status: 404 });
  return NextResponse.json(r);
}

// PUT: uložit recepturu — jen vedení.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const c = await me();
  if (!c?.teamId) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (c.role !== 'employer') return NextResponse.json({ error: 'Recepturu nastavuje vedení' }, { status: 403 });
  const id = parseInt(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  try {
    const r = await saveRecipe(c.teamId, id, b, c.id);
    return NextResponse.json(r);
  } catch (e: any) {
    const msg = String(e?.message ?? '');
    if (msg.includes('nenalezena')) return NextResponse.json({ error: msg }, { status: 404 });
    return NextResponse.json({ error: 'Uložení se nepodařilo — databáze možná ještě nemá tabulku receptur (spusť /api/init).' }, { status: 500 });
  }
}
