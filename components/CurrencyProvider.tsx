'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { DEFAULT_CURRENCY, formatMoney, makeMoney, currencySymbol } from '@/lib/money';

type CurrencyCtx = {
  currency: string;
  locale: string;
  weekStart: number;          // 1 = Monday, 0 = Sunday
  laborTargetPct: number | null;
  money: (n: number) => string;
  symbol: string;
  loaded: boolean;
};

const Ctx = createContext<CurrencyCtx>({
  ...DEFAULT_CURRENCY,
  weekStart: 1,
  laborTargetPct: null,
  money: (n: number) => formatMoney(n),
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
    symbol: 'Kč',
    loaded: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await fetch('/api/teams').then(r => r.json());
        const t = d?.team;
        if (!t || cancelled) return;
        const currency = t.currency || DEFAULT_CURRENCY.currency;
        const locale = t.locale || DEFAULT_CURRENCY.locale;
        const weekStart = t.week_start ?? 1;
        setCfg({
          currency, locale, weekStart,
          laborTargetPct: t.labor_target_pct ?? null,
          money: makeMoney({ currency, locale }),
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
export const useSymbol = () => useContext(Ctx).symbol;
