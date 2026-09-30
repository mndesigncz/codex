'use client';

// Jedno globální okno pro případ, že nativní obal soubor nepředal (lib/stahni:
// export, kalendář, tisk). Bez něj by tlačítko v obalu zůstalo mrtvé.

import { useEffect, useState } from 'react';
import { Toast } from './ui/Toast';
import { UDALOST_NEJDE, HLASKA_NEJDE_ULOZIT } from '@/lib/stahni';

export default function UlozeniHlaska() {
  const [zprava, setZprava] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    const posluchac = () => { setZprava(HLASKA_NEJDE_ULOZIT); setN(x => x + 1); };
    window.addEventListener(UDALOST_NEJDE, posluchac);
    return () => window.removeEventListener(UDALOST_NEJDE, posluchac);
  }, []);
  return <Toast message={zprava} id={n} tone="bad" ms={6000} onClose={() => setZprava(null)} />;
}
