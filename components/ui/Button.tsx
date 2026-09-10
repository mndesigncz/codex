'use client';

import React from 'react';
import { Icon } from '../Icons';

// Jedno tlačítko pro celou aplikaci.
//
// Dřív měl každý obraz svoje: Přehled černé, Sklad limetkové, Rozvrh obojí
// vedle sebe, k tomu osm variant výplně a písma. Tady platí jediné pravidlo:
//   accent   = limetka, JEDNA hlavní akce na obrazovce („Uložit", „Přidat")
//   primary  = tmavá, silná vedlejší akce nebo potvrzení v modálu
//   secondary= sklo, běžná akce
//   ghost    = jen text, akce v řádku seznamu
//   danger   = červená, mazání — výplň až po potvrzení
// Vybraný stav (záložka, položka menu) je tmavá, ale to není tlačítko.

export type ButtonVariant = 'accent' | 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  accent: 'bg-[#C8F542] text-[#16181A] hover:brightness-105 shadow-[0_6px_18px_rgba(200,245,66,0.35)]',
  primary: 'bg-[#16181A] text-white hover:bg-black',
  secondary: 'glass border border-black/10 text-[#16181A] hover:bg-black/[0.05]',
  ghost: 'text-black/60 hover:text-[#16181A] hover:bg-black/[0.05]',
  danger: 'text-red-600 hover:bg-red-500/[0.08]',
  'danger-solid': 'bg-red-600 text-white hover:brightness-110',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-xs gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-12 px-6 text-[15px] gap-2',
};

// Kulaté tlačítko jen s ikonou má stejné výšky, ale je čtvercové.
const ICON_ONLY: Record<ButtonSize, string> = { sm: 'h-9 w-9 px-0', md: 'h-11 w-11 px-0', lg: 'h-12 w-12 px-0' };

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
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F542] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F1F3ED]',
        VARIANT[variant],
        iconOnly ? ICON_ONLY[size] : SIZE[size],
        block ? 'w-full sm:w-auto' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {loading ? (
        <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden />
      ) : icon ? (
        <Icon name={icon} size={iconSize} className="shrink-0" />
      ) : null}
      {!iconOnly && children}
      {!loading && iconAfter && <Icon name={iconAfter} size={iconSize} className="shrink-0" />}
    </button>
  );
});

export default Button;
