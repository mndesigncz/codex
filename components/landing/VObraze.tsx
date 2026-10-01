'use client';

import { useEffect, useRef, useState } from 'react';

// Obal, který řekne CSS, že je jeho obsah v obraze (`data-v-obraze`). Malé
// obrazovky v sekcích se podle toho jednou přehrají (výběr, kód, rozvrh) a pak
// zůstanou v koncovém stavu. Ze serveru odchází rovnou koncový stav: bez
// skriptu a s vypnutým pohybem je všechno vidět hotové, animace je bonus.
export default function VObraze({ children, className = '', as: Tag = 'div' }: {
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'ol' | 'ul';
}) {
  const ref = useRef<HTMLElement>(null);
  const [stav, setStav] = useState<'hotovo' | 'ceka' | 'hraje'>('hotovo');

  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Co je už vidět při načtení, se nepřehrává (nemá se kam „objevit").
    if (el.getBoundingClientRect().top < window.innerHeight * 0.85) return;
    setStav('ceka');
    const io = new IntersectionObserver(([z]) => {
      if (z.isIntersecting) { setStav('hraje'); io.disconnect(); }
    }, { rootMargin: '0px 0px -22% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Tag ref={ref as any} className={className} data-v-obraze={stav}>
      {children}
    </Tag>
  );
}
