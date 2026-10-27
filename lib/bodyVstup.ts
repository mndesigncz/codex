// Pole pro body se znaménkem (hodnocení směny, srážky v Nastavení bodů) — čistá logika pro components/employer/BodyVstup.
//
// Proč ne <input type="number">: rozepsané „-" prohlížeč hlásí jako prázdnou hodnotu, řízené pole se přes
// parseInt(...) || 0 hned přepsalo na 0 a zápor nešel napsat vůbec; iPhone u inputMode="numeric" klávesu
// minus nemá. Text drží rozepsaný stav, číslo se pošle, až dává smysl; znaménko jde otočit tlačítkem ±.

/** Nejvíc číslic (−500…500 i rezerva). */
const MAX_CISLIC = 4;

/** Rozepsaný text bodů: jen jedno znaménko minus na začátku (i „−", „–") a číslice. „+5" = „5". */
export function cistiTextBodu(raw: string): string {
  const s = String(raw ?? '').trim().replace(/[−–—]/g, '-');
  const zaporne = s.startsWith('-');
  const cislice = s.replace(/\D/g, '').slice(0, MAX_CISLIC);
  return `${zaporne ? '-' : ''}${cislice}`;
}

/** Číslo z rozepsaného textu oříznuté do rozsahu; „" a samotné „-" ještě číslo nejsou (null). */
export function hodnotaBodu(text: string, min: number, max: number): number | null {
  const t = cistiTextBodu(text);
  if (t === '' || t === '-') return null;
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

/** Text pole z uložené hodnoty. */
export function textBodu(n: number): string {
  return String(Math.round(Number(n) || 0));
}

/** Krok −/+ v rozsahu (z nuly dolů do srážky, když to rozsah dovolí). */
export function krokBodu(hodnota: number, delta: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round((Number(hodnota) || 0) + delta)));
}

/** Tlačítko ±: otočí znaménko rozepsaného textu („15" ↔ „-15", prázdné → „-"). */
export function otocZnamenko(text: string): string {
  const t = cistiTextBodu(text);
  return t.startsWith('-') ? t.slice(1) : `-${t}`;
}
