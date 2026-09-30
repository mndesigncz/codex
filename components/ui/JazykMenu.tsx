'use client';

import { useState } from 'react';
import { Icon } from '../Icons';
import { MenuPanel } from './Menu';
import { usePopover } from '@/lib/usePopover';
import { JAZYKY, JAZYK_KOD, JAZYK_NAZEV, type Jazyk } from '@/lib/i18n/config';
import { useJazyk, useT } from '@/lib/i18n/client';

// Přepínač jazyka jako malá pilulka s globusem („CS") a nabídkou pěti jazyků.
//
// Pilulka, ne řada ikon: v rohu přihlášení, registrace a prodejní stránky je
// místo na jedno malé tlačítko. Nabídka roste z tlačítka (`pop-in`, respektuje
// prefers-reduced-motion v globálním CSS) a umí šipky, Home/End a Escape
// (`usePopover`). Jména jazyků jsou endonymy a nepřekládají se: kdo se ocitne
// v cizím jazyce, musí se umět vrátit. Vybraný jazyk nese fajfka, ne limetka:
// jednu plnou limetku na obrazovce drží jiná akce.
//
// Žádné vlajky: vlajka není jazyk (cs/sk, de/at).

export default function JazykMenu({ nabizet = JAZYKY, align = 'right', className = '', onZmena }: {
  /** Jazyky v nabídce; host vidí jen ty, které podnik nabízí. */
  nabizet?: readonly Jazyk[];
  align?: 'left' | 'right';
  className?: string;
  onZmena?: (j: Jazyk) => void;
}) {
  const t = useT();
  const { jazyk, setJazyk } = useJazyk();
  const [open, setOpen] = useState(false);
  const pop = usePopover(open, setOpen, { focusFirst: true, arrowKeys: true });

  // Jeden jazyk = není z čeho vybírat, pilulka se nekreslí.
  if (nabizet.length < 2) return null;

  const vyber = (j: Jazyk) => {
    setOpen(false);
    if (j !== jazyk) { setJazyk(j); onZmena?.(j); }
  };

  return (
    <div ref={pop.ref} className={`relative inline-block shrink-0 ${className}`}>
      <button
        ref={pop.triggerRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        onKeyDown={pop.onTriggerKeyDown}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t('Jazyk')}: ${JAZYK_NAZEV[jazyk]}`}
        // Vizuálně malá pilulka, dotyková plocha 44 px: `before` ji roztahuje, rozvržení se nehýbe.
        className="chip chip-muted relative inline-flex items-center gap-1.5 cursor-pointer select-none before:absolute before:-inset-x-1.5 before:-inset-y-2.5 before:content-['']"
      >
        <Icon name="globe" size={13} className="shrink-0" />
        <span className="tabular-nums font-semibold tracking-wide">{JAZYK_KOD[jazyk]}</span>
      </button>
      {open && (
        <MenuPanel
          ref={pop.panelRef}
          onKeyDown={pop.onPanelKeyDown}
          aria-label={t('Jazyk')}
          className={`absolute top-full mt-2 ${align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left'}`}
        >
          {nabizet.map(j => (
            <button
              key={j}
              type="button"
              role="menuitemradio"
              aria-checked={j === jazyk}
              lang={j}
              onClick={() => vyber(j)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left transition-colors text-[#16181A] hover:bg-black/[0.05]"
            >
              <span className={`min-w-0 flex-1 ${j === jazyk ? 'font-semibold' : 'font-medium'}`}>{JAZYK_NAZEV[j]}</span>
              <span className="w-[18px] shrink-0 flex justify-center">
                {j === jazyk && <Icon name="check" size={16} className="text-[#16181A]" />}
              </span>
            </button>
          ))}
        </MenuPanel>
      )}
    </div>
  );
}
