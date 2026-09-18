'use client';

import { useLayoutEffect, useRef, useState } from 'react';

// Objevení při scrollu — ale poctivě: ze serveru odchází obsah viditelný.
// Schová se až v prohlížeči, těsně před vykreslením, a jen když je pod
// ohybem stránky. Kdo je bez JavaScriptu, s vypnutými animacemi nebo mu
// skript nedojel po slabé síti, vidí všechno hned; animace je bonus,
// ne podmínka.
export default function Reveal({ children, delay = 0, className = '' }: {
  children: React.ReactNode;
  /** Zpoždění v ms po vjezdu do obrazu — na rozestup karet vedle sebe. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!('IntersectionObserver' in window)) return;
    // Jen co je pod ohybem — co je vidět hned, se nemá kam „objevovat".
    if (el.getBoundingClientRect().top <= window.innerHeight * 0.92) return;
    setHidden(true);
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setHidden(false); io.disconnect(); }
    }, { rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref}
      className={`${className} transition-[opacity,transform] duration-700 ease-out`}
      style={{ opacity: hidden ? 0 : 1, transform: hidden ? 'translateY(18px)' : 'none', transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
