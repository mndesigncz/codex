'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { DEFAULT_CURRENCY, formatMoney, formatCost, makeMoney, currencySymbol } from '@/lib/money';
import { okJson } from '@/lib/api';

type CurrencyCtx = {
  currency: string;
  locale: string;
  weekStart: number;          // 1 = Monday, 0 = Sunday
  laborTargetPct: number | null;
  money: (n: number) => string;
  /** Pro částky pod jednotku měny — surovina v receptuře, kde „0 Kč" lže. */
  cost: (n: number) => string;
  symbol: string;
  loaded: boolean;
};

const Ctx = createContext<CurrencyCtx>({
  ...DEFAULT_CURRENCY,
  weekStart: 1,
  laborTargetPct: null,
  money: (n: number) => formatMoney(n),
  cost: (n: number) => formatCost(n),
  symbol: 'Kč',
  loaded: false,
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
    symbol: 'Kč',
    loaded: false,
  });

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
          symbol: currencySymbol(currency, locale),
          loaded: true,
        });
      } catch { /* keep defaults */ }
    })();
    return () => { cancelled = true; };
  }, []);

  return <Ctx.Provider value={cfg}>{children}</Ctx.Provider>;
}

export const useCurrency = () => useContext(Ctx);
export const useMoney = () => useContext(Ctx).money;
export const useCost = () => useContext(Ctx).cost;
export const useSymbol = () => useContext(Ctx).symbol;
