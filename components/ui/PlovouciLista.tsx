'use client';

// Plovoucí lišta u spodní hrany — inkoustová pilulka nad obsahem.
//
// Tvar vznikl jako hromadný pruh ve Skladu (BulkBar) a stejný tvar má i lišta
// úprav stránky. Obě jsou teď tahle jedna komponenta: poloha, plocha se stínem
// (`.chrom-inkoust`), poznámka pod lištou i to, že na telefonu sedí nad dokem.
//
// Navíc lišta zapisuje na :root `--lista-vyska` (vzdálenost své horní hrany
// od spodku okna + 8 px). Toast si z ní bere spodní odsazení (`.toast-misto`
// v globals.css), takže „Widget odebrán · Vrátit" nikdy neleží přes lištu.

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

// V prohlížeči useLayoutEffect (změřit dřív, než se lišta ukáže), na serveru
// useEffect — React by jinak při vykreslení na serveru varoval.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

// Víc lišt naráz (hromadný pruh v okně nad lištou úprav) je výjimka, ale
// nesmí se rozbít: platí výška té nejvyšší a odchod jedné nesmaže druhou.
const vysky = new Map<symbol, number>();
function zapisVysku() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (vysky.size === 0) { root.style.removeProperty('--lista-vyska'); return; }
  root.style.setProperty('--lista-vyska', `${Math.max(...vysky.values())}px`);
}

/**
 * Plovoucí inkoustová lišta u spodní hrany obrazovky (na telefonu nad dokem):
 * hromadné akce nad vybranými řádky, lišta režimu úprav stránky. Do lišty
 * patří nejvýš jedna limetka (`btn btn-accent btn-sm`), ostatní akce jsou
 * tlumené pilulky `bg-white/10`. `note` je krátká věta pod lištou (co se
 * nepovedlo). S `animate` lišta vyjede zdola a po `open={false}` odjede
 * stejnou cestou; bez něj se objeví a zmizí hned (jako dosud BulkBar).
 */
export function PlovouciLista({ label, children, note, open = true, animate = false, className = '' }: {
  /** Název oblasti pro odečítač („Vybráno 3", „Úpravy stránky"). */
  label: string;
  children: React.ReactNode;
  note?: React.ReactNode;
  open?: boolean;
  animate?: boolean;
  /** Třídy navíc pro samotnou pilulku. */
  className?: string;
}) {
  // Při zavírání s animací zůstane lišta ještě 160 ms vykreslená a odjíždí.
  // Stav se odvodí hned při vykreslení (ne až v efektu), takže bez animace
  // zmizí ve stejném snímku jako dřív BulkBar.
  const [odjizdi, setOdjizdi] = useState(false);
  const [minulaOpen, setMinulaOpen] = useState(open);
  if (open !== minulaOpen) {
    setMinulaOpen(open);
    setOdjizdi(!open && animate);
  }
  useEffect(() => {
    if (!odjizdi) return;
    const t = setTimeout(() => setOdjizdi(false), 160);
    return () => clearTimeout(t);
  }, [odjizdi]);

  const obalRef = useRef<HTMLDivElement>(null);
  const klic = useRef(Symbol('lista'));
  const vykreslit = open || odjizdi;
  const viditelna = open;

  useIsoLayoutEffect(() => {
    const obal = obalRef.current;
    const k = klic.current;
    if (!viditelna || !obal) return;
    // Měří se vnější obal, ne pilulka: pilulka při příjezdu jede přes
    // transform a její obdélník by na začátku lhal o víc než výšku lišty.
    const zmer = () => {
      const top = obal.getBoundingClientRect().top;
      vysky.set(k, Math.max(0, Math.round(window.innerHeight - top + 8)));
      zapisVysku();
    };
    zmer();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(zmer) : null;
    ro?.observe(obal);
    window.addEventListener('resize', zmer);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', zmer);
      // Odchod začíná hned: toast za odjíždějící lištou sjede dolů spolu s ní.
      vysky.delete(k);
      zapisVysku();
    };
  }, [viditelna]);

  if (!vykreslit) return null;
  return (
    <div
      ref={obalRef}
      // Pevně u dolní hrany, na telefonu nad dokem.
      //
      // Napoprvé to bylo `sticky` uvnitř sekce — jenže sekce bývá vyšší než
      // obrazovka, takže lišta zůstala viset uprostřed seznamu a zakrývala
      // řádky, které si člověk chtěl přečíst. Plovoucí lišta u spodní hrany
      // je vždycky na stejném místě a seznam se pod ní veze.
      className="fixed inset-x-0 bottom-[calc(104px+env(safe-area-inset-bottom))] md:bottom-6 z-40 flex justify-center px-3 pointer-events-none"
      role="region"
      aria-label={label}
    >
      <div
        // Odjíždějící lištu už nejde ovládat — kliknutí by šlo do prázdna.
        inert={odjizdi || undefined}
        className={`flex flex-col items-center max-w-full ${odjizdi ? 'pointer-events-none lista-odjezd' : `pointer-events-auto ${animate ? 'lista-prijezd' : ''}`}`}
      >
        {/* Plocha a stín z `.chrom-inkoust`: pevná i v tmavém režimu (obsah pod
            lištou neprosvítá) a se skutečným stínem — utilita stínu s holou
            proměnnou v Tailwindu 3.4 žádný stín nedá (scripts/check-shadow-var). */}
        <div className={`flex items-center gap-2 flex-wrap justify-center rounded-full chrom-inkoust px-4 py-2.5 ${className}`}>
          {children}
        </div>
        {note && (
          <p className="mt-2 rounded-full bg-white/95 px-3 py-1.5 text-center text-xs font-medium text-bad-ink shadow">{note}</p>
        )}
      </div>
    </div>
  );
}

export default PlovouciLista;
