// Vzhled platebních polí Stripe (Payment Element) v designu Manageru — Appearance API.
//
// Pole karty kreslí Stripe ve svém rámu (karta nikdy neprojde naším kódem), takže na ně
// naše CSS nedosáhne. Tady jsou tytéž tokeny jako v app/globals.css a DESIGN.md (v4):
// inkoust #16181A, limetkový prstenec fokusu, jamka pole bez rámečku, rádius 14, popisek
// 13/500, pole 52 jako každé pole formuláře v okně, písmo Geist. Tmavý režim podle
// `:root[data-theme="dark"]` (povrch okna #1E2124, text #EDF2E4).
//
// Písmo: Geist se do rámu Stripe načte z našeho původu (/fonts/Geist-Variable.woff2,
// hlavička CORS v next.config.js) — ne z Google Fonts, ať adresa člověka nejde třetí straně.
//
// Čistý modul (testy: scripts/testy/k95-vlastni-pokladna.ts).

import type { Appearance, CustomFontSource } from '@stripe/stripe-js';

export type Motiv = 'light' | 'dark';

/** Cesta k písmu pro rám Stripe; servíruje ho public/fonts s hlavičkou Access-Control-Allow-Origin. */
export const CESTA_PISMA = '/fonts/Geist-Variable.woff2';

const BARVY = {
  light: {
    povrch: '#FFFFFF', text: '#16181A', tlumeny: 'rgba(22,24,26,0.62)', popisek: 'rgba(22,24,26,0.70)',
    placeholder: 'rgba(22,24,26,0.42)', jamka: 'rgba(22,24,26,0.045)', jamkaHover: 'rgba(22,24,26,0.10)',
    linka: 'rgba(22,24,26,0.075)', chyba: '#991B1B', fokusPozadi: '#FFFFFF', primarni: '#16181A', ikona: 'rgba(22,24,26,0.55)',
  },
  dark: {
    povrch: '#1E2124', text: '#EDF2E4', tlumeny: 'rgba(237,242,228,0.66)', popisek: 'rgba(237,242,228,0.72)',
    placeholder: 'rgba(237,242,228,0.35)', jamka: 'rgba(255,255,255,0.06)', jamkaHover: 'rgba(255,255,255,0.12)',
    linka: 'rgba(255,255,255,0.10)', chyba: '#FF8A80', fokusPozadi: 'rgba(255,255,255,0.08)', primarni: '#C8F542', ikona: 'rgba(237,242,228,0.6)',
  },
} as const;

/** Limetkový prstenec fokusu (DESIGN.md: pole při psaní zbělá a dostane limetkový prstenec). */
const FOKUS_LINKA = '#9FC22A';
const FOKUS_STIN = '0 0 0 3px rgba(200,245,66,0.30)';

export function vzhledPokladny(motiv: Motiv): Appearance {
  const b = BARVY[motiv];
  return {
    theme: 'flat',
    variables: {
      fontFamily: 'Geist, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
      fontSizeBase: '15px',
      fontSizeSm: '13px',
      fontSizeXs: '12px',
      fontWeightNormal: '400',
      fontWeightMedium: '500',
      fontWeightBold: '600',
      fontLineHeight: '1.4',
      colorPrimary: b.primarni,
      colorBackground: b.povrch,
      colorText: b.text,
      colorTextSecondary: b.tlumeny,
      colorTextPlaceholder: b.placeholder,
      colorDanger: b.chyba,
      iconColor: b.ikona,
      borderRadius: '14px',
      // Rytmus 4/8/12/16: pole ↔ pole 16, sloupce 12, položky plateb 8.
      spacingUnit: '4px',
      gridRowSpacing: '16px',
      gridColumnSpacing: '12px',
      accordionItemSpacing: '8px',
      tabSpacing: '8px',
      focusBoxShadow: FOKUS_STIN,
      focusOutline: 'none',
    },
    rules: {
      // Pole 52 (formulář v okně): 15 × 1,4 = 21 + 2 × 14,5 + rámeček 2.
      '.Input': { backgroundColor: b.jamka, border: '1px solid transparent', boxShadow: 'none', padding: '14.5px 16px', color: b.text },
      '.Input:hover': { borderColor: b.jamkaHover },
      '.Input:focus': { backgroundColor: b.fokusPozadi, borderColor: FOKUS_LINKA, boxShadow: FOKUS_STIN },
      '.Input--invalid': { borderColor: b.chyba, boxShadow: 'none', color: b.text },
      '.Input::placeholder': { color: b.placeholder },
      '.Label': { fontSize: '13px', fontWeight: '500', color: b.popisek, marginBottom: '6px' },
      '.Error': { fontSize: '12px', color: b.chyba, marginTop: '6px' },
      '.AccordionItem': { backgroundColor: b.povrch, border: `1px solid ${b.linka}`, borderRadius: '14px', boxShadow: 'none', padding: '16px' },
      '.AccordionItem--selected': { borderColor: motiv === 'dark' ? 'rgba(255,255,255,0.22)' : 'rgba(22,24,26,0.22)', color: b.text },
      '.Tab': { backgroundColor: b.jamka, border: '1px solid transparent', boxShadow: 'none', borderRadius: '14px' },
      '.Tab:hover': { borderColor: b.jamkaHover },
      '.Tab--selected': { backgroundColor: b.povrch, borderColor: b.primarni, boxShadow: 'none' },
      '.TermsText': { fontSize: '12px', color: b.tlumeny },
      '.Block': { backgroundColor: b.jamka, border: '1px solid transparent', boxShadow: 'none', borderRadius: '14px' },
    },
  };
}

/** Geist pro rám Stripe: jeden proměnný soubor, tři řezy (400 text, 500 popisky, 600 zvýraznění). */
export function pismaPokladny(puvod: string): CustomFontSource[] {
  const src = `url(${puvod.replace(/\/$/, '')}${CESTA_PISMA}) format("woff2")`;
  return ['400', '500', '600'].map(weight => ({ family: 'Geist', src, weight, style: 'normal' as const, display: 'swap' }));
}
