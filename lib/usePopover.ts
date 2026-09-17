'use client';

// Rozbalovací panel — jedna podoba pro všechny.
//
// Okna už svoji společnou obsluhu mají (`useModal`), panely ne. Každý si
// vlastní zavírání skládal sám, a proto se lišily: menu „···" umělo Escape,
// panel oznámení ne, uživatelské menu v Managero client nezavíralo ani
// kliknutím vedle — jednou otevřené zůstalo přes celou stránku.
//
// Tohle je ten společný zbytek: Escape, kliknutí mimo, návrat fokusu na
// tlačítko, kterým se panel otevřel, a pohyb šipkami po položkách. Okno
// (`useModal`) proti tomu zamyká pozadí a drží fokus uvnitř — panel to
// nedělá schválně, protože se od něj čeká, že zmizí, jakmile se člověk
// podívá jinam.

import { useCallback, useEffect, useRef } from 'react';

export function usePopover(open: boolean, setOpen: (v: boolean) => void, opts: {
  /** Po zavření Escapem se fokus vrátí na tlačítko, ne na <body>. */
  restoreFocus?: boolean;
  /** Po otevření skočit na první položku panelu. */
  focusFirst?: boolean;
  /** Šipky nahoru/dolů a Home/End chodí po položkách panelu. */
  arrowKeys?: boolean;
  /** Zavolá se před zavřením kliknutím mimo (např. „označit vše přečtené"). */
  onDismiss?: () => void;
} = {}) {
  const { restoreFocus = true, focusFirst = false, arrowKeys = false, onDismiss } = opts;
  /** Obal panelu i tlačítka — podle něj se pozná „kliknutí mimo". */
  const ref = useRef<HTMLDivElement>(null);
  /** Samotný panel — v něm se hledají položky pro šipky a fokus. */
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const setOpenRef = useRef(setOpen);
  setOpenRef.current = setOpen;

  const close = useCallback((giveBackFocus = restoreFocus) => {
    setOpenRef.current(false);
    if (giveBackFocus) triggerRef.current?.focus();
  }, [restoreFocus]);

  const items = useCallback(
    () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], [role="menuitem"]:not([disabled])') ?? [])
      .filter(el => el.offsetWidth > 0 || el.offsetHeight > 0),
    []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        dismissRef.current?.();
        // Kliknutí mimo znamená „chci pryč odsud", ne „vrať mě na tlačítko".
        setOpenRef.current(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  useEffect(() => {
    if (!open || !focusFirst) return;
    const t = setTimeout(() => items()[0]?.focus(), 0);
    return () => clearTimeout(t);
  }, [open, focusFirst, items]);

  /** Na panel: šipky chodí po položkách, Home/End na kraje. */
  const onPanelKeyDown = useCallback((e: { key: string; preventDefault: () => void }) => {
    if (!arrowKeys) return;
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const list = items();
    if (list.length === 0) return;
    const at = list.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === 'Home' ? 0
      : e.key === 'End' ? list.length - 1
      : e.key === 'ArrowDown' ? (at + 1) % list.length
      : (at - 1 + list.length) % list.length;
    list[next]?.focus();
  }, [arrowKeys, items]);

  /** Na tlačítko: šipka dolů otevře zavřený panel, jak je zvykem. */
  const onTriggerKeyDown = useCallback((e: { key: string; preventDefault: () => void }) => {
    if (!arrowKeys || open) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpenRef.current(true); }
  }, [arrowKeys, open]);

  return { ref, panelRef, triggerRef, close, onPanelKeyDown, onTriggerKeyDown };
}

export default usePopover;
