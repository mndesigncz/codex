// Spuštění automatizace z cest, které nesmí kvůli zprávě zpomalit ani selhat (vstup do klubu,
// razítko u kasy). Dynamický import drží lib/client.ts bez závislosti na rozesílce (žádný cyklus)
// a chyba se spolkne: zpráva je bonus, ne součást věrnostní transakce.

import type { DruhAutomatizace } from './automatizace';

export function automatizaceUdalost(druh: DruhAutomatizace, teamId: number, customerId: number, ref: string): void {
  import('./automatizaceDb')
    .then(m => m.spustAutomatizaci(druh, teamId, customerId, ref))
    .catch(() => { /* zpráva se nepodařila, věrnost jede dál */ });
}
