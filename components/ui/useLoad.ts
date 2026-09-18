'use client';

import { useCallback, useEffect, useState } from 'react';
import { okJson } from '@/lib/api';

// Načítání, které umí i selhat.
//
// Vzorec, co byl po aplikaci rozsypaný, vypadal takhle:
//
//   fetch(url).then(okJson).then(setD).catch(() => {});
//
// Prázdný catch znamená, že po výpadku sítě zůstane `d === null` navždy
// a člověk kouká na pulzující skeleton, dokud stránku neobnoví. Tenhle
// hook má tři stavy místo dvou — data, chyba, načítám — a `reload`,
// kterým si člověk může vynutit další pokus.
//
// `pick` z odpovědi vytáhne, co komponenta potřebuje, a je i místem,
// kde se ověří tvar: když API vrátí něco jiného, než se čeká, vyhodíme
// chybu tady, a ne až v JSX nad `undefined.length`.

export type LoadState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
  /** Přepíše data lokálně (po uložení), aniž by se znovu volalo API. */
  set: (updater: T | ((prev: T | null) => T)) => void;
};

export function useLoad<T>(url: string | null, pick: (raw: any) => T = (raw) => raw as T): LoadState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    setError(null);
    (async () => {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`Server odpověděl ${r.status}`);
        const raw = await r.json();
        const value = pick(raw);
        if (alive) setData(value);
      } catch (e: any) {
        if (alive) { setData(null); setError(e?.message || 'Načtení se nepovedlo'); }
      }
    })();
    return () => { alive = false; };
    // `pick` bývá inline funkce; závislost na ní by točila smyčku.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, tick]);

  const reload = useCallback(() => setTick(t => t + 1), []);
  const set = useCallback((updater: any) => setData((prev: any) => (typeof updater === 'function' ? updater(prev) : updater)), []);

  return { data, error, loading: data === null && error === null, reload, set };
}

export default useLoad;
