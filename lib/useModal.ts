'use client';

// Jedno chování pro všechny dialogy v aplikaci.
//
// Modály v appce jsou ručně skládané `fixed inset-0` vrstvy — každá si dřív
// řešila (nebo neřešila) klávesnici po svém. Výsledek: většina oken nešla
// zavřít Escapem, odečítač obrazovky je nehlásil jako dialog, fokus zůstal
// vzadu na stránce a Tab utekl pod překryv. Tenhle hook to sjednocuje:
//
//   • Escape zavře,
//   • fokus skočí dovnitř a po zavření se vrátí na tlačítko, které okno otevřelo,
//   • Tab cykluje uvnitř okna (nevypadne do stránky pod ním),
//   • pozadí se nescrolluje, dokud je okno otevřené.
//
// Použití: hook se volá vždy (i když je okno zavřené — pravidla hooků), stav
// otevření mu předáš prvním parametrem. Vrácené `ref` + `dialogProps` dej na
// panel okna, ne na ztmavené pozadí:
//
//   const m = useModal(addOpen, () => setAddOpen(false), 'Nová položka');
//   {addOpen && (
//     <div className="fixed inset-0 ..." onClick={close}>
//       <div ref={m.ref} {...m.dialogProps} className="modal-sheet …">…</div>
//     </div>
//   )}

import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useModal<T extends HTMLElement = HTMLDivElement>(open: boolean, onClose: () => void, label?: string) {
  const ref = useRef<T>(null);
  // Zavírací funkce se u většiny volajících tvoří znovu při každém překreslení.
  // Držíme ji v refu, ať se efekt nepřipojuje a neodpojuje pořád dokola.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const panel = ref.current;
    const restoreTo = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const visible = () => Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
      .filter(el => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement);

    // Fokus dovnitř až po vykreslení obsahu.
    const t = setTimeout(() => {
      if (!panel) return;
      const first = visible()[0];
      (first ?? panel).focus({ preventScroll: true });
    }, 0);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = visible();
      if (!items.length) { e.preventDefault(); panel.focus({ preventScroll: true }); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const outside = !active || !panel.contains(active);
      if (e.shiftKey && (outside || active === first)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (outside || active === last)) { e.preventDefault(); first.focus(); }
    };

    // Zachytáváme ve fázi capture, ať Escape zabere i když je fokus v poli,
    // které si klávesu jinak nechá pro sebe.
    document.addEventListener('keydown', onKey, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      restoreTo?.focus?.({ preventScroll: true });
    };
  }, [open]);

  return {
    ref,
    dialogProps: {
      role: 'dialog' as const,
      'aria-modal': true,
      ...(label ? { 'aria-label': label } : {}),
      tabIndex: -1,
    },
  };
}
