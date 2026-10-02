// Datum z databáze česky i s rokem („11. 2. 2026"), přes pražský den, ne místní zónu prohlížeče.

import { pragueDaySafe } from '@/lib/pragueTime';

export function denCesky(v: unknown): string {
  const d = pragueDaySafe(v);
  return d ? `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}` : '–';
}
