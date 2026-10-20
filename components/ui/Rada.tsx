import React from 'react';

// Stavebnice skladby v4 (spec-skladba P1–P3, P7, P13).
//
// Inspirace mají jednu mřížku a čtyři výšky: každý prvek buď stojí od levé
// hrany obsahu L k pravé R, nebo patří do ŘADY, která tu šířku vyplní, a v jedné
// řadě mají všechny prvky stejnou výšku. Managero skládalo ovládání podle délky
// textu (čip 99, tlačítko 148, výběr 187 pod sebou → pět pravých hran, čtyři
// výšky). Tyhle dvě komponenty to dělají za autora:
//
//   <Rada>          řada L→R: rovné díly (2 × ½, 3 × ⅓) nebo pružný + pevný vpravo;
//                   všechny díly stejně vysoké (vyska 36 / 44 / 52), mezera 8.
//   <Sloupec>       skupiny pod sebou s mezerou ze škály (gap, ne mt-* v obsahu):
//                   12 uvnitř skupiny, 24 mezi skupinami, 16 pole ↔ pole ve formuláři.
//
// Dlouhý popisek (němčina, polština) se zalomí UVNITŘ dílu — díl se nikdy
// neroztáhne přes R. Třídy `.rada*` a `.sloupec*` žijí v app/globals.css, takže
// je smí použít i ručně psaný kód (`<div className="rada rada-rovne rada-s">`).

export type VyskaRady = 's' | 'm' | 'l';
type Mezera = 1 | 2 | 3 | 4 | 5 | 6 | 8;

const VYSKA: Record<VyskaRady, string> = { s: 'rada-s', m: 'rada-m', l: 'rada-l' };

/**
 * Řada ovládání, která vyplní šířku L→R.
 *
 * - `deleni="rovne"` (výchozí): každý přímý potomek `flex: 1 1 0` → 2 × ½, 3 × ⅓.
 * - `deleni="pruzne"`: první potomek pružný (pole, titul, segment), ostatní obsahová šířka
 *   zarovnaná na R (toolbar `[🔍 Hledat… flex:1] 8 [Filtry]`, titul + akce).
 * - `vyska`: s = 36 (filtr, segment v kartě), m = 44 (toolbar, akce), l = 52 (hlavní akce, patička okna).
 *   Výška platí pro KAŽDÝ přímý potomek (tlačítko, pole, výběr) — v řadě jedna výška (P7).
 */
export function Rada({ children, deleni = 'rovne', vyska, mezera = 2, className = '', as: Tag = 'div', ...rest }: {
  children: React.ReactNode;
  deleni?: 'rovne' | 'pruzne';
  vyska?: VyskaRady;
  /** Mezera mezi díly ze škály (×4 px). Výchozí 8; velké dlaždice 12. */
  mezera?: 2 | 3;
  className?: string;
  as?: 'div' | 'ul' | 'li' | 'footer' | 'nav';
} & Omit<React.HTMLAttributes<HTMLElement>, 'className' | 'children'>) {
  const tridy = ['rada', deleni === 'pruzne' ? 'rada-pruzna' : 'rada-rovne', vyska ? VYSKA[vyska] : '', mezera === 3 ? 'rada-mezera-3' : '', className]
    .filter(Boolean).join(' ');
  return <Tag className={tridy} {...(rest as React.HTMLAttributes<HTMLElement>)}>{children}</Tag>;
}

/**
 * Skupiny pod sebou s jednou mezerou ze škály (gap) místo `mt-*` v obsahu.
 * `mezera` je krok škály ×4 px: 3 = 12 (uvnitř skupiny), 4 = 16 (pole ↔ pole), 6 = 24 (mezi skupinami).
 */
export function Sloupec({ children, mezera = 3, className = '', as: Tag = 'div', ...rest }: {
  children: React.ReactNode;
  mezera?: Mezera;
  className?: string;
  as?: 'div' | 'section' | 'form' | 'ul' | 'fieldset';
} & Omit<React.HTMLAttributes<HTMLElement>, 'className' | 'children'>) {
  return <Tag className={`sloupec sloupec-${mezera} ${className}`} {...(rest as React.HTMLAttributes<HTMLElement>)}>{children}</Tag>;
}

export default Rada;
