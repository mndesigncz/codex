// Obsah karty hosta pro peněženky (Apple Wallet, Google Wallet). Čisté funkce bez
// databáze a bez sítě; databázi čte až endpoint (app/api/client/card/wallet/…).

import type { Jazyk } from './i18n/config.ts';

export interface DataKarty {
  podnik: string;
  host: string;
  /** Kód karty ve tvaru ABCD-EFGH; je to i obsah QR. */
  kod: string;
  /** Id podniku; jen do sériového čísla, ven se nedává. */
  teamId: number;
  body: number;
  razitka: number;
  razitkaCil: number;
  /** Název úrovně (např. „Stříbrný host“); u základní úrovně prázdný. */
  uroven: string;
  /** Barva podniku #RRGGBB; jinak tmavá výchozí z karty v aplikaci. */
  barva: string;
  /** Adresa loga (https), když ho podnik má. */
  logoUrl: string;
  /** Veřejná adresa profilu podniku. */
  odkaz: string;
  /** Jazyk popisků na kartě (jazyk hosta). */
  jazyk: Jazyk;
}

export const VYCHOZI_BARVA = '#16181A';

/** Barva #RGB/#RRGGBB na #RRGGBB (velká písmena); cokoli jiného → výchozí tmavá. */
export function bezpecnaBarva(raw: unknown, vychozi = VYCHOZI_BARVA): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(raw ?? '').trim());
  if (!m) return vychozi;
  const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  return '#' + h.toUpperCase();
}

export function barvaRgb(hex: string): [number, number, number] {
  const h = bezpecnaBarva(hex).slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Bílá, nebo tmavá — podle toho, co je na barvě pozadí čitelnější. */
export function textNaBarve(hex: string): '#FFFFFF' | '#16181A' {
  const [r, g, b] = barvaRgb(hex).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#16181A' : '#FFFFFF';
}

/** Sériové číslo karty v rámci podniku: stabilní, takže přidání podruhé nevyrobí duplicitu. */
export function seriove(d: Pick<DataKarty, 'kod' | 'teamId'>): string {
  return `${d.kod}-${d.teamId}`;
}

/** Zkrácení na rozumnou délku pole v peněžence. */
export function zkrat(s: string, max: number): string {
  const t = String(s ?? '').trim();
  return t.length <= max ? t : t.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
}

/** Razítka jako „3 / 10“; bez cíle (0) jen počet. */
export function razitkaText(d: Pick<DataKarty, 'razitka' | 'razitkaCil'>): string {
  return d.razitkaCil > 0 ? `${d.razitka} / ${d.razitkaCil}` : String(d.razitka);
}

// ---- Popisky na kartě v peněžence --------------------------------------------
// Karta se skládá na serveru a Wallet nemá náš slovník, proto jsou popisky tady
// jako data po jazycích (stejně jako lib/i18n/email.ts). Překlady jsou strojové.

export interface PopiskyKarty { body: string; razitka: string; uroven: string; host: string; kod: string; karta: string; odkaz: string }

export const POPISKY_KARTY: Record<Jazyk, PopiskyKarty> = {
  cs: { body: 'Body', razitka: 'Razítka', uroven: 'Úroveň', host: 'Host', kod: 'Kód karty', karta: 'Věrnostní karta', odkaz: 'Profil podniku' },
  en: { body: 'Points', razitka: 'Stamps', uroven: 'Level', host: 'Guest', kod: 'Card code', karta: 'Loyalty card', odkaz: 'Business profile' },
  de: { body: 'Punkte', razitka: 'Stempel', uroven: 'Stufe', host: 'Gast', kod: 'Kartencode', karta: 'Kundenkarte', odkaz: 'Profil des Betriebs' },
  sk: { body: 'Body', razitka: 'Pečiatky', uroven: 'Úroveň', host: 'Hosť', kod: 'Kód karty', karta: 'Vernostná karta', odkaz: 'Profil podniku' },
  pl: { body: 'Punkty', razitka: 'Pieczątki', uroven: 'Poziom', host: 'Gość', kod: 'Kod karty', karta: 'Karta lojalnościowa', odkaz: 'Profil lokalu' },
};

const UROVNE: Record<string, Partial<Record<Jazyk, string>>> = {
  'Stříbrný host': { en: 'Silver guest', de: 'Silber-Gast', sk: 'Strieborný hosť', pl: 'Gość srebrny' },
  'Zlatý host': { en: 'Gold guest', de: 'Gold-Gast', sk: 'Zlatý hosť', pl: 'Gość złoty' },
  'Platinový host': { en: 'Platinum guest', de: 'Platin-Gast', sk: 'Platinový hosť', pl: 'Gość platynowy' },
};

/** Název úrovně v jazyce karty; neznámý název se nechá, jak je. */
export function urovenVJazyce(label: string, jazyk: Jazyk): string {
  return UROVNE[label]?.[jazyk] ?? label;
}
