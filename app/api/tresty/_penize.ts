// Peníze v trestech (kolo 96): příprava a uložení peněžní části trestu pro POST /api/tresty (i hromadně)
// a PATCH /api/tresty/[id]. Pravidla: lib/trestyPenize.ts, databáze: lib/trestyPenizeDb.ts, kontrakt:
// docs/TRESTY-PENIZE.md. Krácení samo (bonusCut a jeho strop) hlídají routy jako dřív.
import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { notifyUser, notifyUsers } from '@/lib/push';
import { clenoveSOpravnenim } from '@/lib/opravneniDb';
import { clenovePodniku } from '@/lib/tenant';
import { audit } from '@/lib/audit';
import type { TypSmlouvy } from '@/lib/dochazkaPrehled';
import {
  VETA_BEZ_PRAV_PENIZE, castkyDavky, oznameniNesouhlasuSrazky, oznameniSouhlasuSrazky, oznameniSrazkyKSouhlasu, oznameniZaskoku, rozdelZaskok,
  stropNahrady, validujNahradu, validujSrazku, validujZaskok, type DruhSrazky, type KomuZaskok, type VstupNahrady, type VstupSrazky, type VstupZaskoku, type ZpusobZaskoku,
} from '@/lib/trestyPenize';
import {
  osadkaSmeny, prepocitejPenizeTrestu, prumerVydelkuDb, smlouvaClena, zakladZaskoku, zalozPrevody, zalozSrazku, type NovaSrazka,
} from '@/lib/trestyPenizeDb';

const sql = neon(process.env.DATABASE_URL!);
const chyba = (text: string, status: number, navic?: Record<string, unknown>) => NextResponse.json({ error: text, ...navic }, { status });

/** Peněžní část jednoho člověka, připravená k uložení. */
export interface PenizeOsoby {
  userId: number;
  srazky: NovaSrazka[];
  smlouva: TypSmlouvy | null;
  /** Záskok: null = beze změny (PATCH bez `zaskok`). */
  zaskok: { komu: KomuZaskok; zpusob: ZpusobZaskoku | null; prijemci: { userId: number; castka: number | null }[] } | null;
}

export interface VstupPenez { srazka: VstupSrazky | null; nahrada: VstupNahrady | null; zaskok: VstupZaskoku | null; rozpocitat: boolean }

/** Přečte peněžní pole těla (srazka, nahrada, zaskok, rozpocitat). Chyba = 400 s větou. */
export function ctiPenize(b: Record<string, unknown>, dnes: string): { ok: true; v: VstupPenez } | { ok: false; res: NextResponse } {
  const s = validujSrazku(b.srazka);
  if (!s.ok) return { ok: false, res: chyba(s.chyba, 400) };
  const n = validujNahradu(b.nahrada, dnes);
  if (!n.ok) return { ok: false, res: chyba(n.chyba, 400) };
  let zaskok: VstupZaskoku | null = null;
  if (b.zaskok !== undefined) {
    const z = validujZaskok(b.zaskok);
    if (!z.ok) return { ok: false, res: chyba(z.chyba, 400) };
    zaskok = z.zaskok;
  }
  return { ok: true, v: { srazka: s.srazka, nahrada: n.nahrada, zaskok, rozpocitat: b.rozpocitat === true } };
}

/** Chce tělo něco s penězi (mimo krácení, to hlídá routa)? */
export const chcePenize = (v: VstupPenez): boolean => !!(v.srazka || v.nahrada || (v.zaskok && v.zaskok.komu !== 'podnik'));

/** 403, když peníze chce někdo bez finance.mzdy. */
export const bezPrav = () => chyba(VETA_BEZ_PRAV_PENIZE, 403);

/**
 * Připraví peníze pro lidi dávky: částky (každý / rozpočítat), strop náhrady škody (4,5× průměru
 * u nedbalosti — bez dat jen varování), smlouva (stav srážky), příjemci záskoku (členové podniku,
 * osádka směny bez potrestaných). Nic neukládá; chyba = odpověď.
 */
