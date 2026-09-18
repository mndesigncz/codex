// Mzdové náklady z docházky — jedno místo, jedno číslo.
//
// Totéž se v aplikaci počítalo třikrát a pokaždé jinak:
//
//   Finance      zaokrouhlovaly každý záznam a sčítaly; zapomenuté
//                odpíchnutí braly celé, takže jedna nezavřená směna
//                přidala do nákladů třeba třicet hodin.
//   Uzávěrky     sčítaly desetinná čísla a zaokrouhlily až součet;
//                záznamy nad 24 h vyhazovaly.
//   Docházka     zaokrouhlovala po záznamu a ty samé řádky psala do CSV.
//
// Majitel pak měl tři různá „mzdové náklady" za tentýž měsíc, a to
// třetí, součet sloupce v CSV, mu neseděl ani s jedním z nich. Přitom
// právě podle toho CSV se platí.
//
// Rozhoduje ten CSV: účetní sečte, co je vytištěné na řádcích, a celkové
// číslo tomu musí odpovídat. Proto se zaokrouhluje **po záznamu**, ne až
// součet. A protože zapomenuté odpíchnutí není třicet hodin práce,
// záznamy delší než den se nepočítají — všude stejně.

/** Delší směna než tahle je zapomenuté odpíchnutí, ne odpracovaný čas. */
export const MAX_SHIFT_HOURS = 24;

/** Hrubá mzda za jeden záznam docházky, zaokrouhlená na celé jednotky. */
export function earnedFor(ms: number, rate: number): number {
  if (!(ms > 0) || !(rate > 0)) return 0;
  const hours = ms / 3600000;
  if (hours >= MAX_SHIFT_HOURS) return 0;
  return Math.round(hours * rate);
}

/** Započítá se tenhle záznam do mzdových nákladů? */
export function countsTowardWages(ms: number, rate: number): boolean {
  const hours = ms / 3600000;
  return ms > 0 && rate > 0 && hours < MAX_SHIFT_HOURS;
}

export interface WageEntry {
  /** Odpracovaný čas v milisekundách. */
  ms: number;
  /** Hodinová sazba; 0 nebo záporná znamená „nepočítá se". */
  rate: number;
}

/**
 * Součet mzdových nákladů. `skipped` je počet vynechaných záznamů —
 * obrazovka podle něj může říct, že něco nesedí, místo aby to zamlčela.
 */
export function wagesTotal(entries: WageEntry[]): { total: number; counted: number; skipped: number } {
  let total = 0;
  let counted = 0;
  let skipped = 0;
  for (const e of entries) {
    if (countsTowardWages(e.ms, e.rate)) {
      total += earnedFor(e.ms, e.rate);
      counted += 1;
    } else if (e.ms > 0 && e.rate > 0) {
      // Má sazbu i čas, ale je to zjevně zapomenuté odpíchnutí.
      skipped += 1;
    }
  }
  return { total, counted, skipped };
}
