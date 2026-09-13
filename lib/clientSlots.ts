// Sdílené mezi serverem a prohlížečem: kdy se dá rezervovat a jak se čte
// otevírací doba. Bez importů ze serveru, ať to jde i do klientské komponenty.

export interface OpeningDay { open?: string | null; close?: string | null; closed?: boolean }
export type OpeningHours = Record<string, OpeningDay>;

/** Klíč dne v teams.opening_hours: pondělí = "0". */
export function dayKey(dateStr: string): string {
  return String((new Date(dateStr + 'T12:00:00Z').getUTCDay() + 6) % 7);
}

export const DAY_NAMES = ['pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota', 'neděle'];

/** „8:00–20:00", „zavřeno" nebo „neuvedeno". */
export function hoursLabel(hours: OpeningHours | null | undefined, dateStr: string): string {
  const d = hours?.[dayKey(dateStr)];
  if (!d) return 'neuvedeno';
  if (d.closed || !d.open || !d.close) return 'zavřeno';
  return `${d.open}–${d.close}`;
}

/** Časy, kdy se dá v daný den rezervovat: od otevření po zavření minus hodina, po krocích. */
export function slotsFor(hours: OpeningHours | null | undefined, dateStr: string, slotMinutes: number): string[] {
  const day = hours?.[dayKey(dateStr)];
  if (!day || day.closed || !day.open || !day.close) return [];
  const toMin = (t: string) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
  const start = toMin(day.open), end = toMin(day.close) - 60;
  const out: string[] = [];
  const step = Math.max(15, slotMinutes || 30);
  for (let t = Math.ceil(start / step) * step; t <= end; t += step) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  }
  return out;
}

/** „pá 12. 9." pro seznamy, „pátek 12. září" pro nadpisy. */
export function czDay(dateStr: string, long = false): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('cs-CZ', long
    ? { weekday: 'long', day: 'numeric', month: 'long' }
    : { weekday: 'short', day: 'numeric', month: 'numeric' });
}

export const RES_STATUS: Record<string, { label: string; tone: 'wait' | 'ok' | 'off' | 'done' }> = {
  requested: { label: 'Čeká na potvrzení', tone: 'wait' },
  confirmed: { label: 'Potvrzeno', tone: 'ok' },
  seated:    { label: 'Usazeni', tone: 'ok' },
  done:      { label: 'Proběhlo', tone: 'done' },
  declined:  { label: 'Nepřijato', tone: 'off' },
  cancelled: { label: 'Zrušeno', tone: 'off' },
};


// ---- Úrovně hosta podle návštěv -------------------------------------------
//
// Jako v Kartičce: věrnost je vidět a něco přináší. Prahy i sleva si drží
// každý podnik vlastní; výchozí hodnoty odpovídají malému podniku, kde je
// pětadvacet návštěv opravdový štamgast.

export interface TierRules {
  silverAt?: number; goldAt?: number;
  memberDiscount?: number; silverDiscount?: number; goldDiscount?: number;
}

export type TierId = 'bronze' | 'silver' | 'gold';

export interface Tier { id: TierId; label: string; discount: number; nextAt: number | null; nextLabel: string | null }

/** Úroveň hosta i s tím, co z ní plyne — sleva a kolik chybí do další. */
export function tierFor(visits: number, r?: TierRules | null): Tier {
  const v = Math.max(0, Number(visits) || 0);
  const silverAt = Math.max(1, Number(r?.silverAt) || 10);
  const goldAt = Math.max(silverAt + 1, Number(r?.goldAt) || 25);
  const base = Math.max(0, Math.min(90, Number(r?.memberDiscount) || 0));
  const sd = Math.max(base, Math.min(90, Number(r?.silverDiscount) || 0));
  const gd = Math.max(sd, Math.min(90, Number(r?.goldDiscount) || 0));
  if (v >= goldAt) return { id: 'gold', label: 'Zlatý host', discount: gd, nextAt: null, nextLabel: null };
  if (v >= silverAt) return { id: 'silver', label: 'Stříbrný host', discount: sd, nextAt: goldAt, nextLabel: 'Zlatý host' };
  return { id: 'bronze', label: 'Člen', discount: base, nextAt: silverAt, nextLabel: 'Stříbrný host' };
}

/** Zpětně kompatibilní zkratka pro místa, kde stačí jméno úrovně. */
export function levelFor(visits: number): { id: TierId; label: string } {
  const t = tierFor(visits);
  return { id: t.id, label: t.label };
}
