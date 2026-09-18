// Rozepsaný formulář, který přežije odchod na jinou záložku.
//
// Rozhodování je oddělené od Reactu, aby se dalo proměřit testem. Hook
// kolem toho jen sbírá stav a sahá na úložiště.

/** Má koncept vůbec co zachraňovat? Prázdné pole ani nula se nepočítají. */
export function maObsah(hodnota: unknown): boolean {
  if (hodnota == null) return false;
  if (typeof hodnota === 'string') return hodnota.trim() !== '';
  if (Array.isArray(hodnota)) return hodnota.some(maObsah);
  if (typeof hodnota === 'object') return Object.values(hodnota as Record<string, unknown>).some(maObsah);
  return false;
}

/**
 * Uložený koncept se skládá na výchozí tvar, ne naopak.
 *
 * Formulář se během vývoje mění: přibude pole, jiné zmizí, třetí změní typ.
 * Koncept z minulého týdne o tom neví. Kdyby se dosadil celý, dostal by
 * formulář tvar, který už neumí — proto se berou jen klíče, které výchozí
 * tvar zná, a jen když sedí typ. Co nesedí, tiše propadne.
 */
export function slouceni<T extends Record<string, unknown>>(vychozi: T, ulozeny: unknown): T {
  if (!ulozeny || typeof ulozeny !== 'object' || Array.isArray(ulozeny)) return vychozi;
  const zdroj = ulozeny as Record<string, unknown>;
  const out: Record<string, unknown> = { ...vychozi };
  for (const klic of Object.keys(vychozi)) {
    if (!(klic in zdroj)) continue;
    const a = vychozi[klic], b = zdroj[klic];
    if (Array.isArray(a) !== Array.isArray(b)) continue;
    if (typeof a !== typeof b) continue;
    out[klic] = b;
  }
  return out as T;
}

/**
 * Liší se formulář od prázdného?
 *
 * Tohle je ta správná otázka, ne „nese něco". Formulář má výchozí hodnoty
 * — priorita `medium`, typ volna `vacation` — a ty jsou neprázdné samy
 * o sobě. První verze se ptala jen na obsah, takže i po zahození zůstal
 * v úložišti prázdný koncept navěky. Chytila to sonda, ne úvaha.
 */
export function liseSeOdPrazdneho(hodnota: unknown, vychozi: Record<string, unknown>): boolean {
  return JSON.stringify(slouceni(vychozi, hodnota)) !== JSON.stringify(vychozi);
}

/**
 * Obnovit jen tam, kde to dává smysl: zakládá se nová věc (ne upravuje
 * existující), koncept něco obsahuje a liší se od prázdného formuláře.
 * Předvyplnit formulář tím, co v něm stejně bylo, by byla jen matoucí
 * hláška o ničem.
 */
export function maSeObnovit({ upravujeSe, ulozeny, vychozi }: {
  upravujeSe: boolean;
  ulozeny: unknown;
  vychozi: Record<string, unknown>;
}): boolean {
  if (upravujeSe) return false;
  if (!maObsah(ulozeny)) return false;
  return liseSeOdPrazdneho(ulozeny, vychozi);
}
