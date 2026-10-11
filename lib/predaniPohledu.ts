// Předání z widgetu do nástroje stránky: „otevři to s tímhle filtrem". Widget má v katalogu `cil.arg` („stav:new"),
// layout ho při přechodu předá sem a nástroj ho přečte, jakmile se připojí (nebo hned, když už je otevřený).
//
// Předání platí jen pár vteřin a při čtení se nemaže: plocha si nástroj po načtení rozložení odmontuje a připojí
// znovu, a ten druhý by o předání jinak nevěděl (stejně jako u Úkolů, lib/ukolyFiltr.ts).

const PLATNOST_MS = 6000;
const klic = (pohled: string) => `managero-predani-${pohled}`;
export const udalostPredani = (pohled: string) => `managero:predani:${pohled}`;

export function predejPohledu(pohled: string, arg: string | undefined): void {
  if (!arg || typeof window === 'undefined') return;
  try { sessionStorage.setItem(klic(pohled), JSON.stringify({ arg, cas: Date.now() })); } catch { /* soukromé okno: otevře se bez předání */ }
  window.dispatchEvent(new CustomEvent(udalostPredani(pohled), { detail: arg }));
}

/** Čerstvé předání uložené `predejPohledu`, nebo null. */
export function cerstvePredaniPohledu(pohled: string): string | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(klic(pohled)) ?? 'null');
    return v && typeof v.arg === 'string' && Date.now() - Number(v.cas) < PLATNOST_MS ? v.arg : null;
  } catch { return null; }
}

/** „stav:new" → „new" (jen z povolených hodnot), jinak undefined. */
export function stavZPredani(arg: string | null | undefined, povolene: readonly string[]): string | undefined {
  const m = /^stav:([a-z_]+)$/.exec(String(arg ?? ''));
  return m && povolene.includes(m[1]) ? m[1] : undefined;
}
