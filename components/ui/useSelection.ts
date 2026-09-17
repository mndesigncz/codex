'use client';

// Výběr více řádků najednou.
//
// Aplikace tenhle vzor měla — ve Skladu, hotový a dobrý — a nikde jinde.
// Ve frontách ke schválení se přitom dělá pořád totéž: po sezóně dovolených
// leží ve frontě dvacet žádostí a manažer klikne dvacetkrát „Schválit",
// pokaždé s vlastním požadavkem na server. Tohle je ta chybějící polovina,
// vytažená tak, aby ji mohl použít kdokoli.

import { useCallback, useMemo, useState } from 'react';

export type Id = number | string;

export function useSelection<T extends Id = number>() {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<T>>(new Set());

  const start = useCallback(() => setSelecting(true), []);
  const exit = useCallback(() => { setSelecting(false); setSelected(new Set()); }, []);
  const clear = useCallback(() => setSelected(new Set()), []);

  const toggle = useCallback((id: T) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: T[]) => setSelected(new Set(ids)), []);

  const has = useCallback((id: T) => selected.has(id), [selected]);

  return useMemo(() => ({
    selecting, selected, count: selected.size,
    start, exit, clear, toggle, selectAll, has, setSelecting,
  }), [selecting, selected, start, exit, clear, toggle, selectAll, has]);
}

/**
 * Pustí akci nad vybranými položkami najednou a řekne, co se nepovedlo.
 *
 * Dvacet požadavků za sebou je dvacet čekání; tohle je pustí zároveň.
 * Nepovedené se nezamlčí — volající z nich udělá hlášku, protože „schválil
 * jsem osmnáct z dvaceti" je něco úplně jiného než „hotovo".
 */
export async function runBulk<T extends Id>(
  ids: T[],
  action: (id: T) => Promise<unknown>,
): Promise<{ done: T[]; failed: T[] }> {
  const results = await Promise.allSettled(ids.map(id => action(id)));
  const done: T[] = [];
  const failed: T[] = [];
  results.forEach((r, i) => (r.status === 'fulfilled' ? done : failed).push(ids[i]));
  return { done, failed };
}

export default useSelection;
