// Rozklik dne napříč aplikací: cokoli, co ukazuje den (řádek v seznamu, buňka kalendáře, štítek v rozvrhu),
// zavolá `otevriDen('2026-10-06', 'finance')` a plocha stránky otevře detail dne (DenHost → DenDetail).
//
// Přes událost okna, ne přes props: tatáž komponenta se kreslí na Přehledu, ve Financích, v Uzávěrkách i v galerii
// a každý z těch layoutů patří jinému balíku — událost nevyžaduje protahovat nic desítkou vrstev
// (stejný důvod jako NavigaceKontext u widgetů).

/** Odkud se den otevřel; podle toho se řadí oddíly detailu (co je zrovna důležité jako první). */
export type ZdrojDne = 'finance' | 'uzaverky' | 'obecne';

export const UDALOST_OTEVRI_DEN = 'managero:otevri-den';

export interface DetailOtevreniDne { den: string; zdroj: ZdrojDne }

/** Platné „RRRR-MM-DD"? Cokoli jiného se tiše zahodí (detail s nesmyslným dnem by jen ukázal prázdno). */
export const jeDen = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

export function otevriDen(den: string, zdroj: ZdrojDne = 'obecne'): void {
  if (typeof window === 'undefined' || !jeDen(den)) return;
  window.dispatchEvent(new CustomEvent<DetailOtevreniDne>(UDALOST_OTEVRI_DEN, { detail: { den, zdroj } }));
}
