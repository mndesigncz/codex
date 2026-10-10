'use client';

// Zvolené období (rychlá volba / rozmezí, dny v týdnu, hrubost) uložené v prohlížeči pod klíčem obrazovky nebo widgetu.
// Při prvním vykreslení platí výchozí (SSR a hydratace se musí shodovat), uložená volba se načte hned potom.
// `ulozeno` říká, jestli si člověk něco zvolil; dokud ne, platí výchozí, které se může odvozovat (třeba z měsíce stránky).
import { useCallback, useEffect, useState } from 'react';
import { nactiObdobi, type Obdobi } from './obdobi';

const PREDPONA = 'managero-obdobi-';

export function useObdobi(klic: string, vychozi: Obdobi): { obdobi: Obdobi; nastav: (o: Obdobi) => void; obnov: () => void; ulozeno: boolean } {
  const [uloz, setUloz] = useState<Obdobi | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREDPONA + klic);
      setUloz(raw ? nactiObdobi(raw, vychozi) : null);
    } catch { /* soukromé okno */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [klic]);
  const nastav = useCallback((o: Obdobi) => {
    setUloz(o);
    try { localStorage.setItem(PREDPONA + klic, JSON.stringify(o)); } catch { /* soukromé okno */ }
  }, [klic]);
  const obnov = useCallback(() => {
    setUloz(null);
    try { localStorage.removeItem(PREDPONA + klic); } catch { /* soukromé okno */ }
  }, [klic]);
  return { obdobi: uloz ?? vychozi, nastav, obnov, ulozeno: uloz != null };
}
