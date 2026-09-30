// Komunikace ukázky s rodičovskou stránkou (prodejní stránka v <iframe>).
//
// Ven: `{ typ: 'demo-pripraveno' }` a `{ typ: 'demo-akce', akce, detail }`.
// Dovnitř: `{ typ: 'demo-reset' }`, `{ typ: 'demo-scena', scena, role? }` a
// `{ typ: 'demo-ping' }` (odpověď: znovu poslední `demo-pripraveno`; rodič, který
// se hydratuje pozdě, by ho jinak nikdy nedostal).
// Zprávy se posílají jen na vlastní původ a přijímají jen z vlastního
// původu: prodejní stránka i ukázka jsou téhož webu, cizí stránka ukázku
// ovládat nemá (a díky X-Frame-Options / frame-ancestors ji ani nevloží).

import { jeRole, jeScena, type IdScenyDema, type RoleDema } from './sceny';

export type ZpravaVen =
  | { typ: 'demo-pripraveno'; scena: IdScenyDema; role: RoleDema; okno: boolean }
  | { typ: 'demo-akce'; akce: string; detail?: Record<string, unknown> };

export type ZpravaDovnitr =
  | { typ: 'demo-reset' }
  | { typ: 'demo-ping' }
  | { typ: 'demo-scena'; scena: IdScenyDema; role?: RoleDema };

declare global {
  interface Window { __demoUdalosti?: ZpravaVen[] }
}

/** Pošle zprávu rodiči (je-li). Vždy si ji ale zapíše do `__demoUdalosti` (sondy, ladění). */
export function posliRodici(z: ZpravaVen): void {
  if (typeof window === 'undefined') return;
  (window.__demoUdalosti ??= []).push(z);
  if (window.parent && window.parent !== window) {
    try { window.parent.postMessage(z, window.location.origin); } catch { /* rodič zmizel */ }
  }
}

/** Pošle rodiči znovu poslední `demo-pripraveno` (když ještě nebylo, nic: přijde samo). */
export function zopakujPripraveno(): void {
  if (typeof window === 'undefined' || !window.parent || window.parent === window) return;
  const posledni = [...(window.__demoUdalosti ?? [])].reverse().find(u => u.typ === 'demo-pripraveno');
  if (!posledni) return;
  // Přímo, ne přes posliRodici: `__demoUdalosti` je záznam, ne fronta (sondy počítají události).
  try { window.parent.postMessage(posledni, window.location.origin); } catch { /* rodič zmizel */ }
}

/** Přečte a ověří příchozí zprávu; cizí původ a neznámý tvar vrátí null. */
export function rozeberZpravu(e: MessageEvent): ZpravaDovnitr | null {
  if (e.origin !== window.location.origin) return null;
  const d = e.data;
  if (!d || typeof d !== 'object') return null;
  if (d.typ === 'demo-reset') return { typ: 'demo-reset' };
  if (d.typ === 'demo-ping') return { typ: 'demo-ping' };
  if (d.typ === 'demo-scena' && jeScena(d.scena)) {
    return { typ: 'demo-scena', scena: d.scena, ...(jeRole(d.role) ? { role: d.role } : {}) };
  }
  return null;
}
