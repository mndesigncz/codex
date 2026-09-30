// Dny ukázky. Fixtury sond používají zástupné DNES/VCERA…; ukázka žádné
// pevné datum nemá, počítá vše od dnešního dne v Praze (stejně jako
// sondy: Intl s časovou zónou, ne UTC, jinak by po půlnoci lhalo).

const PRAHA = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' });

/** YYYY-MM-DD v Praze pro `Date`. */
export function denPraha(d: Date = new Date()): string {
  return PRAHA.format(d);
}

/** Dnešek v Praze (YYYY-MM-DD). */
export function dnes(): string {
  return denPraha();
}

/** Posun dne o `n` dní (záporné = zpět), počítáno z poledne, ať přechod času nepřeskočí den. */
export function posunDen(den: string, n: number): string {
  const d = new Date(den + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Den v týdnu 0 = neděle … 6 = sobota (jako `Date.getDay`). */
export function denVTydnu(den: string): number {
  return new Date(den + 'T12:00:00Z').getUTCDay();
}

/** Měsíc YYYY-MM z dne. */
export function mesic(den: string): string {
  return den.slice(0, 7);
}

/** Všechny dny měsíce YYYY-MM. */
export function dnyMesice(m: string): string[] {
  const [r, mm] = m.split('-').map(Number);
  const pocet = new Date(Date.UTC(r, mm, 0)).getUTCDate();
  return Array.from({ length: pocet }, (_, i) => `${m}-${String(i + 1).padStart(2, '0')}`);
}

/** ISO čas dnes v hodině:minutě pražského času (pro příchody, zprávy…). */
export function casDnes(hm: string, den: string = dnes()): string {
  // Praha je UTC+1/+2; příchod „v 7:05" má být v 7:05 na hodinách v Praze.
  // Zkusí se obě hodnoty posunu a vezme ta, jejíž pražský zápis sedí.
  const [h, m] = hm.split(':').map(Number);
  for (const posun of [1, 2]) {
    const t = new Date(`${den}T${String(h - posun).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
    if (Number.isNaN(t.getTime())) continue;
    const pr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit', hour12: false }).format(t);
    if (pr === `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`) return t.toISOString();
  }
  return new Date(`${den}T${hm}:00`).toISOString();
}
