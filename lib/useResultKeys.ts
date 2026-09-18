'use client';

// Klávesnice nad seznamem výsledků pod polem.
//
// V aplikaci je několik našeptávačů, které mají tvar „pole + pod ním
// tlačítka s výsledky": připojení položky z kasy, hledání suroviny do
// receptury, napojení návodu na produkt. Myší fungují, klávesnicí ne —
// šipka dolů neudělá nic a do výsledků se dá dostat jen Tabem přes ně
// všechny. `SearchField` má tohle vyřešené, ale jen pro svoje vlastní
// návrhy; tady si seznam vykresluje volající sám.
//
// Vzor je záměrně ten jednodušší ze dvou možných: šipka dolů přesune
// skutečný fokus do seznamu (ne `aria-activedescendant`), takže Enter
// na položce funguje sám od sebe a volající nemusí nic zvýrazňovat.
// Šipka nahoru z prvního výsledku vrátí fokus do pole, aby se dalo psát dál.

import { useCallback, type KeyboardEvent, type RefObject } from 'react';

const ITEMS = 'button:not([disabled]), a[href]';

export function useResultKeys(
  listRef: RefObject<HTMLElement>,
  inputRef: RefObject<HTMLInputElement>,
  opts: { onEscape?: () => void } = {},
) {
  const { onEscape } = opts;

  const items = useCallback(
    () => Array.from(listRef.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])
      .filter(el => el.offsetWidth > 0 || el.offsetHeight > 0),
    [listRef]);

  /** Na vyhledávací pole. */
  const onInputKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') { if (onEscape) { e.preventDefault(); onEscape(); } return; }
    if (e.key !== 'ArrowDown') return;
    const list = items();
    if (list.length === 0) return;
    e.preventDefault();
    list[0].focus();
  }, [items, onEscape]);

  /** Na obal výsledků. */
  const onListKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') { if (onEscape) { e.preventDefault(); onEscape(); } return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const list = items();
    if (list.length === 0) return;
    const at = list.indexOf(document.activeElement as HTMLElement);
    e.preventDefault();
    if (e.key === 'ArrowUp' && at <= 0) { inputRef.current?.focus(); return; }
    const next = e.key === 'ArrowDown'
      ? Math.min(at + 1, list.length - 1)
      : Math.max(at - 1, 0);
    list[next]?.focus();
  }, [items, inputRef, onEscape]);

  return { onInputKeyDown, onListKeyDown };
}

export default useResultKeys;
