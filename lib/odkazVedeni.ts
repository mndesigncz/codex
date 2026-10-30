// Zaměstnanecká adresa otevřená účtem vedení (role employer).
//
// Oznámení (tresty, odměny, úkoly…) vedou na `/employee/shifts?view=…&arg=…`, protože je dostávají
// hlavně zaměstnanci. Člen vedení, kterému trest nebo odměnu dal majitel, ale skončil na holém
// `/employer/overview`: layout zaměstnance ho přesměroval a `view`/`arg` zahodil. Middleware proto
// takovou adresu přeloží na stejné zobrazení ve vedení — pokud ho vedení má (Odměny, Moje směny,
// Úkoly, Sklad, Chat); zobrazení jen pro zaměstnance (Dostupnost) vede na Přehled.
// Čistá funkce, testy: scripts/testy/k94-odkaz-vedeni.ts.

import { VYCHOZI_NAV } from './navigace.ts';

const ZOBRAZENI_VEDENI = new Set(VYCHOZI_NAV.vedeni.polozky.map(p => p.id));

/** Kam poslat vedení ze zaměstnanecké adresy; null = nechat na layoutu (jiné cesty než /employee/shifts). */
export function adresaVedeniZeZamestnance(cesta: string, hledani: URLSearchParams): string | null {
  if (cesta !== '/employee/shifts' && cesta !== '/employee/shifts/') return null;
  const view = hledani.get('view');
  if (!view || !ZOBRAZENI_VEDENI.has(view)) return '/employer/overview';
  const q = new URLSearchParams({ view });
  const arg = hledani.get('arg');
  if (arg) q.set('arg', arg);
  return `/employer/overview?${q.toString()}`;
}
