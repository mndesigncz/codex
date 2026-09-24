// Nastavení organizace — čte každý člen, mění jen její vlastník.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { organizaceTymu, podnikyOrganizace } from '@/lib/tenant';
import { CISELNIKY, coSeSlucuje, coSeVypina, normalizujNastaveni, normalizujZdroje, ocistiZdroje } from '@/lib/organizace';
import { provedZmenuZdroju, type VysledekKopie } from '@/lib/sdileneCiselnikyDb';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
const sql = neon(process.env.DATABASE_URL!);

async function ctx() {
  const s = await getServerSession(authOptions);
  if (!s?.user) return null;
  const meId = parseInt((s.user as any).id);
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  return { meId, teamId: u?.team_id != null ? Number(u.team_id) : null };
}

export async function GET() {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId) return NextResponse.json({ organization: null });
  const org = await organizaceTymu(c.teamId);
  if (!org) return NextResponse.json({ organization: null });
  let teams: any[] = [];
  try {
    teams = await sql`SELECT id, name FROM teams WHERE organization_id = ${org.id} ORDER BY name`;
  } catch { /* před migrací */ }
  return NextResponse.json({
    organization: { id: org.id, name: org.name, isOwner: org.ownerId === c.meId, settings: org.nastaveni, teams },
  });
}

export async function PATCH(req: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId) return NextResponse.json({ error: 'Nejsi v žádném podniku.' }, { status: 400 });
  const org = await organizaceTymu(c.teamId);
  if (!org) return NextResponse.json({ error: 'Podnik není v organizaci.' }, { status: 404 });
  if (org.ownerId !== c.meId) return NextResponse.json({ error: 'Nastavení organizace mění jen její vlastník.' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = b.settings && typeof b.settings === 'object' ? { ...b.settings } : {};

  // Zdroje číselníků (kolo 60) projdou jen jako podniky TÉHLE organizace.
  // Cizí id se nevynuluje potichu, ale odmítne — klient by jinak nevěděl,
  // že jeho volba propadla. Tohle je první ze dvou kontrol; druhá je při
  // každém čtení (tymyProCiselnik), aby stará hodnota po odchodu podniku
  // z organizace nikdy nic nepustila.
  const podniky = await podnikyOrganizace(org.id);
  if ('zdrojeCiselniku' in patch) {
    const chtene = normalizujZdroje(patch.zdrojeCiselniku);
    const ocistene = ocistiZdroje(patch.zdrojeCiselniku, podniky);
    if (CISELNIKY.some(k => chtene[k.klic] != null && ocistene[k.klic] == null)) {
      return NextResponse.json({ error: 'Podnik není v organizaci.' }, { status: 400 });
    }
    patch.zdrojeCiselniku = ocistene;
  }
  // Mělké sloučení: klient posílá celou mapu zdrojů, ne jeden klíč.
  const nastaveni = normalizujNastaveni({ ...org.nastaveni, ...patch });
  const name = typeof b.name === 'string' && b.name.trim() ? b.name.trim().slice(0, 80) : org.name;

  // Kopie a sloučení běží PŘED uložením: dokud platí staré nastavení, podnik
  // B ještě řádky zdroje čte, takže se dá zjistit, které z nich používá.
  // Chyba u jednoho podniku uložení nezastaví — vrací se v `kopie`, ať UI
  // neřekne „Uloženo" nad podnikem, kterému kopie nevznikla.
  const vypina = coSeVypina(org.nastaveni, nastaveni);
  // Sloučení běží pro KAŽDÝ číselník, který má po uložení zdroj — ne jen
  // pro ten, který ho právě dostal. Je idempotentní (kopie bez originálu ve
  // zdroji nechá být), takže „Zkuste to znovu" znamená uložit totéž znovu:
  // podnik, kterému sloučení minule selhalo, se sloučí teď. Vracet kvůli
  // němu zdroj zpátky nejde — ostatní podniky už na nový zdroj ukazují.
  const slucuje = nastaveni.sdileneCiselniky
    ? CISELNIKY.flatMap(k => { const z = nastaveni.zdrojeCiselniku[k.klic]; return k.kopie && z != null ? [{ ciselnik: k.klic, zdroj: z }] : []; })
    : [];
  let kopie: VysledekKopie[] = [];
  if (vypina.length || slucuje.length) {
    kopie = await provedZmenuZdroju({ orgId: org.id, meId: c.meId, podniky, vypina, slucuje });
  }
  // Kde KOPIE u některého podniku selhala, zůstane pro ten číselník staré
  // nastavení: podniky ho dál čtou a vypnutí se dá zopakovat. Dřív se nové
  // nastavení uložilo i tak — a opakovaný pokus se stejnými hodnotami už
  // žádnou změnu neviděl, takže nic neudělal.
  const selhalaKopie = new Set(kopie.filter(k => !k.ok && k.akce === 'kopie').map(k => k.ciselnik));
  if (selhalaKopie.size) {
    const vypnutoVse = org.nastaveni.sdileneCiselniky && !nastaveni.sdileneCiselniky;
    if (vypnutoVse) nastaveni.sdileneCiselniky = true;
    for (const v of vypina) {
      nastaveni.zdrojeCiselniku[v.ciselnik] = selhalaKopie.has(v.ciselnik)
        ? org.nastaveni.zdrojeCiselniku[v.ciselnik]
        : (vypnutoVse ? null : nastaveni.zdrojeCiselniku[v.ciselnik]);
    }
  }

  await sql`UPDATE organizations SET name = ${name}, settings = ${JSON.stringify(nastaveni)}::jsonb WHERE id = ${org.id}`;
  audit(c.teamId, c.meId, 'organization.settings', 'organization', org.id, JSON.stringify(nastaveni));
  // Změna zdrojů zvlášť: audit_log nemá organization_id, píše se k aktivnímu podniku jako dosud.
  const zmenaZdroju = vypina.length > 0 || coSeSlucuje(org.nastaveni, nastaveni).length > 0
    || JSON.stringify(org.nastaveni.zdrojeCiselniku) !== JSON.stringify(nastaveni.zdrojeCiselniku);
  if (zmenaZdroju || kopie.some(k => !k.ok || k.pocet > 0)) {
    audit(c.teamId, c.meId, 'organization.ciselniky', 'organization', org.id,
      JSON.stringify({ sdileneCiselniky: nastaveni.sdileneCiselniky, zdroje: nastaveni.zdrojeCiselniku }));
  }
  return NextResponse.json({ ok: true, organization: { id: org.id, name, settings: nastaveni }, kopie });
}
