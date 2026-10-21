'use client';
// Je okno aspoň `px` široké? Pro obrazovky správy, které kreslí buď tabulku (monitor), nebo řádky
// seznamu (telefon) — vždy jen jednu podobu, ať text není v DOM dvakrát. Před hydratací false (telefon).
import { useEffect, useState } from 'react';

export function useSirka(px: number): boolean {
  const [ano, setAno] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(`(min-width: ${px}px)`);
    const zmer = () => setAno(mq.matches);
    zmer();
    mq.addEventListener('change', zmer);
    return () => mq.removeEventListener('change', zmer);
  }, [px]);
  return ano;
}
