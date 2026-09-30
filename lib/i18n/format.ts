// Datum, čas, názvy dnů a měsíců: jedno místo, které bere jazyk jako parametr.
//
// Peníze a čísla tu záměrně nejsou: ty řídí `teams.locale` (lib/money.ts),
// aby majitel a účetní viděli „1 500,50 Kč" stejně. Datum a názvy dnů patří do
// jazyka, kterým člověk čte, proto jdou podle jazyka uživatele.
//
// Časové pásmo: cs, sk, de, pl i at leží v CET/CEST se stejnými pravidly letního
// času, takže „pražské" hodiny jsou číselně totožné s berlínskými. Výchozí
// pásmo zůstává Europe/Prague a pragueTime.ts se nemění; `pasmo` se přijímá,
// aby se po refaktoru času (plán §9 bod 5) nemuselo sahat na volající.

import { LOCALE_PRO_JAZYK, type Jazyk } from './config.ts';

export type StylDatumu = 'kratce' | 'dlouze' | 'mesic' | 'denvtydnu';

const PASMO = 'Europe/Prague';

function naDatum(d: Date | string | number): Date {
  if (d instanceof Date) return d;
  // „2026-09-30" bez času by se jako UTC o půlnoci posunulo o den zpět v západních pásmech; poledne to neřeší.
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return new Date(`${d}T12:00:00Z`);
  return new Date(d);
}

export function fmtDatum(d: Date | string | number, o: { jazyk: Jazyk; styl?: StylDatumu; pasmo?: string }): string {
  const datum = naDatum(d);
  if (Number.isNaN(datum.getTime())) return '';
  const timeZone = o.pasmo ?? PASMO;
  const volby: Record<StylDatumu, Intl.DateTimeFormatOptions> = {
    kratce: { day: 'numeric', month: 'numeric' },
    dlouze: { day: 'numeric', month: 'long', year: 'numeric' },
    mesic: { month: 'long', year: 'numeric' },
    denvtydnu: { weekday: 'long' },
  };
  // Datum zadané jako „RRRR-MM-DD" je kalendářní den, ne okamžik: pásmo se
  // pro něj nesmí uplatnit, jinak by se v Praze posunul den kolem půlnoci.
  const jenDen = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
  return new Intl.DateTimeFormat(LOCALE_PRO_JAZYK[o.jazyk], { ...volby[o.styl ?? 'kratce'], timeZone: jenDen ? 'UTC' : timeZone }).format(datum);
}

/** „14:30" nebo „2:30 PM". Vstup `HH:MM` se bere jako čas na hodinách podniku, bez převodu pásma. */
export function fmtCas(v: Date | string, o: { jazyk: Jazyk; hodiny?: 12 | 24 }): string {
  const h12 = o.hodiny === 12;
  let d: Date;
  let timeZone: string | undefined = PASMO;
  const m = typeof v === 'string' ? /^(\d{1,2}):(\d{2})/.exec(v) : null;
  if (m) { d = new Date(Date.UTC(2024, 0, 1, Number(m[1]), Number(m[2]))); timeZone = 'UTC'; }
  else d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(LOCALE_PRO_JAZYK[o.jazyk], { hour: 'numeric', minute: '2-digit', hour12: h12, timeZone }).format(d);
}

/** Název dne; `idx` 0 = pondělí (úložná konvence otevírací doby), ne nedělní JS getDay(). */
export function fmtDenVTydnu(idx: number, o: { jazyk: Jazyk; styl?: 'kratky' | 'dlouhy' }): string {
  const i = ((Math.trunc(idx) % 7) + 7) % 7;
  // 1. 1. 2024 je pondělí.
  const d = new Date(Date.UTC(2024, 0, 1 + i, 12));
  return new Intl.DateTimeFormat(LOCALE_PRO_JAZYK[o.jazyk], { weekday: o.styl === 'dlouhy' ? 'long' : 'short', timeZone: 'UTC' }).format(d);
}

/** Název měsíce z čísla 1–12 (nebo `RRRR-MM`), bez roku. */
export function fmtMesic(v: number | string, o: { jazyk: Jazyk; styl?: 'kratky' | 'dlouhy' }): string {
  const cislo = typeof v === 'number' ? v : Number(String(v).slice(5, 7));
  const mesic = Math.min(12, Math.max(1, Math.trunc(cislo) || 1));
  const d = new Date(Date.UTC(2024, mesic - 1, 15, 12));
  return new Intl.DateTimeFormat(LOCALE_PRO_JAZYK[o.jazyk], { month: o.styl === 'kratky' ? 'short' : 'long', timeZone: 'UTC' }).format(d);
}

export function fmtCislo(n: number, o: { locale: string; desetiny?: number }): string {
  return new Intl.NumberFormat(o.locale, o.desetiny === undefined ? undefined : { minimumFractionDigits: o.desetiny, maximumFractionDigits: o.desetiny }).format(n);
}
