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

// Zámek posuvu se počítá, ne přepisuje. Když se okna překrývají (z okna se
// otevře další) a zavřou se v jiném pořadí, než se otevřela, prosté
// „zapamatuj si předchozí hodnotu a vrať ji" nechá stránku navždy zamčenou:
// vnitřní okno si zapamatuje „hidden" po tom vnějším a při zavření ho vrátí.
// Proto se drží počet otevřených oken a odemyká se až u posledního.
let lockCount = 0;
let lockedFrom = '';

function lockScroll() {
  if (lockCount === 0) lockedFrom = document.body.style.overflow;
  lockCount++;
  document.body.style.overflow = 'hidden';
}

function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) document.body.style.overflow = lockedFrom;
}

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

  // Kam vrátit fokus po zavření.
  //
  // Dřív se to četlo až v efektu, tedy po vykreslení okna — jenže pole
  // s `autoFocus` si fokus vezme dřív, takže se jako „místo návratu"
  // uložilo pole uvnitř okna. To se zavřením zmizelo a fokus spadl na
  // <body>: po Escape začínal další Tab od začátku stránky. Čte se proto
  // už během vykreslování, kdy okno v DOM ještě není a fokus drží pořád
  // to tlačítko, kterým se okno otevřelo.
  //
  // Pozor na pořadí: zavření okna nejdřív překreslí komponentu a teprve
  // potom uklidí efekt. Kdyby se uložený prvek mazal při vykreslování,
  // byl by v okamžiku úklidu už pryč — proto se maže až v úklidu samotném,
  // hned po tom, co se fokus vrátí.
  const restoreRef = useRef<HTMLElement | null>(null);
  if (typeof document !== 'undefined' && open && restoreRef.current === null) {
    restoreRef.current = document.activeElement as HTMLElement | null;
  }

  useEffect(() => {
    if (!open) return;
    const panel = ref.current;
    lockScroll();

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
      unlockScroll();
      const back = restoreRef.current;
      restoreRef.current = null;
      // Prvek, který se mezitím odmontoval (řádek smazaný v okně), fokus
      // nepřijme — pak je lepší nedělat nic než skočit na <body>.
      if (back && back.isConnected) back.focus?.({ preventScroll: true });
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
