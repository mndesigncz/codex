// Seznam na skle a jeho řádek (směr A): skleněný kontejner `.lgx` s rádiusem 22, řádky 66 px
// oddělené vlasovou linkou; vlevo jamka s ikonou (nebo vlastní prvek: datum, počet bodů),
// uprostřed titulek 15/600 a popis 13, vpravo hodnota nebo akce, šipka u odkazu. Blur nese
// kontejner, řádky ne. Řádek je odkaz (`href`), tlačítko (`onClick`) nebo jen obsah.

import Link from 'next/link';
import { Icon } from '../../Icons';

export function Seznam({ children, ariaLabel, className = '', id }: { children: React.ReactNode; ariaLabel?: string; className?: string; id?: string }) {
  return <ul id={id} aria-label={ariaLabel} className={`lgx hp-sklo hp-seznam ${className}`}>{children}</ul>;
}

export interface RadekProps {
  /** Ikona v jamce 38 (jméno z components/Icons). */
  ikona?: string;
  /** Vlastní prvek vlevo místo jamky (datum, „150 bodů“, monogram). */
  vlevo?: React.ReactNode;
  titulek: React.ReactNode;
  popis?: React.ReactNode;
  /** Vpravo: hodnota, stav nebo tlačítko (pozor: tlačítko jen u řádku bez href/onClick). */
  vpravo?: React.ReactNode;
  /** Šipka vpravo (výchozí: u odkazu a tlačítka ano). */
  sipka?: boolean;
  href?: string;
  /** Odkaz ven (nová karta, rel noopener). */
  ven?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
  /** Zarovnání nahoru (víceřádkový obsah, otevírací doba). */
  nahoru?: boolean;
  className?: string;
  /** Obal řádku: `li` v Seznamu (výchozí), jinak `div`. */
  as?: 'li' | 'div';
}

export function Radek({ ikona, vlevo, titulek, popis, vpravo, sipka, href, ven, onClick, ariaLabel, nahoru, className = '', as = 'li' }: RadekProps) {
  const sip = sipka ?? !!(href || onClick);
  const obsah = (
    <>
      {vlevo ?? (ikona ? <span className="hp-jamka" aria-hidden><Icon name={ikona} size={18} strokeWidth={1.6} /></span> : null)}
      <span className="hp-radek-telo">
        <span className="hp-silny block">{titulek}</span>
        {popis != null && popis !== '' && <span className="hp-meta block mt-0.5">{popis}</span>}
      </span>
      {vpravo != null && <span className="shrink-0 text-right">{vpravo}</span>}
      {sip && <span className="hp-sipka" aria-hidden><Icon name="chevronRight" size={18} strokeWidth={1.6} /></span>}
    </>
  );
  const cls = `hp-radek ${nahoru ? '!items-start' : ''} ${className}`;
  const prvek = href
    ? (ven
      ? <a href={href} target="_blank" rel="noopener noreferrer" className={cls} aria-label={ariaLabel}>{obsah}</a>
      : <Link href={href} className={cls} aria-label={ariaLabel}>{obsah}</Link>)
    : onClick
      ? <button type="button" onClick={onClick} className={cls} aria-label={ariaLabel}>{obsah}</button>
      : <div className={cls} aria-label={ariaLabel}>{obsah}</div>;
  return as === 'li' ? <li>{prvek}</li> : prvek;
}
