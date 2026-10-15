// Způsob počítání bodů (kolo 91, balík body-R) — čistá logika bez databáze.
//
// Martin: „U položek si navolit, jestli body za jednotlivé body v postupu budou vždy
// přičítány, nebo budou body vždy jen za celkový postup a body u kolonek postupu budou
// jen negativní v případě, že se to nedodělá — u všech věcí, za které jsou body.“
//
// Tři způsoby:
//  - 'kombinace' (výchozí) = dnešní chování beze změny: postup = základ + příplatek za
//    úplnost (až do výše základu) − srážky (k89); úkol a uzávěrka = jen základ.
//    Výchozí proto, aby nasazení nikomu nezměnilo body ani v historii.
//  - 'kroky'  = „Za každý krok“: každý splněný krok (položka checklistu, povinná věc
//    uzávěrky) body PŘIDÁ, nesplněný nic neubere; volitelně bonus = základ za celek.
//  - 'celek'  = „Za celek“: body jen za věc jako celek (základ), kroky jen ZÁPORNÉ —
//    za každý nedodělaný (a neomluveně přeskočený) krok srážka.
// Prázdné dokončení (ani jeden splněný krok) = 0 ve všech způsobech (k89).
//
// Účetní tvar (smlouva s lib/pointsBalance): základ za dokončenou věc se počítá jednou
// v totalPoints() z POČTU (úkoly × pt.task, neprázdné průběhy × pt.procedure, uzávěrky ×
// pt.closing). Automatický řádek v shift_review_items proto nese jen ROZDÍL proti němu:
//   radek = body věci − započtený základ.
// `srazka` (≤ 0) je ta část řádku, která je skutečná srážka — denní strop (níž) ji
// odečte vždy, i když člověk strop přesáhl („srážky platí vždy“).

import { parseSteps, stepPenalty, krokBody, type Step } from './steps.ts';
import { scoreRun, isExcused, type SkipReasons } from './procedureScoring.ts';

export type Rezim = 'kombinace' | 'kroky' | 'celek';
export type DruhBodu = 'postupy' | 'ukoly' | 'uzaverky';

export const REZIMY: Rezim[] = ['kombinace', 'kroky', 'celek'];
export const DRUHY_BODU: DruhBodu[] = ['postupy', 'ukoly', 'uzaverky'];

/** Výchozí pravidlo jednoho druhu (nastavení podniku). */
export interface PravidloRezimu {
  rezim: Rezim;
  /** Jen „Za každý krok“: připočíst za dokončení celku ještě základ. */
  bonus: boolean;
  /** Úkoly a uzávěrky, „Za každý krok“: body za splněnou položku / povinnou věc. Postupy mají body kroků. */
  zaPolozku: number;
  /** Úkoly a uzávěrky, „Za celek“: srážka za nesplněnou položku / povinnou věc (kladné číslo). */
  srazka: number;
}

/** Přepsání u jedné položky (procedures.body_rezim, tasks.body_rezim). null pole = dědí z podniku. */
export interface PrepisRezimu {
  rezim: Rezim | null;
  bonus: boolean | null;
  /** Vlastní body za celek (základ) — u úkolu i „počet bodů za úkol“, když nemá kroky. */
  zaklad: number | null;
}

export interface NastaveniRezimu {
  postupy: PravidloRezimu;
  ukoly: PravidloRezimu;
  uzaverky: PravidloRezimu;
  /** Denní strop automatických bodů na člověka; 0 = bez stropu. Výchozí 30. */
  denniStrop: number;
  /** Od kterého dne strop platí (YYYY-MM-DD); null = odjakživa („Přepočítat zpětně“). */
  stropOd: string | null;
}

export const VYCHOZI_STROP = 30;
export const MAX_STROP = 500;
/**
 * Den nasazení stropu. Podnik, který strop nikdy neuložil, ho má od tohoto dne —
 * nasazení tak nezmění body za dny před ním. Zpětně (odjakživa) ho zapne až
 * „Přepočítat zpětně“ v nastavení bodů (uloží stropOd = null).
 */
export const VYCHOZI_STROP_OD = '2026-10-16';

export const VYCHOZI_PRAVIDLO: PravidloRezimu = { rezim: 'kombinace', bonus: false, zaPolozku: 1, srazka: 1 };

const DEN = /^\d{4}-\d{2}-\d{2}$/;
const jeRezim = (v: unknown): v is Rezim => v === 'kombinace' || v === 'kroky' || v === 'celek';
const celeOd0 = (v: unknown, d: number, max = 100) => {
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) && n >= 0 ? Math.min(max, Math.round(n)) : d;
};

