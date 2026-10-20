'use client';

import React from 'react';
import { Icon } from '../Icons';

// Jedno tlačítko pro celou aplikaci.
//
// Dřív měl každý obraz svoje: Přehled černé, Sklad limetkové, Rozvrh obojí
// vedle sebe, k tomu osm variant výplně a písma. Tady platí jediné pravidlo:
//   accent   = limetka, JEDNA hlavní akce na obrazovce („Uložit", „Přidat")
//   primary  = tmavá, silná vedlejší akce nebo potvrzení v modálu
//   secondary= jemně šedá pilulka, běžná akce
//   ghost    = jen text, akce v řádku seznamu
//   danger   = červená, mazání — výplň až po potvrzení
// Vybraný stav (záložka, položka menu) je tmavá, ale to není tlačítko.

export type ButtonVariant = 'accent' | 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid';
export type ButtonSize = 'sm' | 'md' | 'lg';

// v3: limetka bez záře (pozná se barvou, ne svitem), sekundární = jemně
// šedá pilulka bez rámečku (rámeček průhledný, ať se rozměr nemění).
const VARIANT: Record<ButtonVariant, string> = {
  accent: 'bg-[#C8F542] on-accent hover:brightness-105',
  primary: 'bg-[#16181A] text-white hover:bg-black',
  // Explicitní výplň, ne `glass`: preflight dává <button> průhledné pozadí s vyšší specifičností než :where(.glass).
  secondary: 'bg-black/[0.05] border border-transparent text-[#16181A] hover:bg-black/[0.08]',
  ghost: 'text-black/60 hover:text-[#16181A] hover:bg-black/[0.05]',
  danger: 'text-bad-ink hover:bg-bad/[0.08]',
  'danger-solid': 'bg-bad text-white hover:brightness-110',
};

// Tři výšky: 36 (v řádku), 44 (běžná), 52 (hlavní akce dole přes šířku).
const SIZE: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-[13px] gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-[3.25rem] px-7 text-base gap-2',
};

// Kulaté tlačítko jen s ikonou má stejné výšky, ale je čtvercové. `shrink-0`: vedle pole (`w-full`)
// v řádku by se jinak smrštilo — na 320 px z 36 na 25 px široký „Vložit bod" a „Odebrat bod" v úkolu,
// tedy ne čtverec a hůř trefitelné.
const ICON_ONLY: Record<ButtonSize, string> = { sm: 'h-9 w-9 px-0 shrink-0', md: 'h-11 w-11 px-0 shrink-0', lg: 'h-[3.25rem] w-[3.25rem] px-0 shrink-0' };

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
  /** Ikona za textem místo před ním. */
  iconAfter?: string;
  loading?: boolean;
  /** Na mobilu přes celou šířku — u hlavní akce formuláře. */
  block?: boolean;
  /** Jen ikona; `aria-label` je pak povinný. */
  iconOnly?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, iconAfter, loading, block, iconOnly, className = '', children, disabled, type = 'button', ...rest },
  ref,
) {
  const iconSize = size === 'sm' ? 15 : 18;
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        'inline-flex items-center justify-center rounded-full font-semibold whitespace-nowrap select-none',
        'transition disabled:opacity-45 disabled:cursor-not-allowed disabled:shadow-none',
        // Mezera mezi tlačítkem a prstencem fokusu má barvu plochy, na které
        // tlačítko stojí. Dřív to byl pevný starý odstín papíru #F1F3ED: na bílé
        // kartě kreslil šedý proužek a v tmavém režimu světlý. `--surface` je
        // bílá karta ve světlém a tmavá karta v tmavém režimu.
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F542] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]',
        VARIANT[variant],
        iconOnly ? ICON_ONLY[size] : SIZE[size],
        block ? 'w-full sm:w-auto' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {loading ? (
        <span className="spinner spinner-sm" aria-hidden />
      ) : icon ? (
        <Icon name={icon} size={iconSize} className="shrink-0" />
      ) : null}
      {!iconOnly && children}
      {!loading && iconAfter && <Icon name={iconAfter} size={iconSize} className="shrink-0" />}
    </button>
  );
});

export default Button;
