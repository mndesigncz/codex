// Čtení počtů z polí inventury — jedno místo pro klienta i server.
//
// Pole „Spočítáno" a „Zbytek v načatém" jsou řízené inputy. Dřív se hodnota
// při každém úhozu rozparsovala na číslo a hned se vykreslila zpět: napsané
// „0," se změnilo na „0", čárka zmizela a další číslice se připojily k nule —
// 0,68 l skončilo jako 68 l a dokončení inventury zapsalo obří falešné manko.
// Počty se navíc zaokrouhlovaly na celá čísla i u kg a l, takže skutečných
// 2,35 kg se tiše zapsalo jako 2 kg. Tady se parsuje jen tehdy, když je text
// hotové číslo; pole si drží vlastní text (Stocktake.tsx).
//
// Čistý modul bez závislostí — `npm test` ho načítá přímo Nodem.

export type Pocet =
  /** `hodnota: null` = pole je prázdné (nespočítáno), ne nula. */
  | { ok: true; hodnota: number | null }
  /** `cislo` = není to číslo; `cele` = je to číslo s desetinami tam, kde se počítá na celé. */
  | { ok: false; duvod: 'cislo' | 'cele' };

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const STROP = 10_000_000;

/**
 * Počet z textu pole. Bere českou čárku i tečku. Tři desetinná místa (0,68 l),
 * víc se zaokrouhlí. Při `desetinny = false` je desetinné číslo chyba
 * (`cele`), ne tiché zaokrouhlení — zapsaný stav pak nelže.
 */
export function pocetZPole(raw: unknown, desetinny: boolean): Pocet {
  if (raw === null || raw === undefined) return { ok: true, hodnota: null };
  const text = String(raw).replace(/[\s  ]/g, '').replace(',', '.');
  if (text === '') return { ok: true, hodnota: null };
  if (!/^(\d+\.?\d*|\.\d+)$/.test(text)) return { ok: false, duvod: 'cislo' };
  const n = Number(text);
  if (!Number.isFinite(n)) return { ok: false, duvod: 'cislo' };
  const v = round3(Math.min(n, STROP));
  if (!desetinny && !Number.isInteger(v)) return { ok: false, duvod: 'cele' };
  return { ok: true, hodnota: v };
}

/** Počet do pole s českou čárkou: 0,68 → „0,68", 2 → „2", nespočítáno → „". */
export function pocetDoPole(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '';
  return String(round3(Number(n))).replace('.', ',');
}

/**
 * Číslo z hromadné úpravy položek (limity, velikost balení). Na rozdíl od
 * `Number(v)` neudělá z `null` ani prázdného řetězce nulu: JSON z `NaN`
 * vyrobí `null` a „nezadáno" se nesmí zapsat jako 0 desítkám položek.
 * `hodnota: null` = nezadáno, `ok: false` = něco tam je, ale není to
 * nezáporné číslo (server má odpovědět 400 dřív, než cokoli zapíše).
 */
export function hromadneCislo(v: unknown): { ok: true; hodnota: number | null } | { ok: false } {
  if (v === null || v === undefined) return { ok: true, hodnota: null };
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? { ok: true, hodnota: v } : { ok: false };
  if (typeof v !== 'string') return { ok: false };
  const p = pocetZPole(v, true);
  return p.ok ? { ok: true, hodnota: p.hodnota } : { ok: false };
}
