// Rejstřík právních a podpůrných dokumentů. Texty jsou po dokumentech v
// lib/pravni/dokumenty/*.ts (česky i anglicky), čísla a lhůty společné všem
// dokumentům v lib/pravni/lhuty.ts, údaje provozovatele v lib/firma.ts.
//
// Texty jsou napsané podle toho, co kód skutečně dělá (komentáře u každého
// dokumentu říkají, odkud). Body, kde zákon není jednoznačný, jsou
// v konzervativní variantě a jejich seznam k ověření advokátem je v docs/PRAVNI.md
// — na stránkách se nepíše „návrh" ani „ověřit".
//
// Při věcné změně textu zvyš VERZE_PODMINEK / VERZE_ZASAD (lib/pravni/verze.ts)
// a UCINNOST (lib/pravni/lhuty.ts); brána NovaVerze pak požádá o nový souhlas.

import type { Firma } from '../firma.ts';
import type { Dokument, Jazyk, Zdroj } from './dokumenty/typy.ts';
import type { KlicDokumentu } from './odkazy.ts';
import { obchodniPodminkyCs, obchodniPodminkyEn } from './dokumenty/obchodniPodminky.ts';
import { zpracovatelskaSmlouvaCs, zpracovatelskaSmlouvaEn } from './dokumenty/zpracovatelskaSmlouva.ts';
import { subzpracovateleCs, subzpracovateleEn } from './dokumenty/subzpracovatele.ts';
import { zruseniPredplatnehoCs, zruseniPredplatnehoEn } from './dokumenty/zruseniPredplatneho.ts';
import { podminkyCs, podminkyEn } from './dokumenty/podminky.ts';
import { soukromiCs, soukromiEn } from './dokumenty/soukromi.ts';
import { podporaCs, podporaEn } from './dokumenty/podpora.ts';
import { smazatCs, smazatEn } from './dokumenty/smazatUcet.ts';
import { informaceCs, informaceEn } from './dokumenty/informaceProZamestnance.ts';

export type { Dokument, Jazyk, Sekce } from './dokumenty/typy.ts';
export { KLICE_DOKUMENTU, ODKAZY_PRAVNI, cestaDokumentu, type KlicDokumentu } from './odkazy.ts';

const ZDROJE: Record<KlicDokumentu, Record<Jazyk, Zdroj>> = {
  'obchodni-podminky': { cs: obchodniPodminkyCs, en: obchodniPodminkyEn },
  'zpracovatelska-smlouva': { cs: zpracovatelskaSmlouvaCs, en: zpracovatelskaSmlouvaEn },
  subzpracovatele: { cs: subzpracovateleCs, en: subzpracovateleEn },
  'zruseni-predplatneho': { cs: zruseniPredplatnehoCs, en: zruseniPredplatnehoEn },
  podminky: { cs: podminkyCs, en: podminkyEn },
  soukromi: { cs: soukromiCs, en: soukromiEn },
  podpora: { cs: podporaCs, en: podporaEn },
  'smazat-ucet': { cs: smazatCs, en: smazatEn },
  'informace-pro-zamestnance': { cs: informaceCs, en: informaceEn },
};

export function dokument(klic: KlicDokumentu, jazyk: Jazyk, f: Firma): Dokument {
  return ZDROJE[klic][jazyk](f);
}

/** Titulek stránky (metadata) — z dokumentu, ať se nerozejde s nadpisem. */
export function titulekDokumentu(klic: KlicDokumentu, jazyk: Jazyk, f: Firma): string {
  return `${dokument(klic, jazyk, f).titulek} · Managero`;
}
