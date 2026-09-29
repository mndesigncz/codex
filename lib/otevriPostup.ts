// Otevře detail konkrétního postupu i PŘES přechod na jiný pohled.
//
// Postupy detail otevírají událostí UDALOST_OTEVRIT_POSTUP (widget na téže
// stránce ji „přijme" přes `detail.prijato`). Když ale člověk přichází
// odjinud — z odkazu v zamčené uzávěrce — nástroj Postupy ještě není
// připojený a jediná událost by padla do prázdna: skončil by na seznamu a
// hledal. Tady se proto událost zkouší znovu, dokud ji Postupy nepřevezmou
// (na tabletu mezitím může viset „Kdo jsi?"), nejdéle LIMIT_MS.

import { UDALOST_OTEVRIT_POSTUP } from './postupyPrehled';

const LIMIT_MS = 30_000;
const KROK_MS = 200;

// Jen poslední požadavek platí: dva rychlé prokliky nesmí otevřít dva detaily.
let poradi = 0;

export function otevriPostupPoPrechodu(id: number): void {
  if (typeof window === 'undefined' || !Number.isFinite(id) || id <= 0) return;
  const moje = ++poradi;
  const zacatek = Date.now();
  const zkus = () => {
    if (moje !== poradi) return;
    const detail = { id, prijato: false };
    window.dispatchEvent(new CustomEvent(UDALOST_OTEVRIT_POSTUP, { detail }));
    if (detail.prijato || Date.now() - zacatek > LIMIT_MS) return;
    setTimeout(zkus, KROK_MS);
  };
  // Až po vykreslení nového pohledu — jeho efekty si posluchače teprve přidají.
  setTimeout(zkus, 0);
}