export function normalizujPravidlo(raw: any): PravidloRezimu {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    rezim: jeRezim(r.rezim) ? r.rezim : VYCHOZI_PRAVIDLO.rezim,
    bonus: r.bonus === true,
    zaPolozku: celeOd0(r.zaPolozku, VYCHOZI_PRAVIDLO.zaPolozku),
    srazka: celeOd0(r.srazka, VYCHOZI_PRAVIDLO.srazka),
  };
}

/** Nastavení z teams.points_config (klíče rezim, denniStrop, denniStropOd). */
export function nastaveniRezimu(pointsConfig: any): NastaveniRezimu {
  const pc = pointsConfig && typeof pointsConfig === 'object' ? pointsConfig : {};
  const rz = pc.rezim && typeof pc.rezim === 'object' ? pc.rezim : {};
  let stropOd: string | null = VYCHOZI_STROP_OD;
  if (Object.prototype.hasOwnProperty.call(pc, 'denniStropOd')) {
    stropOd = typeof pc.denniStropOd === 'string' && DEN.test(pc.denniStropOd) ? pc.denniStropOd : null;
  }
  return {
    postupy: normalizujPravidlo(rz.postupy),
    ukoly: normalizujPravidlo(rz.ukoly),
    uzaverky: normalizujPravidlo(rz.uzaverky),
    denniStrop: celeOd0(pc.denniStrop, VYCHOZI_STROP, MAX_STROP),
    stropOd,
  };
}

/** Klíče, které nastavení zapisuje zpátky do points_config (vedle sazebníku). */
export function doPointsConfig(n: NastaveniRezimu): { rezim: Record<DruhBodu, PravidloRezimu>; denniStrop: number; denniStropOd: string | null } {
  return {
    rezim: { postupy: normalizujPravidlo(n.postupy), ukoly: normalizujPravidlo(n.ukoly), uzaverky: normalizujPravidlo(n.uzaverky) },
    denniStrop: celeOd0(n.denniStrop, VYCHOZI_STROP, MAX_STROP),
    denniStropOd: n.stropOd && DEN.test(n.stropOd) ? n.stropOd : null,
  };
}

export function normalizujPrepis(raw: any): PrepisRezimu | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rezim = jeRezim(raw.rezim) ? raw.rezim : null;
  const bonus = typeof raw.bonus === 'boolean' ? raw.bonus : null;
  const zaklad = raw.zaklad == null || raw.zaklad === '' ? null : celeOd0(raw.zaklad, -1, 500);
  const p: PrepisRezimu = { rezim, bonus, zaklad: zaklad != null && zaklad >= 0 ? zaklad : null };
  return p.rezim == null && p.bonus == null && p.zaklad == null ? null : p;
}

/** Pravidlo, které pro položku opravdu platí: přepsání u položky, jinak výchozí podniku. */
export interface UcinnePravidlo extends PravidloRezimu {
  /** Body za věc jako celek (vlastní u položky, jinak sazebník podniku). */
  zaklad: number;
  /** Dědí výchozí podniku (přepočet výchozího se jí týká). */
  dedi: boolean;
}

export function ucinnePravidlo(vychozi: PravidloRezimu, prepis: PrepisRezimu | null, zakladPodniku: number): UcinnePravidlo {
  const z = Number.isFinite(zakladPodniku) && zakladPodniku > 0 ? Math.round(zakladPodniku) : 0;
  return {
    ...vychozi,
    rezim: prepis?.rezim ?? vychozi.rezim,
    bonus: prepis?.bonus ?? vychozi.bonus,
    zaklad: prepis?.zaklad ?? z,
    dedi: prepis?.rezim == null,
  };
}

// ---------------------------------------------------------------------------
// Bodování jedné věci

export interface BodyVeci {
  /** Kolik věc celkem vynese (základ v totalPoints + řádek). */
  body: number;
  /** Řádek do shift_review_items: body − započtený základ. */
  radek: number;
  /** Srážková část řádku (≤ 0). */
  srazka: number;
  flagged: boolean;
  /** Poznámka řádku — začíná „auto:“ (podle toho se pozná automatický řádek). */
  summary: string;
}

