// Kopie do podniku (kolo 64): vedení podniku si zkopíruje návody, postupy
// nebo menu z jiného podniku téže organizace. Jednorázová kopie, ne sdílení.
//
// Zdrojový podnik `z` přijde z požadavku, ale projde jen jako podnik TÉŽE
// organizace, jakou má aktivní podnik z databáze — nikdy z tokenu ani z těla —
// a jen jako podnik, kde je volající členem VEDENÍ. Stejné pravidlo jako
// konsolidovaný přehled (podnikyProPrehled): role vedení v jedné pobočce
// neotevírá receptury, postupy a ceny ostatních poboček. Kdo je vede, ten
// si je zkopírovat smí; kdo ne, požádá vlastníka o členství.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { clenstviUzivatele, organizaceTymu } from '@/lib/tenant';
import { podnikyProPrehled } from '@/lib/prehledOrganizace';
import { jeEntitaKopie, MAX_IDS_KOPIE, MAX_ID, type EntitaKopie } from '@/lib/kopie';
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
type Zdroj = { meId: number; teamId: number; z: number; nazevZdroje: string; nazevCile: string; entita: EntitaKopie };

/** Společná brána GET i POST: vedení v cíli i ve zdroji, táž organizace, zdroj jiný než cíl a nepozastavený. */
async function zdroj(entitaRaw: unknown, zRaw: unknown): Promise<Zdroj | Chyba> {
  const c = await ctx();
  if (!c) return { error: 'Nepřihlášen', status: 401 };
  if (c.role !== 'employer') return { error: 'Nedostatečná oprávnění', status: 403 };
  if (!c.teamId) return { error: 'Nejsi v žádném podniku.', status: 400 };
  if (!jeEntitaKopie(entitaRaw)) return { error: 'Kopírovat jdou návody, postupy nebo menu.', status: 400 };
  const z = Number(zRaw);
  if (!Number.isInteger(z) || z <= 0 || z > MAX_ID) return { error: 'Chybí zdrojový podnik.', status: 400 };
  if (z === c.teamId) return { error: 'Kopíruje se z jiného podniku.', status: 400 };
  const org = await organizaceTymu(c.teamId);
  if (!org) return { error: 'Podnik není v organizaci.', status: 404 };

  // Role z tokenu je jen první síto; o vedení v cíli i ve zdroji rozhoduje
  // členství v databázi — token může nést roli z podniku, kde člověk byl
  // před chvílí.
  const clenstvi = await clenstviUzivatele(c.meId);
  if (clenstvi.find(m => m.teamId === c.teamId)?.role !== 'employer') {
    return { error: 'Nedostatečná oprávnění', status: 403 };
  }
  if (!podnikyProPrehled(clenstvi, org.id).includes(z)) {
    return { error: 'Kopírovat jde jen z podniku organizace, ve kterém jsi ve vedení.', status: 403 };
  }

  const tymy = await sql`SELECT id, name, blocked_at FROM teams WHERE id IN (${z}, ${c.teamId})` as any[];
  const zdrojovy = tymy.find(t => Number(t.id) === z);
  // Pozastavený podnik je zamčený i pro své vedení (423 na každém API) —
  // kopie by byla boční dveře k jeho obsahu.
  if (zdrojovy?.blocked_at) return { error: 'Podnik je pozastavený správcem platformy.', status: 423 };
  const cilovy = tymy.find(t => Number(t.id) === c.teamId);
  return {
    meId: c.meId, teamId: c.teamId, z, entita: entitaRaw,
    nazevZdroje: String(zdrojovy?.name ?? ''), nazevCile: String(cilovy?.name ?? ''),
  };
}

const jeChyba = (v: Zdroj | Chyba): v is Chyba => 'error' in v;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const v = await zdroj(searchParams.get('entita'), searchParams.get('z'));
  if (jeChyba(v)) return NextResponse.json({ error: v.error }, { status: v.status });
  try {
    const { polozky, celkem } = await seznamKeKopii(v.entita, v.z);
    return NextResponse.json({ podnik: { id: v.z, name: v.nazevZdroje }, polozky, celkem });
  } catch (e) {
    console.error('[kopie] seznam selhal:', e);
    return NextResponse.json({ error: 'Seznam se nepodařilo načíst. Zkus to znovu.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const b = await request.json().catch(() => ({}));
  // Délka surového pole dřív, než se cokoli mapuje — milion čísel v těle
  // se odmítne hned, ne až po deduplikaci.
  if (Array.isArray(b?.ids) && b.ids.length > MAX_IDS_KOPIE * 4) {
    return NextResponse.json({ error: `Najednou jde zkopírovat nejvíc ${MAX_IDS_KOPIE} položek.` }, { status: 400 });
  }
  const v = await zdroj(b?.entita, b?.z);
  if (jeChyba(v)) return NextResponse.json({ error: v.error }, { status: v.status });
  // Id bez duplikátů (dvakrát vybraná položka by vznikla dvakrát) a v rozsahu
  // sloupce INTEGER — jedno id mimo rozsah by jinak shodilo celou dávku.
  const ids = Array.isArray(b?.ids)
    ? [...new Set((b.ids as unknown[]).map(Number).filter(n => Number.isInteger(n) && n > 0 && n <= MAX_ID))]
    : [];
  if (!ids.length) return NextResponse.json({ error: 'Vyber, co zkopírovat.' }, { status: 400 });
  if (ids.length > MAX_IDS_KOPIE) return NextResponse.json({ error: `Najednou jde zkopírovat nejvíc ${MAX_IDS_KOPIE} položek.` }, { status: 400 });

  let vysledky;
  try {
    vysledky = await zkopirujDoPodniku({
      entita: v.entita, z: v.z, nazevZdroje: v.nazevZdroje, nazevCile: v.nazevCile, teamId: v.teamId, meId: v.meId, ids,
    });
  } catch (e) {
    // Spadlo ještě před kopírováním (čtení zdroje) — nic nevzniklo.
    console.error('[kopie] kopie selhala:', e);
    return NextResponse.json({ ok: false, error: 'Kopie se nepovedla. Zkus to znovu.', vysledky: [] }, { status: 500 });
  }
  // Kopie proběhla, i když žádná položka neprošla: důvod je u každé zvlášť
  // (smazaná ve zdroji, stažená na návrh…) a okno ho má ukázat. Pětistovka
  // by klienta poslala do obecné hlášky „Server právě nestíhá." a vedení by
  // zkoušelo znovu něco, co znovu neprojde.
  const ok = vysledky.some(r => r.noveId != null);
  return NextResponse.json({ ok, vysledky });
}
