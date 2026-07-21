// Team-aware money formatting. The app stores money as whole integer units
// (no cents), so we render with zero fraction digits by default.

export type CurrencyConfig = { currency: string; locale: string };

export const DEFAULT_CURRENCY: CurrencyConfig = { currency: 'CZK', locale: 'cs-CZ' };

// Currencies we offer in the settings picker. Symbol is informational only —
// Intl derives the real symbol from the currency code + locale.
export const CURRENCIES: { code: string; label: string; sample: string }[] = [
  { code: 'CZK', label: 'Koruna česká (Kč)', sample: '1 500 Kč' },
  { code: 'EUR', label: 'Euro (€)', sample: '1 500 €' },
  { code: 'USD', label: 'Dolar americký ($)', sample: '$1,500' },
  { code: 'GBP', label: 'Libra (£)', sample: '£1,500' },
  { code: 'PLN', label: 'Zlotý polský (zł)', sample: '1 500 zł' },
  { code: 'HUF', label: 'Forint maďarský (Ft)', sample: '1 500 Ft' },
  { code: 'CHF', label: 'Frank švýcarský (CHF)', sample: 'CHF 1 500' },
  { code: 'RON', label: 'Leu rumunský (lei)', sample: '1 500 lei' },
];

export const LOCALES: { code: string; label: string }[] = [
  { code: 'cs-CZ', label: 'Čeština (1 500,50)' },
  { code: 'sk-SK', label: 'Slovenština' },
  { code: 'en-US', label: 'English (US) — 1,500.50' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'de-DE', label: 'Deutsch — 1.500,50' },
  { code: 'pl-PL', label: 'Polski' },
];

export function formatMoney(n: number, currency = 'CZK', locale = 'cs-CZ'): string {
  const val = Math.round(Number(n) || 0);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(val);
  } catch {
    // Unknown currency/locale — fall back to a plain grouped number + code.
    return `${val.toLocaleString(locale || 'cs-CZ')} ${currency}`;
  }
}

// A bound formatter factory for a given team config.
export function makeMoney(cfg: CurrencyConfig) {
  return (n: number) => formatMoney(n, cfg.currency, cfg.locale);
}

// The bare currency symbol (e.g. "Kč", "€", "$") for input adornments.
export function currencySymbol(currency = 'CZK', locale = 'cs-CZ'): string {
  try {
    const parts = new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).formatToParts(0);
    return parts.find(p => p.type === 'currency')?.value ?? currency;
  } catch {
    return currency;
  }
}
