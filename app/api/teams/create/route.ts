// Přidat další podnik — jen vedení, pod jeho organizací.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, zneplatniStav } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { zalozDalsiPodnik, prepniTym, smiZalozitDalsiPodnik, NeniVlastnikPodniku } from '@/lib/tenant';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
const sql = neon(process.env.DATABASE_URL!);

export async function POST(req: Request) {
  const s = await getServerSession(authOptions);
  if (!s?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if ((s.user as any).role !== 'employer') return NextResponse.json({ error: 'Podnik zakládá vedení.' }, { status: 403 });
  const meId = parseInt((s.user as any).id);
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  if (!u?.team_id) return NextResponse.json({ error: 'Nejsi v žádném podniku.' }, { status: 400 });
  // Vlastnictví, ne role. Kdo je v podniku jen vedením (povýšený manažer,
  // pozvaný cizí majitel), by si jinak založil organizaci nad cizím podnikem
  // a stal se jejím vlastníkem.
  if (!(await smiZalozitDalsiPodnik(meId, Number(u.team_id)))) {
    return NextResponse.json({ error: 'Další podnik zakládá vlastník podniku.' }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  const nazev = String(b.name ?? '').trim().slice(0, 80);
  if (!nazev) return NextResponse.json({ error: 'Zadej název podniku.' }, { status: 400 });
  let teamId: number, organizationId: number;
  try {
    ({ teamId, organizationId } = await zalozDalsiPodnik(meId, Number(u.team_id), nazev));
  } catch (e) {
    if (e instanceof NeniVlastnikPodniku) return NextResponse.json({ error: e.message }, { status: 403 });
    // Tabulky organizací ještě nejsou (init po nasazení neproběhl) — říct
    // to, ne spadnout na obecnou pětistovku.
    return NextResponse.json({ error: 'Založení dalšího podniku bude dostupné po dokončení aktualizace — zkus to za chvíli.' }, { status: 503 });
  }
  audit(teamId, meId, 'team.create', 'team', teamId, `Nový podnik „${nazev}" v organizaci ${organizationId}`);
  // Rovnou do něj — člověk ho jde nastavit.
  if (b.switchTo !== false) { await prepniTym(meId, teamId); zneplatniStav(meId); }
  return NextResponse.json({ ok: true, teamId, organizationId });
}
