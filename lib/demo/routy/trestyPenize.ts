// Ukázka: peníze v trestech a výplatě (kolo 96, docs/TRESTY-PENIZE.md). Stav v paměti stránky.
//
//  - srážka čekající na souhlas (Eliška — zaměstnanec ukázky ji odsouhlasí nebo odmítne),
//    krácení se záskokem pro kolegu, hromadný trest (userIds) a peníze u něj;
//  - /api/tresty/vyber, /api/tresty/srazky, /api/tresty/srazky/[id], /api/payroll/slozka,
//    /api/wage-adjustments/davka;
//  - úpravy mzdy z peněz trestů a odměn (upravyDema) posílá ukázková docházka, nenárokovou složku
//    a čekající srážky (penizeClenaDema) ukázková výplatní listina.
// Trest samotný (GET/POST/PATCH /api/tresty) obsluhuje routy/tresty.ts a sem jen volá.

import { ok, chyba, type Obsluha } from '../typy';
import { KDO_JSEM, LIDE, clen } from '../data/lide';
import { NAZEV } from '../data/klient';
import { dnes } from '../cas';
import { mojeRole } from './zaklad';
import type { Trest } from '@/lib/tresty';
import type { UpravaMzdy } from '@/lib/dochazkaPrehled';
import { formatMoney } from '@/lib/money';
import {
  castkyDavky, normalizujSlozku, odKdySrazka, rozdelZaskok, rozvrhSplatek, validujNahradu, validujOdmenu, validujSrazku, validujZaskok, vetaSouhlasu,
  zneniDohodyOSrazce, VETA_BEZ_PRAV_PENIZE,
  type DruhSrazky, type KomuZaskok, type NastaveniSlozky, type PenizeTrestu, type StavSrazky, type VstupZaskoku, type ZpusobZaskoku,
} from '@/lib/trestyPenize';

const kc = (n: number) => formatMoney(n);
const jmeno = (id: number) => clen(id)?.name ?? 'Někdo';
const avatar = (id: number) => clen(id)?.avatar ?? null;

interface SrazkaDemo {
  id: number; trestId: number; userId: number; druh: DruhSrazky; castka: number; splatky: number; stav: StavSrazky; smlouva: string | null;
  duvod: string; day: string; odDne: string | null; zneni: string | null; souhlasAt: string | null; nesouhlasAt: string | null; nesouhlasDuvod: string | null; skoda: number | null;
}
interface PrevodDemo { id: number; trestId: number; userId: number; castka: number; stav: 'plati' | 'zruseno' }

/** Smlouvy jako ukázková výplatní listina: Jakub (4) DPP, vedení bez typu, ostatní HPP. */
const smlouva = (id: number): string | null => (id === 4 ? 'DPP' : clen(id)?.role === 'employer' ? null : 'HPP');

let dalsi = 500;
const SRAZKY: SrazkaDemo[] = [];
const PREVODY: PrevodDemo[] = [];
const ZASKOK = new Map<number, { komu: KomuZaskok; zpusob: ZpusobZaskoku | null }>();
const SLOZKY = new Map<number, NastaveniSlozky>([[3, { typ: 'kc_hod', hodnota: 20, vSazbe: true }], [4, { typ: 'pct', hodnota: 10, vSazbe: false }]]);
const ODMENY: UpravaMzdy[] = [];
let tresty: () => readonly Trest[] = () => [];

/** routy/tresty.ts předá své tresty a výchozí peníze ukázky. */
export function napojTrestyDema(f: () => readonly Trest[], seed: { srazka: { trestId: number; userId: number; castka: number; splatky: number; skoda: number; day: string; duvod: string }; zaskok: { trestId: number; userId: number; castka: number } }): void {
  tresty = f;
  if (SRAZKY.length || PREVODY.length) return;
  const s = seed.srazka;
  SRAZKY.push({ id: ++dalsi, trestId: s.trestId, userId: s.userId, druh: 'nahrada', castka: s.castka, splatky: s.splatky, stav: 'ceka', smlouva: smlouva(s.userId),
    duvod: s.duvod, day: s.day, odDne: null, zneni: null, souhlasAt: null, nesouhlasAt: null, nesouhlasDuvod: null, skoda: s.skoda });
  PREVODY.push({ id: ++dalsi, trestId: seed.zaskok.trestId, userId: seed.zaskok.userId, castka: seed.zaskok.castka, stav: 'plati' });
  ZASKOK.set(seed.zaskok.trestId, { komu: 'lide', zpusob: 'rovne' });
}