/** Postup: kroky z procedures.items, odškrtnuté/přeskočené indexy a důvody z průběhu. */
export function bodyPostupu(
  items: any, checked: number[], skipped: number[], skipReasons: SkipReasons,
  p: UcinnePravidlo, zakladPodniku: number,
): BodyVeci {
  const steps: Step[] = parseSteps(items);
  const run = scoreRun(items, checked, skipped, skipReasons, p.zaklad);
  const prazdny = steps.length > 0 && run.done === 0;
  // Základ, který totalPoints za tenhle průběh započítá (prázdný průběh ho nedostane).
  const zapocteny = prazdny ? 0 : Math.max(0, Math.round(zakladPodniku) || 0);
  if (prazdny) return { body: 0, radek: 0, srazka: 0, flagged: true, summary: run.summary };

  if (p.rezim === 'kombinace') {
    // Dnešní hybrid (k89) — s vlastním základem položky jen posunutý o rozdíl základů.
    const body = p.zaklad + run.points;
    return { body, radek: body - zapocteny, srazka: -run.penalty, flagged: run.flagged, summary: run.summary };
  }
  if (p.rezim === 'kroky') {
    let plus = 0;
    steps.forEach((s, i) => { if (checked.includes(i)) plus += krokBody(s); });
    const body = plus + (p.bonus ? p.zaklad : 0);
    return { body, radek: body - zapocteny, srazka: 0, flagged: run.flagged, summary: run.summary };
  }
  // celek: základ − srážky za nedodělané a neomluveně přeskočené kroky
  let pen = 0;
  steps.forEach((s, i) => {
    if (checked.includes(i)) return;
    const skip = skipReasons[String(i)];
    if (skipped.includes(i) && skip && isExcused(skip.reason)) return;
    pen += stepPenalty(s);
  });
  const body = p.zaklad - pen;
  return { body, radek: body - zapocteny, srazka: -pen, flagged: run.flagged, summary: run.summary };
}

/** Úkol: checklist [{text, done}] (bez checklistu = věc bez kroků, platí jen základ). */
export function bodyUkolu(checklist: any, p: UcinnePravidlo, zakladPodniku: number): BodyVeci {
  const polozky = Array.isArray(checklist) ? checklist.filter((i: any) => i && String(i.text ?? '').trim()) : [];
  const n = polozky.length;
  const hotovo = polozky.filter((i: any) => i.done === true).length;
  return bodyPolozek(hotovo, n, p, zakladPodniku, `auto: ${hotovo}/${n} položek`);
}

/** Uzávěrka: kolik povinných věcí dne (postupy, úkoly, návody) bylo hotových. */
export function bodyUzaverky(hotovo: number, celkem: number, p: UcinnePravidlo, zakladPodniku: number): BodyVeci {
  return bodyPolozek(hotovo, celkem, p, zakladPodniku, `auto: ${hotovo}/${celkem} povinných`);
}

/** Z poznámky automatického řádku uzávěrky vytáhne „hotovo/celkem“ (pro přepočet zpětně). */
export function povinneZPoznamky(note: unknown): { hotovo: number; celkem: number } | null {
  const m = /^auto: (\d+)\/(\d+) povinných/.exec(String(note ?? ''));
  return m ? { hotovo: Number(m[1]), celkem: Number(m[2]) } : null;
}

function bodyPolozek(hotovo: number, celkem: number, p: UcinnePravidlo, zakladPodniku: number, summary: string): BodyVeci {
  const h = Math.max(0, Math.min(celkem, Math.round(hotovo) || 0));
  const n = Math.max(0, Math.round(celkem) || 0);
  const zapocteny = Math.max(0, Math.round(zakladPodniku) || 0);
  const chybi = n - h;
  let body: number, srazka = 0;
  if (p.rezim === 'kroky' && n > 0) {
    body = h * p.zaPolozku + (p.bonus ? p.zaklad : 0);
  } else if (p.rezim === 'celek' && n > 0) {
    srazka = -chybi * p.srazka;
    body = p.zaklad + srazka;
  } else {
    // kombinace, nebo věc bez kroků: jen základ (u úkolu případně vlastní počet bodů)
    body = p.zaklad;
  }
  return { body, radek: body - zapocteny, srazka, flagged: chybi > 0 && p.rezim === 'celek', summary };
}

// ---------------------------------------------------------------------------
// Denní strop a přednost ručního hodnocení

/** Automatické body člověka za jeden den, sečtené zvlášť plus a minus. */
export interface DenBodu {
  uid: number;
  den: string | null;
  plus: number;
  minus: number;
  /** Vedení ten den ohodnotilo ručně a ruční body nahrazují automatické. */
  nahrazeno: boolean;
}

export interface UcinnyDen {
  /** Kolik se z automatických bodů dne opravdu započítá. */
  efektivni: number;
  /** Kolik nasbíral bez stropu a bez ručního hodnocení (plus + minus). */
  nasbirano: number;
  /** efektivni − nasbirano (≤ 0, když strop nebo ruční hodnocení něco ubraly). */
  uprava: number;
  zastropovano: boolean;
}

