'use client';

// Kontextové menu widgetu (kolo 68, spec §3.4, DP §5.4).
//
// Panel a položky jsou tytéž jako u „···" (MenuPanel, MenuItemButton, pop-in
// 160 ms, šipky a Escape z usePopover) — liší se jen kotvou. Menu po podržení
// nesmí vypadat jako něco, co v aplikaci jinde není (DP §3.9).
//
// Poloha podle toho, čím se otevřelo:
//  - myš: na místě kurzoru (zvyk z desktopu);
//  - dotyk: pod widgetem (nebo nad ním), vodorovně u prstu, 8 px od okrajů —
//    prst menu nezakryje;
//  - klávesnice: pod pravým horním rohem widgetu.
// `transform-origin` je v bodě kotvy, takže panel roste z místa stisku
// (apple-design §7). Posun stránky menu zavře — kotva by mu ujela.

import { useLayoutEffect, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MenuPanel, MenuItemButton, type MenuItem } from '../ui';
import { usePopover } from '@/lib/usePopover';

export type ZdrojMenu = 'mys' | 'dotyk' | 'klavesnice';

export interface OtevreneMenu {
  instance: string;
  /** Bod stisku nebo kurzoru (clientX/Y). */
  x: number;
  y: number;
  zdroj: ZdrojMenu;
  /** Otevřeno v režimu úprav (Posunout výš/níž místo Upravit stránku). */
  zUprav: boolean;
  /** Widget (<li>) — kotva pro dotyk a klávesnici. */
  kotva: HTMLElement | null;
  /** Kam vrátit fokus po Escapu (klávesnice). */
  fokusZpet: HTMLElement | null;
}

/** Položka menu; `className` otočí ikonu (Posunout výš = chevron vzhůru). */
export type PolozkaMenu = MenuItem & { className?: string };

const OKRAJ = 8;
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

export function KontextoveMenu({ menu, polozky, nazev, onZavrit }: {
  menu: OtevreneMenu;
  polozky: PolozkaMenu[];
  /** Název widgetu — jméno nabídky pro odečítač. */
  nazev: string;
  onZavrit: () => void;
}) {
  const zavritRef = useRef(onZavrit);
  zavritRef.current = onZavrit;
  const fokusRef = useRef<HTMLElement | null>(menu.fokusZpet);
  fokusRef.current = menu.fokusZpet;
  const pop = usePopover(true, v => { if (!v) zavritRef.current(); }, {
    focusFirst: true,
    arrowKeys: true,
    anchorRef: fokusRef,
    // Po myši a prstu fokus nikam nevracíme (widget v klidu nejde zaostřit);
    // po klávesnici zpátky na widget, jinak by spadl na <body>.
    restoreFocus: menu.zdroj === 'klavesnice',
  });
  const [poloha, setPoloha] = useState<{ left: number; top: number; origin: string; nahoru: boolean } | null>(null);

  useLayoutEffect(() => {
    const panel = pop.panelRef.current;
    if (!panel) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    let left: number;
    let top: number;
    let nahoru = false;
    const r = menu.kotva?.getBoundingClientRect() ?? null;
    if (menu.zdroj === 'mys' || !r) {
      left = menu.x + w > vw - OKRAJ ? menu.x - w : menu.x;
      top = menu.y;
      if (top + h > vh - OKRAJ) { top = menu.y - h; nahoru = true; }
    } else if (menu.zdroj === 'dotyk') {
      left = menu.x - w / 2;
      top = r.bottom + OKRAJ;
      if (top + h > vh - OKRAJ) {
        top = r.top - OKRAJ - h;
        nahoru = true;
        // Nevejde se ani nad widget (vysoká karta na telefonu): kousek pod prst.
        if (top < OKRAJ) { top = menu.y + 24; nahoru = false; }
      }
    } else {
      left = r.right - w - 12;
      top = r.top + 12;
    }
    left = clamp(left, OKRAJ, vw - OKRAJ - w);
    top = clamp(top, OKRAJ, vh - OKRAJ - h);
    const ox = menu.zdroj === 'klavesnice' ? w : clamp(menu.x - left, 0, w);
    const oy = menu.zdroj === 'klavesnice' ? 0 : clamp(menu.y - top, 0, h);
    setPoloha({ left, top, origin: `${Math.round(ox)}px ${Math.round(oy)}px`, nahoru });
  }, [menu, pop.panelRef]);

  useEffect(() => {
    const zavri = () => zavritRef.current();
    window.addEventListener('scroll', zavri, { capture: true, passive: true });
    window.addEventListener('resize', zavri);
    return () => {
      window.removeEventListener('scroll', zavri, { capture: true });
      window.removeEventListener('resize', zavri);
    };
  }, []);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div data-plocha-chrom="">
      <MenuPanel
        ref={pop.panelRef}
        onKeyDown={pop.onPanelKeyDown}
        aria-label={`Nabídka widgetu ${nazev}`}
        direction={poloha?.nahoru ? 'up' : 'down'}
        // Nad plochou i nad lištou úprav (z-40), pod okny (z-70).
        className="fixed !z-50"
        style={{
          left: poloha?.left ?? 0,
          top: poloha?.top ?? 0,
          transformOrigin: poloha?.origin,
          // První snímek se jen měří — panel se ukáže až na svém místě.
          visibility: poloha ? 'visible' : 'hidden',
        }}
      >
        {polozky.map(it => (
          // Fokus zpátky na widget DŘÍV, než položka otevře okno: useModal si
          // místo návratu uloží při vykreslení (document.activeElement) a
          // položka menu, která by to jinak byla, v tomtéž commitu zmizí —
          // po zavření okna by fokus spadl na <body>. Bez místa návratu
          // (menu z myši nebo prstu v klidu) se fokus nevrací.
          <MenuItemButton key={it.label} {...it} onClick={() => { pop.close(!!menu.fokusZpet?.isConnected); it.onClick(); }} />
        ))}
      </MenuPanel>
    </div>,
    document.body,
  );
}

export default KontextoveMenu;