const zneniDema = (x: SrazkaDemo) => zneniDohodyOSrazce({
  castka: x.castka, splatky: x.splatky, duvod: x.duvod, podnik: NAZEV, odMesice: odKdySrazka({ denTrestu: x.day, denSouhlasu: dnes(), zamky: [] }).slice(0, 7), druh: x.druh,
}, kc);

/** Peníze trestu ve tvaru GET /api/tresty → item.penize. */
export function penizeTrestuDema(t: Trest, vedeni: boolean): PenizeTrestu | null {
  const sr = SRAZKY.filter(x => x.trestId === t.id);
  const pr = PREVODY.filter(x => x.trestId === t.id);
  if (!sr.length && !pr.length && !t.bonusCut) return null;
  const plati = t.status === 'plati';
  const zaklad = t.bonusCut + sr.filter(x => x.stav === 'ceka' || x.stav === 'uplatneno').reduce((a, x) => a + x.castka, 0);
  const strzeno = plati ? t.bonusCut + sr.filter(x => x.stav === 'uplatneno').reduce((a, x) => a + x.castka, 0) : 0;
  return {
    kraceni: t.bonusCut,
    srazky: sr.map(x => ({
      id: x.id, druh: x.druh, castka: x.castka, splatky: x.splatky, stav: x.stav, potrebujeSouhlas: x.smlouva !== 'OSVC', smlouva: x.smlouva, proc: vetaSouhlasu(x.smlouva),
      zneni: x.stav === 'ceka' ? zneniDema(x) : x.zneni, souhlasAt: x.souhlasAt, nesouhlasAt: x.nesouhlasAt, nesouhlasDuvod: x.nesouhlasDuvod, odDne: x.odDne,
      rozvrh: x.stav === 'uplatneno' && x.odDne ? rozvrhSplatek(x.castka, x.splatky, x.odDne) : [],
      skoda: x.skoda ? { castka: x.skoda, druh: 'zavinena', zavineni: 'nedbalost', dohoda: false, dohodaDatum: null, prumer: 24000, strop: Math.min(x.skoda, 108000), varovani: null } : null,
      zrusenoAt: null,
    })),
    zaskok: {
      ...(ZASKOK.get(t.id) ?? { komu: 'podnik' as KomuZaskok, zpusob: null }),
      prevody: pr.map(x => ({
        id: x.id, userId: vedeni ? x.userId : null, userName: vedeni ? jmeno(x.userId) : null, castka: x.castka,
        preslo: x.stav === 'plati' && plati && zaklad > 0 ? Math.round((x.castka * strzeno) / zaklad) : 0, stav: x.stav,
      })),
    },
    cekaNaSouhlas: plati ? sr.filter(x => x.stav === 'ceka').reduce((a, x) => a + x.castka, 0) : 0,
    strzeno,
  };
}

/** Peněžní pole těla POST /api/tresty: chyba (věta), nebo plán pro `pridejPenizeDema`. */
export function ctiPenizeDema(b: Record<string, unknown>, d: string): { ok: true; srazka: { castka: number; splatky: number } | null; nahrada: { castka: number; splatky: number; skoda: number } | null; zaskok: VstupZaskoku | null; chce: boolean } | { ok: false; chyba: string } {
  const sr = validujSrazku(b.srazka);
  if (!sr.ok) return { ok: false, chyba: sr.chyba };
  const nh = validujNahradu(b.nahrada, d);
  if (!nh.ok) return { ok: false, chyba: nh.chyba };
  const zs = b.zaskok === undefined ? null : validujZaskok(b.zaskok);
  if (zs && !zs.ok) return { ok: false, chyba: zs.chyba };
  const zaskok = zs && zs.ok ? zs.zaskok : null;
  return {
    ok: true, srazka: sr.srazka, nahrada: nh.nahrada ? { castka: nh.nahrada.castka, splatky: nh.nahrada.splatky, skoda: nh.nahrada.skoda } : null, zaskok,
    chce: !!(sr.srazka || nh.nahrada || (zaskok && zaskok.komu !== 'podnik')),
  };
}

