'use client';

// Jednoduchá volba uložená v prohlížeči (typ grafu, zapnuté srovnání…): výchozí při prvním vykreslení, uložená hned potom.
import { useCallback, useEffect, useState } from 'react';

export function useUlozeno<T extends string | boolean>(klic: string, vychozi: T, platne?: readonly T[]): [T, (v: T) => void] {
  const [hodnota, setHodnota] = useState<T>(vychozi);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`managero-volba-${klic}`);
      if (raw == null) return;
      const v = (typeof vychozi === 'boolean' ? raw === 'true' : raw) as T;
      if (!platne || platne.includes(v)) setHodnota(v);
    } catch { /* soukromé okno */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [klic]);
  const nastav = useCallback((v: T) => {
    setHodnota(v);
    try { localStorage.setItem(`managero-volba-${klic}`, String(v)); } catch { /* soukromé okno */ }
  }, [klic]);
  return [hodnota, nastav];
}
