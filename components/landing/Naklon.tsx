'use client';

import { useRef } from 'react';

// Paralaxa na kurzor.
//
// Hero má tři vrstvy nad sebou: fotku, tablet s aplikací a kartu „Dnes
// ráno". Když se s pohybem myši každá posune jinak daleko, oko je přečte
// jako předměty v prostoru, ne jako koláž. Je to jediný „3D" trik, který
// stojí nula bajtů modelu a nula WebGL — dvě CSS proměnné a translate.
//
// Jen tam, kde je kurzor (`hover: hover`); na dotyku by to nemělo čím
// hýbat, a s vypnutými animacemi se vrstvy nehnou vůbec. Hodnoty jdou do
// CSS proměnných, ne do stavu Reactu — překreslovat strom při každém
// pohybu myši by byla práce navíc bez důvodu.
export default function Naklon({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  const pohyb = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || e.pointerType !== 'mouse') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = el.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    const ny = ((e.clientY - r.top) / r.height - 0.5) * 2;
    el.style.setProperty('--nx', nx.toFixed(3));
    el.style.setProperty('--ny', ny.toFixed(3));
  };
  const odchod = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--nx', '0');
    el.style.setProperty('--ny', '0');
  };

  return (
    <div ref={ref} className={`naklon ${className}`} onPointerMove={pohyb} onPointerLeave={odchod}>
      {children}
    </div>
  );
}
