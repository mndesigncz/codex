'use client';

// Inkoustová karta podniku jako fyzický předmět v peněžence (směr A). Jedna hlavička pro všechny
// varianty: monogram 36 na krému · jméno 15/600 · popis 12 · hodnota vpravo tabulárními číslicemi.
//
//  · `zasunuta` — jen hlavička (zadní karty v balíčku, poukaz v seznamu, náhled „+2 karty“);
//  · `predni`   — 214 px: hlavička, velké tenké číslo „7 / 10“ se štítkem a lišta razítek;
//  · `otevrena` — totéž s koly razítek (26 px) a místem pro šipku dál; nad QR a kódem.
//
// Tvář podniku = krémová textura (kruhy / koleje / tečky) podle slugu, nikdy barva značky.
// Odkaz (`href`), tlačítko (`onClick`) nebo jen plocha; uvnitř tlačítka jsou jen <span>.

import Link from 'next/link';
import Monogram from './Monogram';
import { tvarPodniku } from './monogram';
import { ListaRazitek, RazitkaKolecka, ListaPostupu } from './ListaRazitek';

export type VariantaKarty = 'zasunuta' | 'predni' | 'otevrena';

export interface InkoustovaKartaProps {
  varianta?: VariantaKarty;
  nazev: string;
  /** Slug podniku: určuje texturu a monogram (bez něj název). */
  klic?: string | null;
  logoUrl?: string | null;
  /** Druhý řádek hlavičky („Body · Zlatý host“). */
  popis?: React.ReactNode;
  /** Hodnota vpravo v hlavičce („340 b.“, „3 / 8“, „+2 karty“). */
  hodnota?: React.ReactNode;
  /** Vlastní prvek vpravo místo hodnoty (šipka, menu). */
  vpravo?: React.ReactNode;
  /** Bez monogramu (např. „Moje karta“ na stránce podniku). */
  bezMonogramu?: boolean;
  /** Velké tenké číslo (přední a otevřená karta). */
  cislo?: React.ReactNode;
  /** Za číslem menším tenkým písmem („/ 10“). */
  z?: React.ReactNode;
  /** Štítek za číslem („ještě 3 do Cappuccina zdarma“). */
  stitek?: React.ReactNode;
  /** Razítka (dílky na přední, kolečka na otevřené kartě). */
  razitka?: { pocet: number; cil: number; popis: string; noveOd?: number | null; ceka?: boolean } | null;
  /** Souvislá lišta (body k další odměně), `podil` 0–1. */
  postup?: { podil: number; popis: string; ceka?: boolean } | null;
  href?: string;
  onClick?: () => void;
  /** Celá věta pro odečítač (na odkazu / tlačítku). */
  ariaLabel?: string;
  ariaExpanded?: boolean;
  ariaControls?: string;
  className?: string;
  style?: React.CSSProperties;
  /** Další obsah pod hlavičkou (vlastní řádky karty). */
  children?: React.ReactNode;
}

/** Hlavička karty: monogram, jméno s popisem, hodnota vpravo. Samostatně ji použije i řádek poukazu. */
export function HlavickaKarty({ nazev, klic, logoUrl, popis, hodnota, vpravo, bezMonogramu }: Pick<InkoustovaKartaProps, 'nazev' | 'klic' | 'logoUrl' | 'popis' | 'hodnota' | 'vpravo' | 'bezMonogramu'>) {
  return (
    <span className="hp-karta-hlava">
      {!bezMonogramu && <Monogram nazev={nazev} klic={klic} logoUrl={logoUrl} />}
      <span className="hp-karta-jmeno">
        <b>{nazev}</b>
        {popis ? <span>{popis}</span> : null}
      </span>
      {vpravo ?? (hodnota != null && hodnota !== '' ? <span className="hp-karta-hodnota">{hodnota}</span> : null)}
    </span>
  );
}

export default function InkoustovaKarta(p: InkoustovaKartaProps) {
  const varianta = p.varianta ?? 'predni';
  const tvar = tvarPodniku(p.klic || p.nazev);
  const plna = varianta !== 'zasunuta';
  const obsah = (
    <>
      <span className={`hp-tex hp-tex-${tvar}`} aria-hidden />
      <HlavickaKarty nazev={p.nazev} klic={p.klic} logoUrl={p.logoUrl} popis={p.popis} hodnota={p.hodnota} vpravo={p.vpravo} bezMonogramu={p.bezMonogramu} />
      {plna && p.cislo != null && (
        <span className="hp-karta-stred">
          <span className="hp-cislo">{p.cislo}</span>
          {p.z != null && <span className="hp-karta-z">{p.z}</span>}
          {p.stitek != null && <span className="hp-karta-stitek">{p.stitek}</span>}
        </span>
      )}
      {plna && p.razitka && (varianta === 'otevrena'
        ? <RazitkaKolecka pocet={p.razitka.pocet} cil={p.razitka.cil} popis={p.razitka.popis} noveOd={p.razitka.noveOd ?? null} ceka={p.razitka.ceka} />
        : <ListaRazitek pocet={p.razitka.pocet} cil={p.razitka.cil} popis={p.razitka.popis} ceka={p.razitka.ceka} />)}
      {plna && !p.razitka && p.postup && <ListaPostupu podil={p.postup.podil} popis={p.postup.popis} ceka={p.postup.ceka} />}
      {p.children}
    </>
  );
  const cls = `hp-karta hp-karta-${varianta} ${p.className ?? ''}`;
  if (p.href) return <Link href={p.href} className={cls} style={p.style} aria-label={p.ariaLabel}>{obsah}</Link>;
  if (p.onClick) return (
    <button type="button" onClick={p.onClick} className={cls} style={p.style} aria-label={p.ariaLabel} aria-expanded={p.ariaExpanded} aria-controls={p.ariaControls}>{obsah}</button>
  );
  return <div className={cls} style={p.style} aria-label={p.ariaLabel} role={p.ariaLabel ? 'group' : undefined}>{obsah}</div>;
}
