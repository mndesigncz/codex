// Kam vede „Otevřít návod", když to volající neví.
//
// Odkaz na návod se dá otevřít dvěma způsoby a záleží na tom, kde člověk
// stojí. Ve webu se jde na `?view=guides&guide=N` a layout to přečte. Na
// tabletu žádné URL směrování není — kiosk má záložky a musí přepnout sám.
//
// Plovoucí běžec postupů (`FloatingRunner`) je přitom v `app/providers.tsx`,
// tedy nad všemi třemi rozhraními naráz, a žádné prop o tom, kde je, nedostane.
// Proto tenhle malý registr: kiosk si přebere otevírání na sebe, ostatní
// spadnou na odkaz. Bez registrace a bez rozpoznané cesty se tlačítko
// nevykreslí vůbec — radši nic než tlačítko, které nikam nevede.

import { useEffect, useState } from 'react';

type Handler = (guideId: number) => void;

let handler: Handler | null = null;

/** Kiosk si přebere otevírání návodů. Vrací funkci, která registraci zruší. */
export function prevezmiOtevreniNavodu(fn: Handler): () => void {
  handler = fn;
  return () => { if (handler === fn) handler = null; };
}

/** Má někdo otevírání přebrané? */
export function navodyOtevirasSam(): boolean {
  return handler !== null;
}

export function otevriNavod(guideId: number): void {
  handler?.(guideId);
}

/**
 * Odkaz na návod podle toho, v jaké části aplikace jsme.
 *
 * `null` znamená „odsud se na návod odkazem nedostaneš" — typicky kiosk,
 * kde to řeší registr výš.
 */
export function odkazNaNavod(pathname: string, guideId: number): string | null {
  if (pathname.startsWith('/employer')) return `/employer/overview?view=guides&guide=${guideId}`;
  if (pathname.startsWith('/employee')) return `/employee/shifts?view=guides&guide=${guideId}`;
  return null;
}

/**
 * Props pro `StepTimeline`, aby „Otevřít návod" vedlo tam, kam má.
 *
 * Prázdný objekt = odsud se na návod dostat nedá a tlačítko se nevykreslí.
 * Počítá se až v prohlížeči, protože rozhoduje `window.location`.
 */
export function useOtevreniNavodu(): {
  onOpenGuide?: (id: number) => void;
  guideHref?: (id: number) => string;
} {
  const [props, setProps] = useState<{ onOpenGuide?: Handler; guideHref?: (id: number) => string }>({});
  useEffect(() => {
    if (navodyOtevirasSam()) { setProps({ onOpenGuide: otevriNavod }); return; }
    const cesta = window.location.pathname;
    // Jedno zkusmo sestavení řekne, jestli tahle část aplikace odkaz umí.
    if (!odkazNaNavod(cesta, 1)) { setProps({}); return; }
    setProps({ guideHref: (id: number) => odkazNaNavod(cesta, id) as string });
  }, []);
  return props;
}