/** Peníze jednoho trestu dávky (i-tý člověk z n; rozpočítat = částky celkem za dávku). */
export function pridejPenizeDema(t: Trest, v: Extract<ReturnType<typeof ctiPenizeDema>, { ok: true }>, o: { i: number; n: number; rozpocitat: boolean; ids: readonly number[] }): string | null {
  const srazka = v.srazka ? castkyDavky(v.srazka.castka, o.n, o.rozpocitat)[o.i] : 0;
  const nahrada = v.nahrada ? castkyDavky(v.nahrada.castka, o.n, o.rozpocitat)[o.i] : 0;
  const pridej = (druh: DruhSrazky, castka: number, splatky: number, skoda: number | null) => {
    const sm = smlouva(t.userId);
    const hned = sm === 'OSVC';
    SRAZKY.push({ id: ++dalsi, trestId: t.id, userId: t.userId, druh, castka, splatky, stav: hned ? 'uplatneno' : 'ceka', smlouva: sm, duvod: t.text, day: t.day,
      odDne: hned ? t.day : null, zneni: null, souhlasAt: null, nesouhlasAt: null, nesouhlasDuvod: null, skoda });
  };
  if (v.nahrada && nahrada > 0) pridej('nahrada', nahrada, v.nahrada.splatky, v.nahrada.skoda);
  if (v.srazka && srazka > 0) pridej('srazka', srazka, v.srazka.splatky, null);
  if (v.zaskok) {
    ZASKOK.set(t.id, { komu: v.zaskok.komu, zpusob: v.zaskok.komu === 'podnik' ? null : v.zaskok.zpusob });
    if (v.zaskok.komu !== 'podnik') {
      const prijemci = v.zaskok.komu === 'smena'
        ? LIDE.filter(x => x.role === 'employee' && !o.ids.includes(x.id)).slice(0, 3).map(x => ({ userId: x.id, castka: null }))
        : v.zaskok.lide;
      const r = rozdelZaskok({ zaklad: t.bonusCut + srazka + nahrada, zpusob: v.zaskok.zpusob, prijemci, krome: [t.userId] });
      if (!r.ok) return r.chyba;
      for (const p of r.podily) PREVODY.push({ id: ++dalsi, trestId: t.id, userId: p.userId, castka: p.castka, stav: 'plati' });
    }
  }
  return null;
}

/** Zrušený trest zruší i srážky a záskok. */
export function zrusPenizeDema(trestId: number): void {
  for (const x of SRAZKY) if (x.trestId === trestId && x.stav !== 'zruseno') x.stav = 'zruseno';
  for (const x of PREVODY) if (x.trestId === trestId) x.stav = 'zruseno';
}

/** Úpravy mzdy z peněz trestů a hromadných odměn pro ukázkovou docházku (attendance → adjustments). */
export function upravyDema(): UpravaMzdy[] {
  const out: UpravaMzdy[] = [...ODMENY];
  let id = 90_000;
  for (const t of tresty()) {
    if (t.status !== 'plati') continue;
    if (t.bonusCut) out.push({ id: ++id, userId: t.userId, day: t.day, amount: -t.bonusCut, note: `Trest: ${t.text}`, source: 'trest' });
    for (const x of SRAZKY.filter(s => s.trestId === t.id && s.stav === 'uplatneno' && s.odDne)) {
      for (const k of rozvrhSplatek(x.castka, x.splatky, x.odDne!)) {
        out.push({ id: ++id, userId: x.userId, day: k.den, amount: -k.castka, note: `${x.druh === 'nahrada' ? 'Náhrada škody' : 'Srážka'}: ${x.duvod}`, source: x.druh });
      }
    }
    for (const v of penizeTrestuDema(t, true)?.zaskok.prevody ?? []) {
      if (v.preslo && v.userId) out.push({ id: ++id, userId: v.userId, day: t.day, amount: v.preslo, note: `Záskok: ${t.text}`, source: 'zaskok' });
    }
  }
  return out;
}

