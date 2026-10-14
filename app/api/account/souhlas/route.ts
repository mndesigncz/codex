import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { HLASKA_BEZ_SOUHLASU, VERZE_PODMINEK, VERZE_ZASAD, potrebujeSouhlas, souhlasZTela } from '@/lib/pravni/verze';
import { nactiSouhlas, zapisSouhlas } from '@/lib/pravni/souhlasDb';

export const dynamic = 'force-dynamic';

// Souhlas s aktuální verzí podmínek a zásad (spuštění, balík P) — pro bránu
// components/pravni/NovaVerze.tsx. Osobní věc účtu: jen přihlášení, žádné oprávnění.
//
// GET  → { potreba, verzePodminek, verzeZasad, odsouhlaseno: { podminky, zasady, kdy } }
//        `potreba` = přihlášený (mimo sdílený tablet) nemá odsouhlasené dnešní verze.
//        Před migrací sloupců se brána neukazuje (potreba false) — nejde to uložit.
// POST { terms: true } → uloží dnešní verze a čas; bez výslovného `true` 400.

async function kdo(): Promise<number | null> {
  const s = await getServerSession(authOptions);
  const id = Number((s?.user as { id?: unknown } | undefined)?.id);
  return s?.user && Number.isFinite(id) ? id : null;
}

export async function GET() {
  const id = await kdo();
  if (id == null) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const r = await nactiSouhlas(id);
  return NextResponse.json({
    potreba: r ? potrebujeSouhlas(r.role, r) : false,
    verzePodminek: VERZE_PODMINEK,
    verzeZasad: VERZE_ZASAD,
    odsouhlaseno: r ? { podminky: r.terms_version, zasady: r.privacy_version, kdy: r.terms_accepted_at } : null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const id = await kdo();
  if (id == null) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!souhlasZTela(b)) return NextResponse.json({ error: HLASKA_BEZ_SOUHLASU }, { status: 400 });
  if (!(await zapisSouhlas(id))) return NextResponse.json({ error: 'Souhlas se teď nepodařilo uložit. Zkus to za chvíli znovu.' }, { status: 503 });
  return NextResponse.json({ ok: true, verzePodminek: VERZE_PODMINEK, verzeZasad: VERZE_ZASAD });
}
