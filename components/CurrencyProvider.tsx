'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { DEFAULT_CURRENCY, formatMoney, formatCost, formatPrice, makeMoney, currencySymbol } from '@/lib/money';
import { okJson } from '@/lib/api';
import { cistyJazyk, type Jazyk } from '@/lib/i18n/config';
import { cistaZeme, type Zeme } from '@/lib/i18n/zeme';
import { normalizujNavKonfig, type NavKonfig } from '@/lib/navigace';

type CurrencyCtx = {
  currency: string;
  locale: string;
  weekStart: number;          // 1 = Monday, 0 = Sunday
  laborTargetPct: number | null;
  money: (n: number) => string;
  /** Pro částky pod jednotku měny — surovina v receptuře, kde „0 Kč" lže. */
  cost: (n: number) => string;
  /** Cena zadaná člověkem (menu, cena balení): s haléři, jen když je má. */
  price: (n: number) => string;
  symbol: string;
  loaded: boolean;
  // Lokalizace podniku (kolo 76). Před migrací sloupců jsou to výchozí hodnoty,
  // tedy dnešní chování: jazyk podniku čeština, bez země, 24 h, bez vlastní navigace.
  /** Jazyk podniku (teams.default_lang): výchozí pro nové členy, e-maily dodavatelům a lístek. */
  defaultLang: Jazyk;
  country: Zeme | null;
  /** '24' | '12' */
  timeFormat: '24' | '12';
  timezone: string;
  /** Přizpůsobení navigace (teams.nav_config); null = výchozí. */
  navConfig: NavKonfig | null;
  /** Znovu načte nastavení podniku (po uložení v Nastavení týmu). */
  obnov: () => void;
};

const LOKALIZACE_VYCHOZI = {
  defaultLang: 'cs' as Jazyk, country: null as Zeme | null, timeFormat: '24' as '24' | '12',
  timezone: 'Europe/Prague', navConfig: null as NavKonfig | null, obnov: () => {},
};

const Ctx = createContext<CurrencyCtx>({
  ...DEFAULT_CURRENCY,
  weekStart: 1,
  laborTargetPct: null,
  money: (n: number) => formatMoney(n),
  cost: (n: number) => formatCost(n),
  price: (n: number) => formatPrice(n),
  symbol: 'Kč',
  loaded: false,
  ...LOKALIZACE_VYCHOZI,
});

// Fetches the team's currency/locale once and exposes a bound money() formatter.
// Every money figure in the app flows through useMoney(), so a team can trade
// in any currency without touching a single component.
export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [cfg, setCfg] = useState<CurrencyCtx>({
    ...DEFAULT_CURRENCY,
    weekStart: 1,
    laborTargetPct: null,
    money: (n: number) => formatMoney(n),
    cost: (n: number) => formatCost(n),
    price: (n: number) => formatPrice(n),
    symbol: 'Kč',
    loaded: false,
    ...LOKALIZACE_VYCHOZI,
  });
  const [nacteni, setNacteni] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await fetch('/api/teams').then(okJson);
        const t = d?.team;
        if (!t || cancelled) return;
        const currency = t.currency || DEFAULT_CURRENCY.currency;
        const locale = t.locale || DEFAULT_CURRENCY.locale;
        const weekStart = t.week_start ?? 1;
        setCfg({
          currency, locale, weekStart,
          laborTargetPct: t.labor_target_pct ?? null,
          money: makeMoney({ currency, locale }),
          cost: (n: number) => formatCost(n, currency, locale),
          price: (n: number) => formatPrice(n, currency, locale),
          symbol: currencySymbol(currency, locale),
          loaded: true,
          defaultLang: cistyJazyk(t.default_lang) ?? 'cs',
          country: cistaZeme(t.country) ?? null,
          timeFormat: t.time_format === '12' ? '12' : '24',
          timezone: typeof t.timezone === 'string' && t.timezone ? t.timezone : 'Europe/Prague',
          navConfig: normalizujNavKonfig(t.nav_config),
          obnov: () => setNacteni(n => n + 1),
        });
      } catch { /* keep defaults */ }
    })();
    return () => { cancelled = true; };
  }, [nacteni]);

  return <Ctx.Provider value={cfg}>{children}</Ctx.Provider>;
}

export const useCurrency = () => useContext(Ctx);
export const useMoney = () => useContext(Ctx).money;
export const useCost = () => useContext(Ctx).cost;
export const usePrice = () => useContext(Ctx).price;
export const useSymbol = () => useContext(Ctx).symbol;
