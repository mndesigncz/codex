'use client';

// Lišta režimu úprav (kolo 68, spec §3.5, DP §5.5).
//
// Plovoucí inkoustová pilulka u spodní hrany (na telefonu nad dokem) — tvar
// hromadného pruhu (PlovouciLista), který aplikace už zná. Tlačítko „Hotovo"
// v hlavičce by po odrolování zmizelo; lišta je vždy na dosah palce a nese
// jedinou limetku režimu úprav (spec O1). Lišta taky zapisuje --lista-vyska,
// takže toast „Widget odebrán · Vrátit" leží nad ní, ne přes ni.

import { useState } from 'react';
import { Icon } from '../../Icons';
import { PlovouciLista, MenuPanel, MenuItemButton, type MenuItem } from '../../ui';
import { usePopover } from '@/lib/usePopover';

export default function ListaUprav({ open, popisek, onPridat, onHotovo, menu, neulozeno, onZkusitZnovu }: {
  open: boolean;
  /** „Úpravy stránky", v editoru výchozích „Výchozí · Všichni zaměstnanci". */
  popisek: string;
  onPridat: () => void;
  onHotovo: () => void;
  /** Položky „···" (Obnovit výchozí, Uložit jako výchozí pro…); prázdné = bez tlačítka. */
  menu: MenuItem[];
  /** Zápis selhal a model čeká na nový pokus. */
  neulozeno: boolean;
  onZkusitZnovu: () => void;
}) {
  const [menuOtevreno, setMenuOtevreno] = useState(false);
  const pop = usePopover(menuOtevreno, setMenuOtevreno, { focusFirst: true, arrowKeys: true });

  return (
    <div data-plocha-chrom="">
      <PlovouciLista
        label="Úpravy stránky"
        open={open}
        animate
        note={neulozeno ? (
          <>Neuloženo ·{' '}
            <button type="button" onClick={onZkusitZnovu} className="tap-target-sm font-semibold underline underline-offset-2 hover:no-underline">
              Zkusit znovu
            </button>
          </>
        ) : undefined}
      >
        <span className="text-sm font-semibold whitespace-nowrap px-1 hidden sm:inline">{popisek}</span>
        <button type="button" onClick={onPridat}
          className="tap-target-sm rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/20 transition whitespace-nowrap">
          <Icon name="plus" size={14} className="inline -mt-0.5 mr-1" />Přidat widget
        </button>
        {menu.length > 0 && (
          <div ref={pop.ref} className="relative">
            <button ref={pop.triggerRef} type="button" aria-label="Další možnosti úprav" aria-haspopup="menu" aria-expanded={menuOtevreno}
              onClick={() => setMenuOtevreno(v => !v)} onKeyDown={pop.onTriggerKeyDown}
              className="tap-target-sm h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center transition">
              <Icon name="more" size={16} />
            </button>
            {menuOtevreno && (
              // Lišta je u spodní hrany, panel proto roste nahoru od svého tlačítka.
              <MenuPanel ref={pop.panelRef} onKeyDown={pop.onPanelKeyDown} direction="up"
                className="absolute bottom-full mb-2 right-0 origin-bottom-right">
                {menu.map(it => (
                  <MenuItemButton key={it.label} {...it} onClick={() => { pop.close(false); it.onClick(); }} />
                ))}
              </MenuPanel>
            )}
          </div>
        )}
        <button type="button" onClick={onHotovo} className="btn btn-accent btn-sm tap-target-sm whitespace-nowrap">
          Hotovo
        </button>
      </PlovouciLista>
    </div>
  );
}
