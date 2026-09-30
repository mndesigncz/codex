// Kdo se zapisuje na sdíleném tabletu.
//
// Tablet za barem nepatří nikomu. Přesto si dřív jméno vybíral sám a mlčky:
//
//   setActiveId(onShift[0]?.id ?? null);
//
// `onShift[0]` je „kdo je první v rozpisu". Když Anně skončila směna, tablet
// se v tu chvíli stal Bobem — a všechno, co kdokoli dál odklikal, šlo na
// Bobovo jméno. Bob se to dozvěděl z uzávěrky. K tomu si identitu držel
// šestnáct hodin, protože cookie měla takovou platnost; že se na tablet
// půl dne nikdo nepodíval, na tom nic neměnilo.
//
// Pravidlo je proto jednoduché a nesmí se dát obejít: **mezi víc lidmi se
// nehádá**. Jeden člověk na směně odhad není, to je fakt. Dva a víc znamená,
// že se tablet zeptá — a než dostane odpověď, nezapíše nic.

/** Po téhle době bez dotyku tablet neví, kdo u něj stojí. */
export const IDLE_MS = 10 * 60 * 1000;

export interface IdentityInput {
  /** Kdo byl vybraný dosud; `null` = tablet neví. */
  prev: number | null;
  /** Id lidí, kteří jsou právě na směně. */
  onShift: number[];
  /** Jak dlouho se na tablet nesáhlo (ms). */
  idleFor: number;
  /** Práh nečinnosti; jde přenastavit kvůli testům. */
  idleMs?: number;
}

/**
 * Kdo se má zapisovat teď. `null` znamená „zeptej se", ne „nikdo".
 *
 * Volá se po každé změně rozpisu i v tiku nečinnosti, takže musí být
 * idempotentní: dvakrát po sobě se stejným vstupem dá stejný výsledek.
 */
export function nextActiveId({ prev, onShift, idleFor, idleMs = IDLE_MS }: IdentityInput): number | null {
  // Jeden člověk na směně: ať se stalo cokoli, plete se to s nikým.
  if (onShift.length === 1) return onShift[0];
  if (onShift.length === 0) return null;

  // Vybraný člověk mezitím odešel ze směny — jeho jméno už nesmí nic nést.
  if (prev == null || !onShift.includes(prev)) return null;

  // Jméno drží jen proto, že na tablet nikdo nesáhl. To po chvíli přestává
  // být důkaz, že u něj stojí pořád ten samý člověk.
  if (idleFor > idleMs) return null;

  return prev;
}

/** Ptá se tablet na jméno, nebo ho zná? */
export function needsWho(active: number | null, onShift: number[]): boolean {
  return active == null && onShift.length > 0;
}

// ---------------------------------------------------------------------------
// Cookie „kdo u tabletu stojí"
// ---------------------------------------------------------------------------
//
// Server ji čte u zápisů, které si tělo skládají samy (dokončení postupu,
// ±1 ve skladu, zápis zbytků). Platí hodinu — ale dřív se zapsala jen při
// ZMĚNĚ vybrané osoby. Jediný člověk na směně se za celou směnu nezměnil, po
// hodině cookie vypršela a tablet dál v hlavičce psal „Zapisuje se jako
// Martin", zatímco záznamy šly tiše na účet tabletu. Cookie proto zrcadlí
// stav v prohlížeči: dokud si tablet někoho pamatuje, obnovuje se.

/** Platnost cookie — pojistka, aby identita nepřežila zavřený tablet. */
export const ACTING_MAX_AGE_S = 60 * 60;
/** Jak často se cookie obnoví, dokud tablet někoho drží (řádově míň než platnost). */
export const ACTING_OBNOVA_MS = 5 * 60 * 1000;
/** Nejčastěji se obnovuje při dotyku — víc než jednou za půl minuty nemá smysl. */
export const ACTING_DOTYK_MS = 30 * 1000;

/** Má se cookie znovu zapsat? `posledniZapis` = kdy se psala naposled (0 = nikdy). */
export function obnovitCookie(posledniZapis: number, ted: number, odstupMs: number = ACTING_DOTYK_MS): boolean {
  return posledniZapis <= 0 || ted - posledniZapis >= odstupMs;
}
