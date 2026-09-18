'use client';

import { useEffect, useRef, useState } from 'react';

// Živá scéna v hero: napřed obrázek (LCP, žádné čekání), video se přidá
// až potom a jen tam, kde je vítané — ne při šetření datami, ne při
// vypnutých animacích. Když se video nepovede načíst, zůstane obrázek
// a nikdo nic nepozná.
export default function HeroMedia({ poster, video, alt }: { poster: string; video: string; alt: string }) {
  const [playVideo, setPlayVideo] = useState(false);
  const vid = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const conn = (navigator as any).connection;
    if (conn?.saveData) return;
    // Na telefonu je scéna malá a data drahá — obrázek stačí.
    if (window.innerWidth < 640) return;
    const t = setTimeout(() => setPlayVideo(true), 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="relative w-full aspect-[3/2] overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={poster} alt={alt} width={1536} height={1024} loading="eager" fetchPriority="high"
        className="absolute inset-0 h-full w-full object-cover" />
      {playVideo && (
        <video ref={vid} muted loop playsInline autoPlay preload="none" poster={poster}
          aria-hidden
          onError={() => setPlayVideo(false)}
          className="absolute inset-0 h-full w-full object-cover">
          <source src={video} type="video/mp4" />
        </video>
      )}
    </div>
  );
}