/** Nenároková složka a čekající srážky člověka pro ukázkovou výplatní listinu. */
export function penizeClenaDema(id: number): { slozka: NastaveniSlozky | null; cekaNaSouhlas: number } {
  const plati = new Set(tresty().filter(t => t.status === 'plati').map(t => t.id));
  return { slozka: SLOZKY.get(id) ?? null, cekaNaSouhlas: SRAZKY.filter(x => x.userId === id && x.stav === 'ceka' && plati.has(x.trestId)).reduce((a, x) => a + x.castka, 0) };
}

/** Vlastní srážky pro Můj výdělek (payroll ?ja=1 → ja.srazky). */
export function mojeSrazkyDema(id: number) {
  return SRAZKY.filter(x => x.userId === id).map(x => ({ id: x.id, penaltyId: x.trestId, druh: x.druh, castka: x.castka, splatky: x.splatky, stav: x.stav, text: x.duvod, day: x.day }));
}

const CESTY = new Set(['/api/tresty/vyber', '/api/tresty/srazky', '/api/payroll/slozka', '/api/wage-adjustments/davka']);

export const trestyPenize: Obsluha = (p, k) => {
  const { cesta, metoda } = p;
  const srazkaId = cesta.match(/^\/api\/tresty\/srazky\/(\d+)$/);
  if (!CESTY.has(cesta) && !srazkaId) return undefined;
  const s = k.stav;
  const opr = new Set(mojeRole(s).opravneni);
  const ja = KDO_JSEM[s.role];
  const penize = opr.has('finance.mzdy');
  const d = dnes();
  const bez = () => chyba('Na tohle nemáš v tomto podniku oprávnění.', 403);

  if (cesta === '/api/tresty/vyber' && metoda === 'GET') {
    if (!opr.has('tresty.udelit') && !penize) return bez();
    const lide = LIDE.filter(x => x.role !== 'kiosk');
    return ok({
      day: p.q.get('day') || d, lide: lide.map(x => ({ id: x.id, name: x.name, avatar: x.avatar, role: x.role, jobTitle: x.jobTitle })),
      smena: lide.filter(x => x.role === 'employee').slice(0, 3).map(x => x.id), uzaverka: p.q.get('closingId') ? [2, 3] : [],
    });
  }

  if (cesta === '/api/tresty/srazky' && metoda === 'GET') {
    const tym = p.q.get('scope') === 'team';
    if (tym && !penize) return bez();
    const stav = p.q.get('stav');
    const plati = new Set(tresty().filter(t => t.status === 'plati').map(t => t.id));
    return ok({
      items: SRAZKY.filter(x => (tym || x.userId === ja) && (!stav || x.stav === stav)).map(x => ({
        id: x.id, penaltyId: x.trestId, userId: x.userId, userName: jmeno(x.userId), userAvatar: avatar(x.userId), druh: x.druh, castka: x.castka, splatky: x.splatky,
        stav: x.stav, day: x.day, text: x.duvod, trestPlati: plati.has(x.trestId), nesouhlasDuvod: x.nesouhlasDuvod, nesouhlasAt: x.nesouhlasAt, souhlasAt: x.souhlasAt,
        createdAt: `${x.day}T18:00:00.000Z`,
      })),
    });
  }

  if (srazkaId && metoda === 'PATCH') {
    const x = SRAZKY.find(y => y.id === Number(srazkaId[1]));
    if (!x) return chyba('Srážka nenalezena.', 404);
    const b = p.telo ?? {};
    const muj = x.userId === ja;
    if (!muj && !penize) return chyba('Srážka nenalezena.', 404);
    const vysledek = () => ok({ ok: true, srazka: { id: x.id, stav: x.stav, castka: x.castka, ...(x.stav === 'uplatneno' ? { odDne: x.odDne, zneni: x.zneni } : {}) } });
    if (b.souhlas === true || b.nesouhlas === true) {
      if (!muj) return chyba('Souhlasit se srážkou může jen ten, koho se týká.', 403);
      if (x.stav !== 'ceka') return chyba('Srážka už nečeká na souhlas.', 409, { stav: x.stav });
      const zneni = zneniDema(x);
      if (b.souhlas === true) {
        if (typeof b.zneni !== 'string' || b.zneni.trim() !== zneni) return chyba('Znění dohody se mezitím změnilo — přečti si ho znovu.', 409, { zneni });
        Object.assign(x, { stav: 'uplatneno', odDne: odKdySrazka({ denTrestu: x.day, denSouhlasu: d, zamky: [] }), zneni, souhlasAt: new Date().toISOString() });
        return vysledek();
      }
      Object.assign(x, { stav: 'nesouhlas', nesouhlasAt: new Date().toISOString(), nesouhlasDuvod: typeof b.duvod === 'string' && b.duvod.trim() ? b.duvod.trim().slice(0, 300) : null });
      return vysledek();
    }
    if (!penize) return chyba(VETA_BEZ_PRAV_PENIZE, 403);
    if (b.status === 'zruseno') {
      if (x.stav === 'zruseno') return chyba('Srážka už je zrušená.', 409);
      x.stav = 'zruseno';
      return vysledek();
    }
    if (b.znovu === true) {
      if (x.stav !== 'nesouhlas') return chyba('Znovu požádat jde jen po nesouhlasu.', 409);
      Object.assign(x, { stav: 'ceka', nesouhlasAt: null });
      return vysledek();
    }
    if (b.castka !== undefined) {
      const nova = Number(b.castka);
      if (!Number.isInteger(nova) || nova <= 0) return chyba('Srážka musí být celé kladné číslo (nejvýš 200 000).');
      if (nova > x.castka) return chyba('Zvýšit srážku nejde — přidej novou (zaměstnanec ji musí odsouhlasit).', 409);
      x.castka = nova;
      return vysledek();
    }
    return chyba('Nevím, co se srážkou udělat.');
  }

  if (cesta === '/api/payroll/slozka') {
    if (metoda === 'GET') {
      if (!penize) return bez();
      const id = Number(p.q.get('userId'));
      return ok({ userId: id, slozka: SLOZKY.get(id) ?? null });
    }
    if (!opr.has('finance.sazby_upravit')) return bez();
    const b = p.telo ?? {};
    const id = Number(b.userId);
    if (!LIDE.some(x => x.id === id)) return chyba('Člověk není v podniku.', 404);
    const v = normalizujSlozku(b);
    if (!v.ok) return chyba(v.chyba);
    if (v.slozka) SLOZKY.set(id, v.slozka); else SLOZKY.delete(id);
    return ok({ ok: true, userId: id, slozka: v.slozka });
  }

  if (cesta === '/api/wage-adjustments/davka') {
    if (!penize) return bez();
    if (metoda === 'POST') {
      const v = validujOdmenu(p.telo ?? {}, d);
      if (!v.ok) return chyba(v.chyba);
      const batchId = ++dalsi;
      const items = v.odmena.ids.map((userId, i) => ({ id: ++dalsi, userId, day: v.odmena.den, amount: v.odmena.castky[i] }));
      for (const it of items) ODMENY.push({ ...it, note: v.odmena.text, source: v.odmena.nenarokova ? 'premie' : 'manual' });
      return ok({ ok: true, batchId, items }, 201);
    }
    if (metoda === 'DELETE') {
      const batchId = Number(p.q.get('batchId'));
      if (!Number.isFinite(batchId)) return chyba('Chybí dávka.');
      return ok({ ok: true, opravy: 0 });
    }
  }
  return undefined;
};
