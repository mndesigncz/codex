'use client';

// Otevřená aplikace = pokladna se synchronizuje sama.
//
// Po otevření a pak každých pár minut, dokud je okno vidět, se sáhne na
// /api/pos/tick. Server má vlastní škrticí klapku, takže deset otevřených
// oken pokladnu nezahltí — prostě první z nich synchronizuje a ostatní
// dostanou „přeskočeno". Kiosk na baru běží celý den, tím je postaráno
// o průběžnost i bez toho, aby to někdo řešil.

import { useEffect } from 'react';

const EVERY_MS = 4 * 60 * 1000;

export default function PosTick() {
  useEffect(() => {
    let stopped = false;
    const tick = () => {
      if (stopped || document.visibilityState !== 'visible') return;
      fetch('/api/pos/tick').catch(() => { /* zkusí se příště */ });
    };
    tick();
    const t = setInterval(tick, EVERY_MS);
    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { stopped = true; clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  return null;
}
