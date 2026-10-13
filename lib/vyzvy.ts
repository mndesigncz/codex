// Týmová výzva (kolo 8, balík R8-3): společný cíl s ukazatelem postupu.
//
// Odměny byly čistě individuální (žebříček, úrovně, katalog). Vedení teď vyhlásí
// „tento týden 5 uzávěrek bez manka → pizza pro tým", widget Výzva týdne ukáže
// „3 z 5 uzávěrek · zbývají 2 dny" a po splnění dostanou všichni oznámení a body
// (reward_challenges; vyhodnocení při načtení, žádný cron navíc — Kudos / 7shifts
// Engage mají týmové cíle a „point banks" na podobném principu). Měřítko je vždy
// z hotových čísel podniku: uzávěrky bez manka, splněné úkoly, průměrné hodnocení
// hostů, tržba období. Čistá logika tady, SQL v app/api/rewards/challenges/route.ts.

export type MetrikaVyzvy = 'uzaverky_bez_manka' | 'ukoly' | 'hodnoceni_hostu' | 'trzba';
export const METRIKY: MetrikaVyzvy[] = ['uzaverky_bez_manka', 'ukoly', 'hodnoceni_hostu', 'trzba'];

export const MAX_NAZEV_VYZVY = 80;
export const MAX_ODMENA_TEXT = 200;
export const MAX_ODMENA_BODY = 500;
/** Nejdelší výzva (dní) — měsíc a kousek; delší by nikdo nesledoval. */
export const MAX_DNI_VYZVY = 62;

export interface Vyzva {
  id: number;
  nazev: string;
  metrika: MetrikaVyzvy;
  cil: number;
  od: string;
  do: string;
  odmenaText: string | null;
  odmenaBody: number | null;
  splnenoAt: string | null;
  /** Aktuální hodnota měřítka za období (server dopočítá). */
  hodnota: number;
}

export interface NovaVyzva {
  nazev: string;
  metrika: MetrikaVyzvy;
  cil: number;
  od: string;
  do: string;
  odmenaText: string | null;
  odmenaBody: number | null;
}

const jeDen = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const dniMezi = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

/** Tělo POST → vyčištěná výzva, nebo česky, co je špatně (400). */
export function vycistiVyzvu(raw: unknown): { ok: true; vyzva: NovaVyzva } | { ok: false; chyba: string } {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const nazev = String(b.nazev ?? '').trim().slice(0, MAX_NAZEV_VYZVY);
  if (!nazev) return { ok: false, chyba: 'Výzva potřebuje název.' };
  const metrika = String(b.metrika ?? '') as MetrikaVyzvy;
  if (!METRIKY.includes(metrika)) return { ok: false, chyba: 'Vyber, co se počítá.' };
  const cil = Number(b.cil);
  if (!Number.isFinite(cil) || cil <= 0) return { ok: false, chyba: 'Cíl musí být kladné číslo.' };
  if (metrika === 'hodnoceni_hostu' && cil > 5) return { ok: false, chyba: 'Hodnocení hostů je nejvýš 5 hvězd.' };
  const od = b.od, doD = b.do;
  if (!jeDen(od) || !jeDen(doD)) return { ok: false, chyba: 'Vyplň od kdy do kdy výzva platí.' };
  if (doD < od) return { ok: false, chyba: 'Konec výzvy je před začátkem.' };
  if (dniMezi(od, doD) + 1 > MAX_DNI_VYZVY) return { ok: false, chyba: `Výzva může trvat nejvýš ${MAX_DNI_VYZVY} dní.` };
  const odmenaText = String(b.odmenaText ?? '').trim().slice(0, MAX_ODMENA_TEXT) || null;
  const bodyRaw = b.odmenaBody;
  const odmenaBody = bodyRaw === null || bodyRaw === undefined || bodyRaw === '' ? null : Math.round(Number(bodyRaw));
  if (odmenaBody != null && (!Number.isFinite(odmenaBody) || odmenaBody < 0 || odmenaBody > MAX_ODMENA_BODY)) return { ok: false, chyba: `Body každému musí být 0 až ${MAX_ODMENA_BODY}.` };
  if (!odmenaText && !odmenaBody) return { ok: false, chyba: 'Napiš odměnu, nebo dej body každému.' };
  return { ok: true, vyzva: { nazev, metrika, cil: metrika === 'hodnoceni_hostu' ? Math.round(cil * 10) / 10 : Math.round(cil), od, do: doD, odmenaText, odmenaBody: odmenaBody || null } };
}

export interface PostupVyzvy {
  /** 0–100 */
  procento: number;
  /** Dní do konce včetně dneška; 0 = dnes poslední den; záporné = skončila. */
  zbyvaDni: number;
  /** Ještě nezačala. */
  predZacatkem: boolean;
  splneno: boolean;
  /** Skončila bez splnění. */
  propadla: boolean;
}

/** Postup výzvy k dnešnímu dni; splněno = hodnota ≥ cíl (hodnocení hostů i tržba se počítají za celé období). */
export function postupVyzvy(v: Pick<Vyzva, 'cil' | 'od' | 'do' | 'hodnota' | 'splnenoAt'>, dnes: string): PostupVyzvy {
  const splneno = !!v.splnenoAt || v.hodnota >= v.cil;
  const zbyvaDni = dniMezi(dnes, v.do);
  return {
    procento: v.cil > 0 ? Math.max(0, Math.min(100, Math.round((v.hodnota / v.cil) * 100))) : 0,
    zbyvaDni,
    predZacatkem: dnes < v.od,
    splneno,
    propadla: !splneno && dnes > v.do,
  };
}

/** Výzvy k zobrazení ve widgetu: běžící a nedávno skončené (do 7 dnů), nejbližší konec první. */
export function vyzvyKZobrazeni<T extends Pick<Vyzva, 'od' | 'do'>>(vyzvy: readonly T[], dnes: string): T[] {
  return vyzvy
    .filter(v => dniMezi(v.do, dnes) <= 7)
    .sort((a, b) => a.do.localeCompare(b.do) || a.od.localeCompare(b.od));
}

/** Odpověď GET /api/rewards/challenges ve tvaru, který widget kreslí; nečekaný tvar je chyba. */
export function vyberVyzvy(raw: any): Vyzva[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.vyzvy)) throw new Error('Výzvy přišly v nečekaném tvaru.');
  return raw.vyzvy.map((v: any): Vyzva => ({
    id: Number(v.id), nazev: String(v.nazev ?? ''), metrika: (METRIKY.includes(v.metrika) ? v.metrika : 'ukoly') as MetrikaVyzvy,
    cil: Number(v.cil) || 0, od: String(v.od ?? ''), do: String(v.do ?? ''),
    odmenaText: v.odmenaText ?? null, odmenaBody: v.odmenaBody == null ? null : Number(v.odmenaBody),
    splnenoAt: v.splnenoAt ?? null, hodnota: Number(v.hodnota) || 0,
  }));
}
