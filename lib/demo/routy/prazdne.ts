// Rozumný prázdný tvar pro endpoint, který ukázka nezná. Aplikace čte
// odpovědi různě (holé pole, `{ items: [] }`, objekt s jedním polem);
// pole je bezpečný základ a pro pár známých objektových odpovědí se vrací
// jejich prázdný tvar, ať se obrazovka nevykreslí jako chyba.

import type { Pozadavek } from '../typy';

const OBJEKTOVE: [RegExp, unknown][] = [
  [/^\/api\/(suggestions)$/, { suggestions: [] }],
  [/^\/api\/rewards$/, { standings: [], levels: [], me: null, reviews: [], unseenFlagged: 0 }],
  [/^\/api\/rewards\/catalog$/, { catalog: [], redemptions: [] }],
  [/^\/api\/shift-reviews$/, { days: [], reviews: [] }],
  [/^\/api\/planning$/, []],
  [/^\/api\/receipts$/, { receipts: [] }],
  [/^\/api\/client\/admin\/summary$/, { enabled: false }],
  [/^\/api\/client\/staff\/inbox$/, { orders: [], reservations: [], newCount: 0 }],
  [/^\/api\/organization/, { organization: null }],
  [/^\/api\/menu$/, { boards: [] }],
  [/^\/api\/finance$/, { summary: {}, ledger: [], insights: [], guest: {} }],
];

export function prazdne(p: Pozadavek): unknown {
  for (const [re, telo] of OBJEKTOVE) if (re.test(p.cesta)) return telo;
  return [];
}
