// „Úkoly za body" pro vedení (kolo 11, balík V) — čistá logika bez Reactu a bez DB.
//
// Úkol za body = položka nabídky navíc s opakováním (lib/navic.ts, sekce „Volitelné úkoly"):
// kdo chce, vezme si ho („Beru si"), splní a dostane body. Tady je formulář okna
// (NabidkaNavicOkno) — převod z položky a zpět do těla pro validujNabidku —, souhrn dne
// pro widget a část Úkolů a předání `arg` z oznámení, hledání a widgetu.
// Testy: scripts/testy/k87-za-body-ved.ts. Importy relativně s příponou (běží i v Node bez `@/`).
import type { NabidkaNavic, Navic, OpakovaniNabidky, UkolNavic } from '../../lib/navic.ts';

/** Argument pohledu tasks: otevřít část „Za body" (oznámení, hledání, widget). */
export const ARG_ZA_BODY = 'za-body';
/** Argument pohledu tasks: otevřít část „Za body" a rovnou okno „Nový úkol za body" (hledání). */
export const ARG_ZA_BODY_NOVY = 'za-body:novy';

/** Rozbor argumentu z předání: null = netýká se úkolů za body. */
export function rozborArgZaBody(arg: string | null | undefined): { novy: boolean } | null {
  if (arg === ARG_ZA_BODY) return { novy: false };
  if (arg === ARG_ZA_BODY_NOVY) return { novy: true };
  return null;
}

/** Stav formuláře okna „Nový úkol za body" / „Upravit" — pole jako text (inputy), převod až při uložení. */
export interface FormularZaBody {
  nazev: string;
  popis: string;
  body: string;
  premie: string;
  opakovani: OpakovaniNabidky;
  /** Vybrané dny (1 = pondělí … 7 = neděle) pro „Vybrané dny". */
  dny: number[];
  /** Každých kolik dní pro „Každých N dní". */
  interval: string;
  od: string;
  do: string;
  /** Kolik lidí v termínu: '' = kdokoli (bez omezení). */
  kapacita: string;
  /** Kolikrát jeden člověk v termínu: '' = bez limitu. */
  limit: string;
  /** Jen vybraným lidem (jinak všem). */
  jenVybranym: boolean;
  komu: number[];
  fotka: boolean;
  auto: boolean;
  aktivni: boolean;
}

/** Výchozí počet bodů nového úkolu. */
export const VYCHOZI_BODY = 20;
/** Výchozí interval „Každých N dní". */
export const VYCHOZI_INTERVAL = 3;

/** Formulář z položky (úprava), nebo prázdný pro nový úkol (s předvyplněným názvem z běžného „Nový úkol"). */
export function formularZNabidky(n?: NabidkaNavic | null, predvyplneno?: { nazev?: string; popis?: string }): FormularZaBody {
  if (!n) {
    return {
      nazev: predvyplneno?.nazev?.trim() ?? '', popis: predvyplneno?.popis?.trim() ?? '', body: String(VYCHOZI_BODY), premie: '',
      opakovani: 'kdykoli', dny: [], interval: String(VYCHOZI_INTERVAL), od: '', do: '',
      // Úkol za body je „ať to nedělají dva": nový bere jeden člověk jednou za termín.
      kapacita: '1', limit: '1', jenVybranym: false, komu: [], fotka: false, auto: false, aktivni: true,
    };
  }
  return {
    nazev: n.title, popis: n.description ?? '', body: String(n.points), premie: n.bonusCzk ? String(n.bonusCzk) : '',
    opakovani: n.recurrence, dny: [...n.recDays], interval: n.recInterval ? String(n.recInterval) : String(VYCHOZI_INTERVAL),
    od: n.validFrom ?? '', do: n.validTo ?? '',
    kapacita: n.capacity == null ? '' : String(n.capacity), limit: n.maxPerDay == null ? '' : String(n.maxPerDay),
    jenVybranym: n.targetUsers.length > 0, komu: [...n.targetUsers], fotka: n.requirePhoto, auto: n.autoApprove, aktivni: n.active,
  };
}

