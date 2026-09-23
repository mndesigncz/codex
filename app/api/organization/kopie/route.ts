// Kopie do podniku (kolo 64): vedení podniku si zkopíruje návody, postupy
// nebo menu z jiného podniku téže organizace. Jednorázová kopie, ne sdílení.
//
// Zdrojový podnik `z` přijde z požadavku, ale projde jen jako podnik TÉŽE
// organizace, jakou má aktivní podnik z databáze — nikdy z tokenu ani z těla.
// Volající nemusí být členem zdroje: přehled organizace už dnes její podniky
// ukazuje, tohle jen bere jejich obsah.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { organizaceTymu, podnikyOrganizace } from '@/lib/tenant';
import { jeEntitaKopie, MAX_IDS_KOPIE, type EntitaKopie } from '@/lib/kopie';
import { seznamKeKopii, zkopirujDoPodniku } from '@/lib/kopieDoPodniku';

export const dynamic = 'force-dynamic';
const sql = neon(process.env.DATABASE_URL!);

async function ctx() {
  const s = await getServerSession(authOptions);
  if (!s?.user) return null;
  const meId = parseInt((s.user as any).id);
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  return { meId, role: String((s.user as any).role ?? ''), teamId: u?.team_id != null ? Number(u.team_id) : null };
}

type Chyba = { error: string; status: number };
type Zdroj = { meId: number; teamId: number; z: number; nazevZdroje: string; entita: EntitaKopie };

/** Společná brána GET i POST: vedení, aktivní podnik, organizace, zdroj v ní a jiný než cíl. */
async function zdroj(entitaRaw: unknown, zRaw: unknown): Promise<Zdroj | Chyba> {
  const c = await ctx();
  if (!c) return { error: 'Nepřihlášen', status: 401 };
  if (c.role !== 'employer') return { error: 'Nedostatečná oprávnění', status: 403 };
  if (!c.teamId) return { error: 'Nejsi v žádném podniku.', status: 400 };
  if (!jeEntitaKopie(entitaRaw)) return { error: 'Kopírovat jdou návody, postupy nebo menu.', status: 400 };
  const z = Number(zRaw);
  if (!Number.isInteger(z) || z <= 0) return { error: 'Chybí zdrojový podnik.', status: 400 };
  const org = await organizaceTymu(c.teamId);
  if (!org) return { error: 'Podnik není v organizaci.', status: 404 };
  if (z === c.teamId) return { error: 'Kopíruje se z jiného podniku.', status: 400 };
  const podniky = await podnikyOrganizace(org.id);
  if (!podniky.includes(z)) return { error: 'Podnik není v organizaci.', status: 400 };
  const [t] = await sql`SELECT name FROM teams WHERE id = ${z}`;
  return { meId: c.meId, teamId: c.teamId, z, nazevZdroje: String(t?.name ?? ''), entita: entitaRaw };
}

const jeChyba = (v: Zdroj | Chyba): v is Chyba => 'error' in v;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const v = await zdroj(searchParams.get('entita'), searchParams.get('z'));
  if (jeChyba(v)) return NextResponse.json({ error: v.error }, { status: v.status });
  try {
    const polozky = await seznamKeKopii(v.entita, v.z);
    return NextResponse.json({ podnik: { id: v.z, name: v.nazevZdroje }, polozky });
  } catch (e) {
    console.error('[kopie] seznam selhal:', e);
    return NextResponse.json({ error: 'Seznam se nepodařilo načíst. Zkus to znovu.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const b = await request.json().catch(() => ({}));
  const v = await zdroj(b?.entita, b?.z);
  if (jeChyba(v)) return NextResponse.json({ error: v.error }, { status: v.status });
  // Id bez duplikátů: dvakrát vybraná položka by vznikla dvakrát.
  const ids = Array.isArray(b?.ids)
    ? [...new Set((b.ids as unknown[]).map(Number).filter(n => Number.isInteger(n) && n > 0))]
    : [];
  if (!ids.length) return NextResponse.json({ error: 'Vyber, co zkopírovat.' }, { status: 400 });
  if (ids.length > MAX_IDS_KOPIE) return NextResponse.json({ error: `Najednou jde zkopírovat nejvíc ${MAX_IDS_KOPIE} položek.` }, { status: 400 });

  let vysledky;
  try {
    vysledky = await zkopirujDoPodniku({ entita: v.entita, z: v.z, nazevZdroje: v.nazevZdroje, teamId: v.teamId, meId: v.meId, ids });
  } catch (e) {
    // Spadlo ještě před kopírováním (čtení zdroje) — nic nevzniklo.
    console.error('[kopie] kopie selhala:', e);
    return NextResponse.json({ ok: false, error: 'Kopie se nepovedla. Zkus to znovu.', vysledky: [] }, { status: 500 });
  }
  // Selhání jedné položky ostatní nezastaví; pětistovka jen když nevzniklo nic.
  const ok = vysledky.some(r => r.noveId != null);
  return NextResponse.json({ ok, vysledky }, { status: ok ? 200 : 500 });
}
