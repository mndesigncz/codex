'use client';

// Je obrazovka telefon (pod `md`, tj. do 767 px)? Pro věci, které se na
// telefonu kreslí jinak a CSS na ně nestačí — plovoucí lišta (PlovouciLista
// měří svou výšku pro toast, takže nesmí být jen `display: none`), jiný
// průvodce formulářem.
//
// Na serveru a při prvním vykreslení vrací false, ať se HTML ze serveru
// shoduje s klientem; telefon se pozná hned po připojení. Co se smí lišit jen
// vzhledem, řeší dál Tailwind (`md:hidden`) — tenhle hook je pro chování.

import { useEffect, useState } from 'react';

export const TELEFON_DOTAZ = '(max-width: 767px)';

export function useJeTelefon(): boolean {
  const [telefon, setTelefon] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(TELEFON_DOTAZ);
    const zmer = () => setTelefon(mq.matches);
    zmer();
    mq.addEventListener('change', zmer);
    return () => mq.removeEventListener('change', zmer);
  }, []);
  return telefon;
}
