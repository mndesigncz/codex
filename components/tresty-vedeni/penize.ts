// Peníze v okně „Dát trest" (kolo 96, sada V) — čistá logika bez Reactu a bez DB.
//
// Co tu je: stav peněžní části formuláře (krácení nenárokové části / náhrada škody / srážka
// z výplaty, „každý X" nebo „rozpočítat X", komu přejde stržená částka), tělo POST /api/tresty
// z něj, souhrn před uložením („Jana: −300 Kč z prémie · Petr dostane +300 Kč"), rychlé volby
// hromadného výběru (celá směna dne, všichni na uzávěrce, filtr role) a stav srážky do věty.
// Pravidla a výpočty jsou v lib/trestyPenize.ts (jádro) — tady se jen skládají pro UI. Kontrakt:
// docs/TRESTY-PENIZE.md. Testy: scripts/testy/k86-tresty-ved.ts. Importuje se relativně
// s příponou (běží i v Node bez `@/`).
import {
  MAX_LIDI_DAVKY, castkyDavky, potrebujeSouhlas, rozdelZaskok, validujNahradu, validujSrazku, validujZaskok,
  type DruhSkody, type KomuZaskok, type PenizeTrestu, type SrazkaTrestu, type Zavineni, type ZpusobZaskoku,
} from '../../lib/trestyPenize.ts';

/** Která peněžní cesta je v okně vybraná (přepínač v sekci Peníze). */
export type RezimPenez = 'kraceni' | 'nahrada' | 'srazka';
export const REZIMY_PENEZ: readonly RezimPenez[] = ['kraceni', 'nahrada', 'srazka'];

/** Peněžní část formuláře (hodnoty polí jako text, jak je drží inputy). */
export interface FormularPenez {
  rezim: RezimPenez;
  /** A) krácení nenárokové části (každý, nebo celkem k rozpočítání). */
  kraceni: string;
  /** B) výše škody, kolik po člověku chtít (prázdné = celá škoda), druh, zavinění, dohoda o odpovědnosti. */
  skoda: string;
  nahrada: string;
  druhSkody: DruhSkody;
  zavineni: Zavineni;
  dohoda: boolean;
  dohodaDatum: string;
  /** C) přímá srážka. */
  srazka: string;
  /** Splátky (1–12) náhrady i srážky. */
  splatky: string;
  /** U víc lidí: false = „každý X", true = „rozpočítat X mezi všechny". */
  rozpocitat: boolean;
  /** Komu přejde stržená částka. */
  zaskokKomu: KomuZaskok;
  zaskokZpusob: ZpusobZaskoku;
  /** Kdo to napravil (komu 'lide'); částka jen u způsobu 'castky'. */
  zaskokLide: { userId: number; castka: string }[];
}

export const prazdnePenize = (p: Partial<FormularPenez> = {}): FormularPenez => ({
  rezim: 'kraceni', kraceni: '', skoda: '', nahrada: '', druhSkody: 'zavinena', zavineni: 'nedbalost', dohoda: false, dohodaDatum: '',
  srazka: '', splatky: '1', rozpocitat: false, zaskokKomu: 'podnik', zaskokZpusob: 'rovne', zaskokLide: [], ...p,
});