export async function pripravPenize(o: {
  teamId: number; ids: readonly number[]; v: VstupPenez; text: string; day: string; closingId: number | null; dnes: string; money: (n: number) => string;
}): Promise<{ ok: true; lide: PenizeOsoby[] } | { ok: false; res: NextResponse }> {
  const n = o.ids.length;
  const srazky = o.v.srazka ? castkyDavky(o.v.srazka.castka, n, o.v.rozpocitat) : [];
  const nahrady = o.v.nahrada ? castkyDavky(o.v.nahrada.castka, n, o.v.rozpocitat) : [];
  if (srazky.some(c => c <= 0) || nahrady.some(c => c <= 0)) return { ok: false, res: chyba('Po rozpočítání by někomu vyšlo 0 — zvyš částku.', 400) };

  // Příjemci záskoku.
  let prijemci: { userId: number; castka: number | null }[] = [];
  const z = o.v.zaskok;
  if (z && z.komu !== 'podnik') {
    const clenove = new Set((await clenovePodniku(o.teamId)).map(x => x.id));
    if (z.komu === 'lide') {
      const cizi = z.lide.find(l => !clenove.has(l.userId));
      if (cizi) return { ok: false, res: chyba('Kolega, kterému má částka přejít, není v podniku.', 404) };
      prijemci = z.lide;
    } else {
      const os = await osadkaSmeny(o.teamId, o.day, o.closingId);
      prijemci = [...new Set([...os.smena, ...os.uzaverka])].filter(id => clenove.has(id) && !o.ids.includes(id)).map(userId => ({ userId, castka: null }));
      if (!prijemci.length) return { ok: false, res: chyba('Na směně ten den nikdo další nebyl — vyber lidi, nebo nech částku podniku.', 409) };
    }
  }

  const lide: PenizeOsoby[] = [];
  for (let i = 0; i < n; i++) {
    const userId = o.ids[i];
    const smlouva = await smlouvaClena(o.teamId, userId);
    const sr: NovaSrazka[] = [];
    if (o.v.nahrada) {
      const nh = o.v.nahrada;
      const castka = nahrady[i];
      const pr = nh.druh === 'zavinena' && nh.zavineni === 'nedbalost' ? await prumerVydelkuDb(o.teamId, userId, o.dnes) : { prumer: null, mesicu: 0 };
      const st = stropNahrady({ druh: nh.druh, zavineni: nh.zavineni, skoda: nh.skoda, prumer: pr.prumer });
      if (st.tvrdy && castka > st.strop) {
        return { ok: false, res: chyba(st.stropPrumeru != null && st.strop < nh.skoda
          ? `Náhrada jde nejvýš ${o.money(st.strop)} — 4,5násobek průměrného výdělku (${o.money(pr.prumer ?? 0)}).`
          : 'Náhrada nemůže být vyšší než škoda.', 409, { strop: st.strop, userId }) };
      }
      sr.push({ druh: 'nahrada', castka, splatky: nh.splatky, duvod: o.text, skoda: {
        castka: nh.skoda, druh: nh.druh, zavineni: nh.zavineni, dohoda: nh.dohoda, dohodaDatum: nh.dohodaDatum, prumer: pr.prumer, strop: st.strop, varovani: st.varovani,
      } });
    }
    if (o.v.srazka) sr.push({ druh: 'srazka', castka: srazky[i], splatky: o.v.srazka.splatky, duvod: o.text });
    lide.push({ userId, srazky: sr, smlouva, zaskok: z ? { komu: z.komu, zpusob: z.komu === 'podnik' ? null : z.zpusob, prijemci } : null });
  }
  return { ok: true, lide };
}

/**
 * Uloží peníze jednoho trestu: srážky (stav podle smlouvy), záskok (nahradí dosavadní převody),
 * přepočet úprav mzdy a oznámení (srážka k souhlasu zaměstnanci, záskok příjemcům).
 */