/** Platí strop pro den? Den bez data (staré řádky) se nestropuje. */
export function stropPlati(den: string | null, n: Pick<NastaveniRezimu, 'denniStrop' | 'stropOd'>): boolean {
  if (!den || !(n.denniStrop > 0)) return false;
  return n.stropOd == null || den >= n.stropOd;
}

/**
 * Jedno místo pravidla „nejvýš X bodů za den“: plus se sečte nejvýš do stropu,
 * srážky platí vždy. Ruční hodnocení dne, které nahrazuje automatické, z dne nechá 0.
 */
export function ucinnyDen(d: Pick<DenBodu, 'den' | 'plus' | 'minus' | 'nahrazeno'>, n: Pick<NastaveniRezimu, 'denniStrop' | 'stropOd'>): UcinnyDen {
  const plus = Math.max(0, Math.round(d.plus) || 0);
  const minus = Math.min(0, Math.round(d.minus) || 0);
  const nasbirano = plus + minus;
  if (d.nahrazeno) return { efektivni: 0, nasbirano, uprava: -nasbirano, zastropovano: false };
  if (stropPlati(d.den, n) && plus > n.denniStrop) {
    const efektivni = n.denniStrop + minus;
    return { efektivni, nasbirano, uprava: efektivni - nasbirano, zastropovano: true };
  }
  return { efektivni: nasbirano, nasbirano, uprava: 0, zastropovano: false };
}

/** Plus a minus jednoho automatického řádku: se známou srážkou přesně, u starých řádků podle znaménka. */
export function rozdelRadek(points: number, srazka: number | null | undefined): { plus: number; minus: number } {
  const p = Math.round(Number(points) || 0);
  if (srazka != null && Number.isFinite(Number(srazka))) {
    const s = Math.min(0, Math.round(Number(srazka)));
    return { plus: p - s, minus: s };
  }
  return p >= 0 ? { plus: p, minus: 0 } : { plus: 0, minus: p };
}

/** Ruční hodnocení směny nahrazuje automatické body dne? Jen když to vedení zvolilo a dalo body nebo hvězdy. */
export function hodnoceniNahrazuje(r: { nahradit_auto?: boolean | null; points?: number | null; rating?: number | null } | null | undefined): boolean {
  if (!r || r.nahradit_auto !== true) return false;
  return (Number(r.points) || 0) !== 0 || (Number(r.rating) || 0) > 0;
}

// ---------------------------------------------------------------------------
// Přepočet zpětně — souhrn dopadu

export interface ZmenaRadku {
  /** id řádku shift_review_items; null = nový řádek (úkol, který řádek ještě neměl). */
  id: number | null;
  uid: number;
  den: string;
  kind: 'procedure' | 'task' | 'closing';
  refId: number;
  stare: number;
  nove: number;
  stareSrazka: number | null;
  noveSrazka: number;
  stareNote: string | null;
  noveNote: string;
}

/** Změnil by se řádek? (Body nebo srážka; u nového řádku jen když není nulový.) */
export function jeZmena(z: Pick<ZmenaRadku, 'id' | 'stare' | 'nove' | 'stareSrazka' | 'noveSrazka'>): boolean {
  if (z.id == null) return z.nove !== 0 || z.noveSrazka !== 0;
  return z.stare !== z.nove || (z.stareSrazka ?? null) !== z.noveSrazka;
}

export interface DopadClena { uid: number; pred: number; po: number }
export interface SouhrnDopadu {
  zaznamu: number;
  lidi: number;
  /** Součet změn zůstatků (po − před) přes všechny lidi. */
  celkem: number;
  /** Lidé, kterým by zůstatek klesl pod nulu (a před tím pod nulou nebyl). */
  doMinusu: DopadClena[];
  clenove: DopadClena[];
}

export function souhrnDopadu(zmeny: Pick<ZmenaRadku, 'uid'>[], clenove: DopadClena[]): SouhrnDopadu {
  const dotceni = clenove.filter(c => c.po !== c.pred);
  return {
    zaznamu: zmeny.length,
    lidi: new Set([...zmeny.map(z => z.uid), ...dotceni.map(c => c.uid)]).size,
    celkem: dotceni.reduce((a, c) => a + (c.po - c.pred), 0),
    doMinusu: clenove.filter(c => c.po < 0 && c.po < c.pred && c.pred >= 0),
    clenove: dotceni,
  };
}
