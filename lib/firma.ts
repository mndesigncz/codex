// Údaje provozovatele pro právní stránky, patičky, e-maily a faktury — na JEDNOM místě.
//
// Rozhodnutí Martina (2026-10-21): Managero provozujeme na jeho IČO jako fyzická
// osoba podnikající. Výchozí hodnoty níž jsou jeho veřejné údaje z ARES a RŽP
// (ověřeno 21. 10. 2026); datum narození, které RŽP ukazuje, sem nepatří.
// Prostředí (Vercel → Environment Variables) je dál přebíjí:
//   FIRMA_NAZEV, FIRMA_ICO, FIRMA_ADRESA, FIRMA_EMAIL_PODPORY, FIRMA_TELEFON,
//   FIRMA_ZAPIS, FIRMA_DIC, FIRMA_PLATCE_DPH, FIRMA_TYP, FIRMA_REGION_DAT
// Přechod na s.r.o. = změnit výchozí hodnoty tady (nebo env), typ na
// 'pravnicka', zápis na obchodní rejstřík; texty se složí samy. Obchodní
// podmínky i zpracovatelská smlouva obsahují předem daný souhlas s postoupením
// smlouvy na nástupnickou společnost (lib/pravni/dokumenty/obchodniPodminky.ts).
//
// DPH: Martin není plátce DPH (ARES: stavZdrojeDph = NEEXISTUJICI). DIČ se
// doplní přes FIRMA_DIC, až ho finanční úřad přidělí (třeba jako identifikované
// osobě, § 6h ZDPH) — DIČ samo plátcovství neznamená, proto zvlášť
// FIRMA_PLATCE_DPH=1 jen po skutečné registraci plátce. Viz docs/PRAVNI.md.

export type TypProvozovatele = 'fyzicka' | 'pravnicka';

export interface Firma {
  nazev: string;
  ico: string;
  adresa: string;
  emailPodpory: string;
  /** Telefon pro zákazníky (§ 1820 odst. 1 písm. c) OZ u spotřebitelů, Stripe chce víc kanálů). */
  telefon: string;
  /** Údaj o zápisu do veřejného rejstříku nebo jiné evidence (§ 435 OZ), česky. */
  zapis: string;
  /** Tentýž údaj anglicky (anglické verze stránek jsou jen informativní). */
  zapisEn: string;
  /** DIČ, jen když je přidělené; jinak prázdné. */
  dic: string;
  /** Plátce DPH? Výchozí ne. */
  platceDph: boolean;
  typ: TypProvozovatele;
  /** Kde leží databáze a soubory. */
  regionDat: string;
  web: string;
}

/** Veřejné údaje provozovatele (ARES, RŽP, 21. 10. 2026) a kontakty zvolené Martinem. */
export const VYCHOZI = {
  nazev: 'Martin Nemeškal',
  ico: '17944953',
  adresa: 'Míru 482, 790 70 Javorník',
  emailPodpory: 'podpora@managero.app',
  telefon: '+420 727 960 413',
  zapis: 'zapsán v živnostenském rejstříku vedeném Městským úřadem Jeseník',
  zapisEn: 'registered in the Trade Register kept by the Municipal Office of Jeseník',
  regionDat: 'Evropská unie (databáze Neon v AWS eu-central-1, Frankfurt)',
} as const;

const hodnota = (env: string | undefined, vychozi: string) => (env ?? '').trim() || vychozi;

