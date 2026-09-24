// Moje podniky — pro přepínač v hlavičce.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { clenstviUzivatele, organizaceTymu, smiZalozitDalsiPodnik } from '@/lib/tenant';
import { roleClena } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';
const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  const s = await getServerSession(authOptions);
  if (!s?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const meId = parseInt((s.user as any).id);
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  const activeTeamId = u?.team_id != null ? Number(u.team_id) : null;
  const teams = await clenstviUzivatele(meId);
  const org = activeTeamId ? await organizaceTymu(activeTeamId) : null;
  // „Přidat podnik" jen tomu, komu to server dovolí: vlastník podniku
  // (a jeho organizace). Přepínač tlačítko jinak nekreslí. Rozhoduje
  // vlastnictví, ne role z tokenu — stejně jako v /api/teams/create.
  const muzuZalozit = activeTeamId != null ? await smiZalozitDalsiPodnik(meId, activeTeamId) : false;
  // Oprávnění v aktivním podniku (kolo 67) — klient podle nich skládá
  // navigaci a skrývá akce. Rozhoduje ale server: tohle je jen nápověda UI.
  // Když se roli nepodaří načíst (chyba DB), pošle se opravneni: null —
  // klient pak nic neschová („ukázat vše, rozhodne server"). Prázdné pole
  // by vedení na zbytek relace sebralo celou navigaci.
  let r: Awaited<ReturnType<typeof roleClena>> = null;
  let nevim = false;
  if (activeTeamId != null) {
    try { r = await roleClena(meId, activeTeamId); } catch { nevim = true; }
  }
  return NextResponse.json({
    role: r ? { klic: r.klic, roleId: r.roleId, nazev: r.nazev, typ: r.typ, jeVlastnik: r.jeVlastnik } : null,
    opravneni: nevim ? null : r ? [...r.opravneni].sort() : [],
    activeTeamId,
    teams,
    muzuZalozit,
    organization: org ? { id: org.id, name: org.name, isOwner: org.ownerId === meId, settings: org.nastaveni } : null,
  });
}