const cisloNeboNull = (s: string): number | null => (s.trim() === '' ? null : Number(s));

/** Tělo pro validujNabidku a POST/PATCH /api/navic/offers (pole, která opakování nepotřebuje, jdou prázdná). */
export function teloFormulare(f: FormularZaBody): Record<string, unknown> {
  return {
    title: f.nazev, description: f.popis.trim() || null,
    points: f.body === '' ? 0 : Number(f.body), bonusCzk: f.premie === '' ? null : Number(f.premie),
    autoApprove: f.auto, active: f.aktivni, validFrom: f.od || null, validTo: f.do || null,
    maxPerDay: cisloNeboNull(f.limit),
    recurrence: f.opakovani, recDays: f.opakovani === 'dny' ? [...f.dny].sort((a, b) => a - b) : [],
    recInterval: f.opakovani === 'interval' ? cisloNeboNull(f.interval) : null,
    capacity: cisloNeboNull(f.kapacita), requirePhoto: f.fotka,
    targetUsers: f.jenVybranym ? [...f.komu] : [],
  };
}

/** Přepnutí dne v týdnu (chip Po–Ne), seznam zůstává seřazený. */
export function prepniDen(dny: readonly number[], den: number): number[] {
  return (dny.includes(den) ? dny.filter(d => d !== den) : [...dny, den]).sort((a, b) => a - b);
}

/** Krokovač bodů v okně: ±5 v mezích 0–max (nečíslo = 0). */
export function krokBoduUkolu(aktualni: string, smer: 1 | -1, max: number): number {
  const n = Number(aktualni);
  const z = Number.isFinite(n) ? Math.round(n) : 0;
  return Math.max(0, Math.min(max, z + smer * 5));
}

/** Kolik míst v termínu ještě zbývá: null = bez omezení (kdokoli). */
export function volnaMista(u: Pick<UkolNavic, 'obsazeno'> & { nabidka: Pick<NabidkaNavic, 'capacity'> }): number | null {
  if (u.nabidka.capacity == null) return null;
  return Math.max(0, u.nabidka.capacity - u.obsazeno);
}

/** Souhrn dnešních úkolů za body pro vedení (widget, část Úkolů). */
export interface SouhrnZaBody {
  /** Kolik úkolů jde dnes vzít. */
  pocet: number;
  /** Kolik z nich má ještě volné místo (nebo je pro kohokoli). */
  volne: number;
  /** Kolik lidí má úkol vzatý a ještě nehotový. */
  vzato: number;
  /** Kolik lidí ho dnes (v termínu) splnilo. */
  hotovo: number;
  /** Součet bodů všech úkolů dne (kolik se dá dnes v úkolech za body získat). */
  body: number;
}

export function souhrnZaBody(ukoly: readonly UkolNavic[]): SouhrnZaBody {
  const s: SouhrnZaBody = { pocet: ukoly.length, volne: 0, vzato: 0, hotovo: 0, body: 0 };
  for (const u of ukoly) {
    const volno = volnaMista(u);
    if (volno == null || volno > 0) s.volne++;
    for (const k of u.kdo) if (k.stav === 'vzato') s.vzato++; else s.hotovo++;
    s.body += u.nabidka.points;
  }
  return s;
}

/** Čekající zápisy z úkolů za body (zápis s offerId) — fronta k uznání ve widgetu. */
export function cekajiciZUkolu(items: readonly Navic[]): Navic[] {
  return items.filter(z => z.status === 'ceka' && z.offerId != null);
}

/** Řazení úkolů pro vedení: kde se něco děje (vzato/hotovo) nahoře, pak volné podle bodů, plné dole. */
export function seradProVedeni(ukoly: readonly UkolNavic[]): UkolNavic[] {
  const vaha = (u: UkolNavic) => {
    const volno = volnaMista(u);
    if (volno === 0) return 2;
    return u.kdo.length ? 0 : 1;
  };
  return [...ukoly].sort((a, b) => vaha(a) - vaha(b) || b.nabidka.points - a.nabidka.points || a.nabidka.title.localeCompare(b.nabidka.title, 'cs'));
}
