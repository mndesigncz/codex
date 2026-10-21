// Společné typy a pomůcky právních dokumentů (lib/pravni/dokumenty/*).
//
// Odkazy v textu: `[[cesta|text]]`, kde cesta je klíč dokumentu (obchodni-podminky…),
// `nahlasit`, nebo cesta začínající lomítkem (/#cenik). Komponenta PravniStranka z nich
// udělá odkazy (u anglické verze na /en/…); e-mail a telefon provozovatele se
// prolinkují samy. Kotvy sekcí jsou `id` sekce (/soukromi#smazani).

import type { Firma } from '../../firma.ts';
import { identifikace } from '../../firma.ts';

export type Jazyk = 'cs' | 'en';

export interface Sekce {
  id: string;
  h: string;
  /** Odstavce před seznamem. */
  p?: string[];
  li?: string[];
  /** Odstavce za seznamem. */
  po?: string[];
}

export interface Dokument {
  titulek: string;
  uvod: string;
  /** Datum účinnosti nebo poslední úpravy (lidsky). */
  aktualizace: string;
  sekce: Sekce[];
  /** Ukázat nahoře obsah s kotvami (dlouhé dokumenty). */
  obsah?: boolean;
}

export type Zdroj = (f: Firma) => Dokument;

/** Plná identifikace provozovatele jako smluvní strany (§ 435 OZ). */
export function provozovatel(f: Firma, jazyk: Jazyk): string {
  return jazyk === 'en'
    ? `${f.nazev}, company ID (IČO) ${f.ico}, with registered office at ${f.adresa}, Czech Republic, ${f.zapisEn}`
    : `${f.nazev}, IČO ${f.ico}, se sídlem ${f.adresa}, ${f.zapis}`;
}

/** Kontakty provozovatele jednou větou. */
export function kontakty(f: Firma, jazyk: Jazyk): string {
  return jazyk === 'en'
    ? `email ${f.emailPodpory}, phone ${f.telefon}, postal address ${f.adresa}, Czech Republic`
    : `e-mail ${f.emailPodpory}, telefon ${f.telefon}, adresa ${f.adresa}`;
}

export { identifikace };
