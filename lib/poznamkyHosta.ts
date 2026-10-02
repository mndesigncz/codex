// Interní poznámky k hostovi: pravidla bez databáze (testy: scripts/testy/k81-clenove.ts).

export const NOTE_MAX = 500;
export const NOTES_MAX_NA_HOSTA = 30;

/** Česká chyba, nebo null, když je text v pořádku. */
export function chybaPoznamky(text: string): string | null {
  const t = String(text ?? '').trim();
  if (!t) return 'Napiš poznámku.';
  if (t.length > NOTE_MAX) return `Poznámka může mít nejvýš ${NOTE_MAX} znaků.`;
  return null;
}
