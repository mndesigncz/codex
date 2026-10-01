'use client';

import { useLayoutEffect, useRef, useState } from 'react';

// Přepínač na inkoustovém jevišti. Chová se jako `Segmented` z aplikace
// (role tab, jedna pilulka, která přejíždí, vždy jeden řádek, co se nevejde,
// jede prstem do strany), jen mluví jazykem jeviště: obrys místo skla,
// limetková pilulka pro hlavní přepínač scén a tichá pro role a zařízení.
export default function Prepinac<T extends string>({ moznosti, hodnota, onZmena, popis, ton = 'limetka', velikost = 'md' }: {
  moznosti: { id: T; label: string }[];
  hodnota: T;
  onZmena: (id: T) => void;
  popis: string;
  ton?: 'limetka' | 'tichy';
  velikost?: 'md' | 'sm';
}) {
  const pas = useRef<HTMLDivElement>(null);
  const [pilulka, setPilulka] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const el = pas.current;
    if (!el) return;
    const mer = () => {
      const on = el.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!on) { setPilulka(null); return; }
      setPilulka({ x: on.offsetLeft, y: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight });
      // Vybraná položka do záběru jen v pásu, ne posunem celé stránky.
      if (el.scrollWidth > el.clientWidth) {
        const a = on.offsetLeft - 24;
        const b = on.offsetLeft + on.offsetWidth + 24;
        if (a < el.scrollLeft) el.scrollLeft = Math.max(0, a);
        else if (b > el.scrollLeft + el.clientWidth) el.scrollLeft = b - el.clientWidth;
      }
    };
    mer();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(mer) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [hodnota, moznosti]);

  return (
    <div className="ld-prepinac" data-ton={ton} data-velikost={velikost}>
      <div ref={pas} role="tablist" aria-label={popis} className="ld-prepinac-pas">
        {pilulka && (
          <span aria-hidden className="ld-prepinac-pilulka"
            style={{ transform: `translate(${pilulka.x}px, ${pilulka.y}px)`, width: pilulka.w, height: pilulka.h }} />
        )}
        {moznosti.map(m => (
          <button key={m.id} type="button" role="tab" aria-selected={m.id === hodnota}
            className="ld-prepinac-polozka" onClick={() => onZmena(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
