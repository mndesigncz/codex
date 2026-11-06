'use client';

// Balíček karet (Wallet stack, směr A): zadní karty zasunuté — kouká z nich jen hlavička
// (62 px) —, přední karta vysunutá celá s velkým číslem a lištou razítek. Ťuk na kteroukoli
// kartu = `onOtevri(index)` (otevřená karta přes celou obrazovku řeší obrazovka Domů).
// Plus náhled „ostatní karty zasunuté dole“ pod otevřenou kartou (ZasunuteKarty).

import InkoustovaKarta, { type InkoustovaKartaProps } from './InkoustovaKarta';
import { tvarPodniku } from './monogram';

export type KartaVBalicku = Omit<InkoustovaKartaProps, 'varianta' | 'onClick' | 'href'> & { id: string | number; href?: string };

export interface BalicekKaretProps {
  karty: KartaVBalicku[];
  /** Index přední karty (výchozí poslední). Ostatní zůstanou v pořadí nad ní. */
  predni?: number;
  onOtevri?: (index: number) => void;
  /** Jméno seznamu pro odečítač („Moje karty“). */
  popis: string;
  className?: string;
}

export default function BalicekKaret({ karty, predni, onOtevri, popis, className = '' }: BalicekKaretProps) {
  if (!karty.length) return null;
  const iPredni = predni != null && predni >= 0 && predni < karty.length ? predni : karty.length - 1;
  const poradi = [...karty.map((_, i) => i).filter(i => i !== iPredni), iPredni];
  return (
    <ul className={`hp-balicek ${className}`} aria-label={popis}>
      {poradi.map(i => {
        const k = karty[i];
        const jePredni = i === iPredni;
        const { id, href, ...zbytek } = k;
        return (
          <li key={id} className={jePredni ? 'hp-predni' : 'hp-zadni'}>
            <InkoustovaKarta {...zbytek} varianta={jePredni ? 'predni' : 'zasunuta'}
              href={onOtevri ? undefined : href} onClick={onOtevri ? () => onOtevri(i) : undefined} />
          </li>
        );
      })}
    </ul>
  );
}

/** Ostatní karty zasunuté dole pod otevřenou kartou: dvě hrany karet, hlavička té nejbližší a „+N karty“. */
export function ZasunuteKarty({ karty, popis, hodnota, onClick, ariaLabel, className = '' }: {
  karty: { nazev: string; klic?: string | null; logoUrl?: string | null }[];
  /** Pod jménem („a Čajovna Pangea“). */
  popis?: React.ReactNode;
  /** Vpravo („+2 karty“). */
  hodnota?: React.ReactNode;
  onClick?: () => void;
  ariaLabel: string;
  className?: string;
}) {
  if (!karty.length) return null;
  const [prvni, druha] = karty;
  // Druhá hrana vzadu jen tehdy, když jsou zasunuté aspoň dvě karty.
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} className={`hp-zasunute ${druha ? '' : 'hp-zasunute-jedna'} ${className}`}>
      {druha && <span className="hp-karta" aria-hidden><span className={`hp-tex hp-tex-${tvarPodniku(druha.klic || druha.nazev)}`} /></span>}
      <InkoustovaKarta varianta="zasunuta" nazev={prvni.nazev} klic={prvni.klic} logoUrl={prvni.logoUrl} popis={popis} hodnota={hodnota} />
    </button>
  );
}
