'use client';

import { useEffect, useRef, useState } from 'react';

// Otočka hrníčku — krátká smyčka místo interaktivního modelu. Video se
// načte, až když sekce doscrolluje do obrazu; do té doby (a při šetření
// daty, vypnutých animacích nebo chybě) drží místo obrázek. Je to
// dekorace: bez zvuku, mimo čtečky, stránka na ní nestojí.
export default function SpinShowcase({ video, fallback, alt }: { video: string; fallback: string; alt: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [play, setPlay] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const conn = (navigator as any).connection;
    if (conn?.saveData) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      setPlay(true);
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={box} className="relative aspect-square w-full overflow-hidden rounded-[2rem]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={fallback} alt={alt} width={640} height={640} loading="lazy"
        className="absolute inset-0 h-full w-full object-contain" />
      {play && !failed && (
        // Bílé pozadí otočky se násobením propadne do skla — objekt bez
        // vlastního rámečku, žádný „obdélník videa" v panelu.
        <video muted loop playsInline autoPlay preload="none" aria-hidden
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover mix-blend-multiply">
          <source src={video} type="video/mp4" />
        </video>
      )}
    </div>
  );
}