const cislo = (v: string): number => {
  const n = Number(String(v ?? '').trim() || 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

/** Částka vybrané cesty, jak ji vedoucí napsal (u náhrady „kolik chtít", prázdné = celá škoda). */
export function castkaPenez(f: FormularPenez): number {
  if (f.rezim === 'kraceni') return Math.max(0, cislo(f.kraceni));
  if (f.rezim === 'srazka') return Math.max(0, cislo(f.srazka));
  return Math.max(0, f.nahrada.trim() ? cislo(f.nahrada) : cislo(f.skoda));
}

/** Kolik se strhne každému z `n` lidí (každý X, nebo rozpočítat X); jeden člověk = celá částka. */
export function castkyNaOsobu(f: FormularPenez, n: number): number[] {
  if (!(n > 0)) return [];
  return castkyDavky(castkaPenez(f), n, n > 1 && f.rozpocitat);
}

/** Strhne se z trestu něco (jen pak má smysl sekce „Komu přejde stržená částka")? */
export const strhavaSe = (f: FormularPenez): boolean => castkaPenez(f) > 0;

/** Pole krácení pro tělo trestu (bonusCut): jen u cesty krácení, jinak 0. */
export const kraceniZPenez = (f: FormularPenez): string => (f.rezim === 'kraceni' ? f.kraceni : '');

/**
 * Peněžní pole těla POST /api/tresty (bez bonusCut — to nese teloTrestu): srážka / náhrada podle
 * vybrané cesty, `rozpocitat` u dávky, záskok jen když se něco strhává a nemá zůstat podniku.
 */
export function teloPenez(f: FormularPenez, pocetLidi: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (pocetLidi > 1) out.rozpocitat = f.rozpocitat;
  const splatky = Math.min(12, Math.max(1, cislo(f.splatky) || 1));
  if (f.rezim === 'srazka' && cislo(f.srazka) > 0) out.srazka = { castka: cislo(f.srazka), splatky };
  if (f.rezim === 'nahrada' && cislo(f.skoda) > 0) {
    out.nahrada = {
      skoda: cislo(f.skoda),
      ...(f.nahrada.trim() ? { castka: cislo(f.nahrada) } : {}),
      druh: f.druhSkody,
      ...(f.druhSkody === 'zavinena' ? { zavineni: f.zavineni } : { dohoda: f.dohoda, ...(f.dohodaDatum ? { dohodaDatum: f.dohodaDatum } : {}) }),
      splatky,
    };
  }
  if (strhavaSe(f) && f.zaskokKomu !== 'podnik') out.zaskok = zaskokTela(f);
  return out;
}

type PoleZaskoku = Pick<FormularPenez, 'zaskokKomu' | 'zaskokZpusob' | 'zaskokLide'>;

/** Pole `zaskok` těla (POST i PATCH): podnik / celá osádka / kdo to napravil (rovně nebo částky). */
function zaskokTela(f: PoleZaskoku): Record<string, unknown> {
  if (f.zaskokKomu === 'podnik') return { komu: 'podnik' };
  if (f.zaskokKomu === 'smena') return { komu: 'smena' };
  return {
    komu: 'lide', zpusob: f.zaskokZpusob,
    lide: f.zaskokLide.map(l => (f.zaskokZpusob === 'castky' ? { userId: l.userId, castka: cislo(l.castka) } : { userId: l.userId })),
  };
}

/** Tělo PATCH /api/tresty/[id] „Změnit záskok" (jen záskok; dosavadní převody server zruší). */
export const teloZaskoku = (f: PoleZaskoku): Record<string, unknown> => ({ zaskok: zaskokTela(f) });

/**
 * Kontrola peněžní části dřív, než požadavek odejde — stejná pravidla jako server (validujSrazku,
 * validujNahradu, validujZaskok z jádra). Vrací českou větu (klíč k překladu) nebo null.
 */
export function chybaPenez(f: FormularPenez, pocetLidi: number, dnes: string): string | null {
  const telo = teloPenez(f, pocetLidi);
  if (f.rezim === 'kraceni' && f.kraceni.trim() && !/^\d+$/.test(f.kraceni.trim())) return 'Krácení prémie musí být celé číslo (nejvýš 5 000).';
  if (f.rezim === 'srazka' && f.srazka.trim()) {
    if (!/^\d+$/.test(f.srazka.trim())) return 'Srážka musí být celé kladné číslo (nejvýš 200 000).';
    const s = validujSrazku(telo.srazka);
    if (!s.ok) return s.chyba;
  }
  if (f.rezim === 'nahrada' && (f.skoda.trim() || f.nahrada.trim())) {
    if (!f.skoda.trim() || !/^\d+$/.test(f.skoda.trim())) return 'Výše škody musí být celé kladné číslo.';
    if (f.nahrada.trim() && !/^\d+$/.test(f.nahrada.trim())) return 'Náhrada musí být celé kladné číslo (nejvýš 200 000).';
    const n = validujNahradu(telo.nahrada, dnes);
    if (!n.ok) return n.chyba;
  }
  if (pocetLidi > 1 && f.rozpocitat && castkyNaOsobu(f, pocetLidi).some(c => c <= 0) && castkaPenez(f) > 0) return 'Po rozpočítání by někomu vyšlo 0 — zvyš částku.';
  if (telo.zaskok) {
    const z = validujZaskok(telo.zaskok);
    if (!z.ok) return z.chyba;
    if (f.zaskokKomu === 'lide' && f.zaskokZpusob === 'castky' && !f.zaskokLide.some(l => cislo(l.castka) > 0)) return 'Zadej částku aspoň jednomu kolegovi.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Souhrn před uložením
// ---------------------------------------------------------------------------

export interface OsobaSouhrnu { id: number; jmeno: string; smlouva?: string | null }

export interface SouhrnPenez {
  /** Kdo o co přijde (po lidech). `ceka` = srážka / náhrada počká na souhlas zaměstnance. */
  strhne: { userId: number; jmeno: string; castka: number; ceka: boolean }[];
  /** Komu co přejde (součet přes všechny potrestané). `poSouhlasu` = aspoň část až se souhlasem. */
  prijme: { userId: number; jmeno: string; castka: number; poSouhlasu: boolean }[];
  /** Kolik zůstane podniku. */
  podniku: number;
  /** Věta, proč záskok nejde (z rozdelZaskok), nebo null. */
  chyba: string | null;
}

/**
 * Souhrn peněz před uložením: kolik komu ubude a komu co přejde. Potrestaný sám sobě nic
 * nepřevádí; „celá osádka" = `osadka` (směna + uzávěrka dne) bez potrestaných — stejně jako server.
 */
export function souhrnPenez(o: {
  f: FormularPenez;
  lide: readonly OsobaSouhrnu[];
  /** Osádka směny dne (pro zaskokKomu 'smena'). */
  osadka?: readonly OsobaSouhrnu[];
  /** Jména příjemců „kdo to napravil" (id → jméno). */
  jmena?: ReadonlyMap<number, string>;
}): SouhrnPenez {
  const castky = castkyNaOsobu(o.f, o.lide.length);
  const ceka = o.f.rezim !== 'kraceni';
  const strhne = o.lide.map((l, i) => ({ userId: l.id, jmeno: l.jmeno, castka: castky[i] ?? 0, ceka: ceka && potrebujeSouhlas(l.smlouva ?? null) }))
    .filter(x => x.castka > 0);
  const out: SouhrnPenez = { strhne, prijme: [], podniku: 0, chyba: null };
  const potrestani = new Set(o.lide.map(l => l.id));
  const jmeno = (id: number) => o.jmena?.get(id) ?? o.osadka?.find(x => x.id === id)?.jmeno ?? o.lide.find(x => x.id === id)?.jmeno ?? '';
  const prijemci = o.f.zaskokKomu === 'smena'
    ? (o.osadka ?? []).filter(x => !potrestani.has(x.id)).map(x => ({ userId: x.id, castka: null as number | null }))
    : o.f.zaskokKomu === 'lide' ? o.f.zaskokLide.map(l => ({ userId: l.userId, castka: o.f.zaskokZpusob === 'castky' ? cislo(l.castka) : null })) : [];
  const mapa = new Map<number, { castka: number; poSouhlasu: boolean }>();
  for (const s of strhne) {
    if (o.f.zaskokKomu === 'podnik' || !prijemci.length) { out.podniku += s.castka; continue; }
    const r = rozdelZaskok({ zaklad: s.castka, zpusob: o.f.zaskokKomu === 'smena' ? 'rovne' : o.f.zaskokZpusob, prijemci, krome: [s.userId] });
    if (!r.ok) { out.chyba = r.chyba; out.podniku += s.castka; continue; }
    out.podniku += r.podniku;
    for (const p of r.podily) {
      const m = mapa.get(p.userId) ?? { castka: 0, poSouhlasu: false };
      m.castka += p.castka;
      m.poSouhlasu ||= s.ceka;
      mapa.set(p.userId, m);
    }
  }
  out.prijme = [...mapa.entries()].map(([userId, m]) => ({ userId, jmeno: jmeno(userId), castka: m.castka, poSouhlasu: m.poSouhlasu }));
  return out;
}

// ---------------------------------------------------------------------------
// Hromadný výběr lidí
// ---------------------------------------------------------------------------

export interface ClovekVyberu { id: number; name: string; avatar: string | null; role: string; jobTitle: string | null }

/** Štítek role / pozice pro filtr („Barista" z pozice, jinak role). */
export const stitekRole = (l: Pick<ClovekVyberu, 'role' | 'jobTitle'>): string => (l.jobTitle?.trim() || l.role || '').trim();

/** Role / pozice, podle kterých jde filtrovat (každá jednou, podle abecedy). */
export function roleVyberu(lide: readonly ClovekVyberu[]): string[] {
  return [...new Set(lide.map(stitekRole).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'cs'));
}

/** Lidé ve výběru podle filtru role (prázdný = všichni), seřazení podle jména. */
export function lideVyberu(lide: readonly ClovekVyberu[], role: string): ClovekVyberu[] {
  return lide.filter(l => !role || stitekRole(l) === role).sort((a, b) => a.name.localeCompare(b.name, 'cs'));
}

/** Přepne člověka ve výběru (nejvýš MAX_LIDI_DAVKY). */
export function prepniVyber(vybrani: readonly number[], id: number): number[] {
  if (vybrani.includes(id)) return vybrani.filter(x => x !== id);
  return vybrani.length >= MAX_LIDI_DAVKY ? [...vybrani] : [...vybrani, id];
}

/** Rychlá volba (celá směna, všichni na uzávěrce, všichni s rolí): když už jsou všichni vybraní, odebere je; jinak přidá. */
export function rychlaVolba(vybrani: readonly number[], skupina: readonly number[]): number[] {
  if (!skupina.length) return [...vybrani];
  const vsichni = skupina.every(id => vybrani.includes(id));
  if (vsichni) return vybrani.filter(id => !skupina.includes(id));
  return [...new Set([...vybrani, ...skupina])].slice(0, MAX_LIDI_DAVKY);
}

// ---------------------------------------------------------------------------
// Peníze u trestu v seznamech vedení
// ---------------------------------------------------------------------------

/** Platné srážky trestu (bez zrušených) — co ukázat v řádku. */
export const platneSrazky = (p: PenizeTrestu | null | undefined): SrazkaTrestu[] => (p?.srazky ?? []).filter(s => s.stav !== 'zruseno');

/** Má trest nějaké peníze k ukázání (krácení, srážka, záskok na lidi)? */
export const maPenize = (p: PenizeTrestu | null | undefined): boolean =>
  !!p && (p.kraceni > 0 || p.srazky.length > 0 || p.zaskok.prevody.some(x => x.stav === 'plati'));

/** Platné převody záskoku (komu stržené peníze přejdou). */
export const platnePrevody = (p: PenizeTrestu | null | undefined) => (p?.zaskok.prevody ?? []).filter(x => x.stav === 'plati');

/** Co jde se srážkou udělat z pohledu vedení: zrušit / snížit (ne zrušená), znovu požádat (po nesouhlasu). */
export function akceSrazky(s: Pick<SrazkaTrestu, 'stav' | 'castka'>, trestPlati: boolean): { zrusit: boolean; snizit: boolean; znovu: boolean } {
  if (!trestPlati || s.stav === 'zruseno') return { zrusit: false, snizit: false, znovu: false };
  return { zrusit: true, snizit: s.castka > 1 && s.stav !== 'nesouhlas', znovu: s.stav === 'nesouhlas' };
}

/** Lidé jedné dávky (hromadný trest) v seznamu: kolik jich je a jména (pro řádek „Hromadně · 3 lidé"). */
export function jmenaDavky(items: readonly { batchId?: number | null; userName: string; status: string }[], batchId: number | null | undefined): string[] {
  if (!batchId) return [];
  return items.filter(x => x.batchId === batchId).map(x => x.userName);
}