export async function ulozPenize(o: { teamId: number; trestId: number; day: string; text: string; p: PenizeOsoby; kdo: number; dnes: string; money: (n: number) => string; jmeno: string }): Promise<void> {
  const nove: { id: number; stav: string; druh: DruhSrazky; castka: number }[] = [];
  for (const s of o.p.srazky) {
    const r = await zalozSrazku({ teamId: o.teamId, userId: o.p.userId, trestId: o.trestId, day: o.day, smlouva: o.p.smlouva, s, kdo: o.kdo, dnes: o.dnes });
    nove.push({ ...r, druh: s.druh, castka: s.castka });
    audit(o.teamId, o.kdo, 'tresty.srazka', 'penalty', o.trestId, `${o.jmeno}: ${s.druh === 'nahrada' ? 'náhrada škody' : 'srážka'} ${o.money(s.castka)}${s.splatky > 1 ? ` / ${s.splatky} výplat` : ''} · ${r.stav === 'ceka' ? 'čeká na souhlas' : 'uplatněno'}`);
  }
  let podily: { userId: number; castka: number }[] = [];
  if (o.p.zaskok) {
    await sql`UPDATE penalty_transfers SET status = 'zruseno' WHERE team_id = ${o.teamId} AND penalty_id = ${o.trestId} AND status = 'plati'`;
    await sql`UPDATE penalties SET zaskok_komu = ${o.p.zaskok.komu}, zaskok_zpusob = ${o.p.zaskok.zpusob} WHERE id = ${o.trestId} AND team_id = ${o.teamId}`;
    if (o.p.zaskok.komu !== 'podnik') {
      const zaklad = await zakladZaskoku(o.teamId, o.trestId);
      const r = rozdelZaskok({ zaklad, zpusob: o.p.zaskok.zpusob ?? 'rovne', prijemci: o.p.zaskok.prijemci, krome: [o.p.userId] });
      if (r.ok && r.podily.length) {
        podily = r.podily;
        await zalozPrevody({ teamId: o.teamId, trestId: o.trestId, podily, zaklad, kdo: o.kdo });
        audit(o.teamId, o.kdo, 'tresty.zaskok', 'penalty', o.trestId, `${o.jmeno}: záskok ${podily.map(x => o.money(x.castka)).join(' + ')}${r.podniku ? ` · podniku ${o.money(r.podniku)}` : ''}`);
      }
    }
  }
  await prepocitejPenizeTrestu(o.teamId, o.trestId, o.kdo);
  try {
    for (const s of nove) {
      if (s.stav !== 'ceka' || o.p.userId === o.kdo) continue;
      const z = oznameniSrazkyKSouhlasu({ castka: s.castka, druh: s.druh, text: o.text }, o.money);
      await notifyUser(o.p.userId, { title: z.title, body: z.body, link: ODKAZ_ZAMESTNANEC, type: 'tresty', category: 'general' });
    }
    for (const p of podily) {
      if (p.userId === o.kdo) continue;
      const z = oznameniZaskoku(p.castka, o.text, o.money);
      await notifyUser(p.userId, { title: z.title, body: z.body, link: '/employee/shifts', type: 'tresty', category: 'general' });
    }
  } catch (e) {
    console.error('tresty: oznámení o penězích', e);
  }
}

export const ODKAZ_ZAMESTNANEC = '/employee/shifts?view=rewards&arg=tresty';
const ODKAZ_VEDENI = '/employer/overview?view=rewards&arg=tresty';

/** Zaměstnanec nesouhlasí se srážkou: oznámit tomu, kdo ji zapsal, a všem s finance.mzdy. */
export async function oznamNesouhlas(teamId: number, o: { userId: number; jmeno: string; castka: number; duvod: string | null; kdoZapsal: number | null }, money: (n: number) => string): Promise<void> {
  try {
    const ids = new Set((await clenoveSOpravnenim(teamId, 'finance.mzdy')).filter(id => id !== o.userId));
    if (o.kdoZapsal && o.kdoZapsal !== o.userId) ids.add(o.kdoZapsal);
    if (!ids.size) return;
    const z = oznameniNesouhlasuSrazky(o.jmeno, { castka: o.castka, duvod: o.duvod }, money);
    await notifyUsers([...ids], { title: z.title, body: z.body, link: ODKAZ_VEDENI, type: 'tresty', category: 'general' });
  } catch (e) {
    console.error('tresty: oznámení o nesouhlasu se srážkou', e);
  }
}

/** Zaměstnanec souhlasí: oznámit tomu, kdo srážku zapsal. */
export async function oznamSouhlas(o: { userId: number; jmeno: string; castka: number; kdoZapsal: number | null }, money: (n: number) => string): Promise<void> {
  if (!o.kdoZapsal || o.kdoZapsal === o.userId) return;
  try {
    const z = oznameniSouhlasuSrazky(o.jmeno, o.castka, money);
    await notifyUser(o.kdoZapsal, { title: z.title, body: z.body, link: ODKAZ_VEDENI, type: 'tresty', category: 'general' });
  } catch (e) {
    console.error('tresty: oznámení o souhlasu se srážkou', e);
  }
}