/** Údaje provozovatele: prostředí přebíjí výchozí hodnoty. */
export function firma(env: Record<string, string | undefined> = process.env): Firma {
  const typ: TypProvozovatele = (env.FIRMA_TYP ?? '').trim() === 'pravnicka' ? 'pravnicka' : 'fyzicka';
  const zapis = hodnota(env.FIRMA_ZAPIS, VYCHOZI.zapis);
  return {
    nazev: hodnota(env.FIRMA_NAZEV, VYCHOZI.nazev),
    ico: hodnota(env.FIRMA_ICO, VYCHOZI.ico),
    adresa: hodnota(env.FIRMA_ADRESA, VYCHOZI.adresa),
    emailPodpory: hodnota(env.FIRMA_EMAIL_PODPORY, VYCHOZI.emailPodpory),
    telefon: hodnota(env.FIRMA_TELEFON, VYCHOZI.telefon),
    zapis,
    // Vlastní zápis z prostředí anglicky neznáme — pak se ukáže česky (je to údaj z rejstříku).
    zapisEn: (env.FIRMA_ZAPIS ?? '').trim() ? zapis : VYCHOZI.zapisEn,
    dic: (env.FIRMA_DIC ?? '').trim(),
    platceDph: (env.FIRMA_PLATCE_DPH ?? '').trim() === '1',
    typ,
    regionDat: hodnota(env.FIRMA_REGION_DAT, VYCHOZI.regionDat),
    web: 'https://www.managero.app',
  };
}

/** Povinné údaje (§ 435 OZ a kontakt), které musí být vyplněné. */
const POVINNE: (keyof Firma)[] = ['nazev', 'ico', 'adresa', 'zapis', 'emailPodpory', 'telefon'];

/** Které povinné údaje chybějí nebo jsou zjevně neplatné (pro /api/health a kontrolu stránek). */
export function chybejiciUdaje(f: Firma = firma()): string[] {
  return POVINNE.filter(k => {
    const v = String(f[k] ?? '').trim();
    if (!v || /\{\{|\}\}/.test(v)) return true;
    if (k === 'ico') return !/^\d{8}$/.test(v);
    if (k === 'emailPodpory') return !jeEmail(v);
    return false;
  });
}

/** Je to e-mail, na který se dá odkázat přes mailto:? */
export function jeEmail(s: string): boolean {
  return /^[^@\s{}]+@[^@\s{}]+\.[^@\s{}]+$/.test(s);
}

/** Telefon pro odkaz tel: (jen číslice a +). */
export const telOdkaz = (telefon: string): string => `tel:${telefon.replace(/[^\d+]/g, '')}`;

/** Věta o DPH podle stavu: neplátce zůstává neplátcem i s DIČ identifikované osoby. */
export function vetaDph(f: Firma, jazyk: 'cs' | 'en' = 'cs'): string {
  if (f.platceDph) return jazyk === 'en' ? `VAT ID ${f.dic}` : `DIČ ${f.dic}`;
  const dic = f.dic ? (jazyk === 'en' ? `, VAT ID ${f.dic}` : `, DIČ ${f.dic}`) : '';
  return jazyk === 'en' ? `Not a VAT payer${dic}` : `Neplátce DPH${dic}`;
}

/**
 * Identifikace provozovatele jednou větou (§ 435 OZ) — patičky, e-maily, faktury.
 * „Managero provozuje Martin Nemeškal, IČO 17944953, Míru 482, 790 70 Javorník. Zapsán … Neplátce DPH."
 */
export function identifikace(f: Firma = firma(), jazyk: 'cs' | 'en' = 'cs'): string {
  const zapis = jazyk === 'en' ? f.zapisEn : f.zapis;
  const Zapis = zapis.charAt(0).toUpperCase() + zapis.slice(1);
  return jazyk === 'en'
    ? `Managero is operated by ${f.nazev}, company ID (IČO) ${f.ico}, ${f.adresa}, Czech Republic. ${Zapis}. ${vetaDph(f, 'en')}.`
    : `Managero provozuje ${f.nazev}, IČO ${f.ico}, ${f.adresa}. ${Zapis}. ${vetaDph(f, 'cs')}.`;
}

/** Krátká patička faktury Stripe (max. 5000 znaků, tady jedna řádka). */
export function patickaFaktury(f: Firma = firma()): string {
  return `${f.nazev}, IČO ${f.ico}, ${f.adresa}. ${f.zapis.charAt(0).toUpperCase() + f.zapis.slice(1)}. ${f.platceDph ? `DIČ ${f.dic}.` : `Nejsem plátce DPH.${f.dic ? ` DIČ ${f.dic}.` : ''}`} ${f.emailPodpory}`;
}
