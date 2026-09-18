'use client';

import { useRef } from 'react';

// Náklon za kurzorem — ten „3D" pocit z prodejní stránky.
//
// Jen pár stupňů a jen tam, kde je jemný ukazatel (myš/trackpad): na dotyku
// nemá kurzor smysl a `prefers-reduced-motion` znamená nechat věci na pokoji.
// Transformace jde přes rAF, ať se nehýbe layout a nepočítá se víc než
// jednou za snímek.
export default function Tilt({ children, max = 7, className = '' }: {
  children: React.ReactNode;
  /** Největší náklon ve stupních. */
  max?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const raf = useRef(0);

  const smi = () =>
    typeof window !== 'undefined' &&
    window.matchMedia('(pointer: fine)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const move = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || !smi()) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      el.style.transform = `perspective(1100px) rotateX(${(-y * max).toFixed(2)}deg) rotateY(${(x * max).toFixed(2)}deg)`;
    });
  };

  const leave = () => {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      el.style.transform = 'perspective(1100px) rotateX(0deg) rotateY(0deg)';
    });
  };

  return (
    <div ref={ref} onPointerMove={move} onPointerLeave={leave}
      className={`transition-transform duration-300 will-change-transform ${className}`}
      style={{ transformStyle: 'preserve-3d' }}>
      {children}
    </div>
  );
}
