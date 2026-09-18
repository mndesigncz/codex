// Začátek týdne — jedno pravidlo pro všechny mřížky.
//
// Podnik si v Nastavení → Tým volí, jestli mu týden začíná pondělím, nebo
// nedělí. Šest komponent si ale layout počítalo samo a dvě z nich to
// nastavení ignorovaly úplně: `ScheduleBuilder` i `AvailabilitySubmit`
// měly `(first.getDay() + 6) % 7` natvrdo, tedy vždycky pondělí. Podnik
// s nedělním týdnem tak viděl kalendář směn od neděle, ale rozvrh, ve
// kterém ty směny plánuje, od pondělí.
//
// POZOR na jinou sedmičku, která tímhle NEJDE: otevírací doba se ukládá
// klíčem 0 = pondělí (`weekdayKey` v ScheduleBuilderu). To je úložná
// konvence, ne zobrazení. Kdyby se převedla na tohle, posunula by se
// otevírací doba všem podnikům o den — a nikdo by nevěděl proč.

export type ZacatekTydne = 0 | 1;

const PO = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'] as const;

/** Zkratky dnů ve správném pořadí pro hlavičku mřížky. */
export function zkratkyDnu(zacatek: ZacatekTydne = 1): string[] {
  return zacatek === 0 ? ['Ne', ...PO.slice(0, 6)] : [...PO];
}

/**
 * Do kolikátého sloupce mřížky datum patří (0–6).
 *
 * `Date.getDay()` vrací 0 = neděle. Tady se z toho dělá pořadí vůči
 * začátku týdne, který si zvolil podnik.
 */
export function poradiDne(datum: Date | string, zacatek: ZacatekTydne = 1): number {
  const d = typeof datum === 'string' ? new Date(datum + 'T00:00:00') : datum;
  const den = d.getDay();
  return (den - zacatek + 7) % 7;
}

/**
 * Kolik prázdných buněk je před prvním dnem měsíce.
 *
 * Totéž co `poradiDne` prvního dne — vlastní jméno má proto, že na místě
 * volání je pak vidět, o co jde, a nikdo to nepřepíše zpátky na ruční
 * modulo.
 */
export function odsazeniMesice(prvniDen: Date | string, zacatek: ZacatekTydne = 1): number {
  return poradiDne(prvniDen, zacatek);
}

/**
 * Hodnota z databáze na typ. Výchozí je pondělí.
 *
 * `Number(null)` je nula, takže prosté `Number(h) === 0` by podniku bez
 * uloženého nastavení nastavilo neděli. Chytil to test, ne oko.
 */
export function zacatekTydne(hodnota: unknown): ZacatekTydne {
  if (hodnota === null || hodnota === undefined || hodnota === '') return 1;
  return Number(hodnota) === 0 ? 0 : 1;
}
