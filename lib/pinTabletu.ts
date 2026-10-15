// PIN na tabletu (spuštění, balík S). Čistá logika bez databáze.
//
// - Nový PIN má 6 číslic (milion kombinací místo deseti tisíc). Staré
//   4–5místné PINy platí dál, vedení u nich vidí doporučení změnit je.
// - Tablet po pěti špatných PINech za sebou u téhož člověka na 30 s ztichne.
//   Online hlídá server přísněji (5 pokusů za 10 min, app/api/attendance),
//   tohle je hlavně pro tablet bez internetu, kde PIN ověřuje proti otisku
//   sám a server o pokusech neví.

export const PIN_DELKA_NOVA = 6;
export const PIN_DELKA_MIN_STARA = 4;
export const PIN_POKUSU = 5;
export const PIN_PAUZA_MS = 30_000;

/** Nový PIN od vedení: jen číslice, přesně 6. null = smazat PIN. */
export function novyPin(raw: unknown): { ok: true; pin: string | null } | { ok: false; chyba: string } {
  if (raw === null || raw === undefined || raw === '') return { ok: true, pin: null };
  const pin = String(raw).replace(/\D/g, '');
  if (pin.length !== PIN_DELKA_NOVA) return { ok: false, chyba: 'PIN musí mít 6 číslic.' };
  return { ok: true, pin };
}

/** Má člověk PIN kratší než 6 číslic (nebo neznámé délky z doby před pin_delka)? */
export function pinKratky(delka: number | null | undefined): boolean {
  return delka == null || !Number.isFinite(delka) || delka < PIN_DELKA_NOVA;
}

/** Kolik teček kreslí tablet: známá délka, jinak aspoň 4 a roste s psaním do 6. */
export function tecekPinu(delka: number | null | undefined, zadano: number): number {
  if (delka != null && delka >= PIN_DELKA_MIN_STARA && delka <= PIN_DELKA_NOVA) return delka;
  return Math.min(PIN_DELKA_NOVA, Math.max(PIN_DELKA_MIN_STARA, zadano));
}

/** Je zadaný PIN dost dlouhý na odeslání? Známá délka = přesně ta, jinak 4–6. */
export function pinKompletni(delka: number | null | undefined, zadano: number): boolean {
  if (delka != null && delka >= PIN_DELKA_MIN_STARA && delka <= PIN_DELKA_NOVA) return zadano === delka;
  return zadano >= PIN_DELKA_MIN_STARA && zadano <= PIN_DELKA_NOVA;
}

export interface StavPokusu { spatne: number; zamcenoDo: number }

/** Po špatném PINu: pátý špatný za sebou zamkne na 30 s a počítadlo začne znovu. */
export function poSpatnemPinu(s: StavPokusu | undefined, ted: number): StavPokusu {
  const spatne = (s && s.zamcenoDo <= ted ? s.spatne : s?.spatne ?? 0) + 1;
  return spatne >= PIN_POKUSU ? { spatne: 0, zamcenoDo: ted + PIN_PAUZA_MS } : { spatne, zamcenoDo: s?.zamcenoDo ?? 0 };
}

/** Kolik vteřin ještě zbývá pauza (0 = smí se zkoušet). */
export function zbyvaPauza(s: StavPokusu | undefined, ted: number): number {
  return s && s.zamcenoDo > ted ? Math.ceil((s.zamcenoDo - ted) / 1000) : 0;
}
