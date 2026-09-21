'use client';

import { useEffect, useRef, useState } from 'react';

// Fotka v hero, která ožije.
//
// Video vzniklo z téže fotky, která pod ním leží jako poster — takže když se
// nenačte, nehraje, nebo ho člověk nechce, nikdo nepozná, že mělo být.
// Stahuje se jen tam, kde má smysl: na obrazovce od 768 px (na telefonu jsou
// megabajty za pět vteřin pohybu špatný obchod), bez `saveData`, bez pomalé
// sítě a bez `prefers-reduced-motion`. Zdroj se do <video> vkládá až po
// rozhodnutí — prohlížeč jinak začne stahovat, i když se pak neukáže.
/** `src` je cesta BEZ přípony: vedle sebe leží `.webm` (VP9, menší) a `.mp4` (H.264, záloha pro Safari). */
export default function HeroVideo({ src }: { src: string }) {
  const [povoleno, setPovoleno] = useState(false);
  const [hraje, setHraje] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const mq = (q: string) => window.matchMedia(q).matches;
    if (mq('(prefers-reduced-motion: reduce)')) return;
    if (!mq('(min-width: 768px)')) return;
    const c = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (c?.saveData || /(^|[^a-z])(slow-)?2g/.test(c?.effectiveType ?? '')) return;
    setPovoleno(true);
  }, []);

  useEffect(() => {
    if (!povoleno || !ref.current) return;
    // Autoplay může prohlížeč odmítnout; pak zůstane fotka a nic se neděje.
    ref.current.play().catch(() => { /* fotka stačí */ });
  }, [povoleno]);

  if (!povoleno) return null;
  return (
    <video
      ref={ref}
      className={`hero-video absolute inset-0 h-full w-full object-cover ${hraje ? 'hraje' : ''}`}
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden
      onPlaying={() => setHraje(true)}
    >
      <source src={`${src}.webm`} type="video/webm" />
      <source src={`${src}.mp4`} type="video/mp4" />
    </video>
  );
}
