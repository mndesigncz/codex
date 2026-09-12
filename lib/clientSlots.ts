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
// Jako v Kartičce: věrnost je vidět. Prahy jsou schválně pevné a nízké —
// u malého podniku je 25 návštěv opravdový štamgast.
export function levelFor(visits: number): { id: 'bronze' | 'silver' | 'gold'; label: string } {
  const v = Number(visits) || 0;
  if (v >= 25) return { id: 'gold', label: 'Zlatý host' };
  if (v >= 10) return { id: 'silver', label: 'Stříbrný host' };
  return { id: 'bronze', label: 'Člen' };
}
