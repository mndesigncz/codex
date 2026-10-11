// Předání filtru z widgetu do nástroje stránky (lib/predaniPohledu.ts): jen povolené hodnoty projdou.
import type { Testy } from './_testy.ts';
import { stavZPredani } from '../../lib/predaniPohledu.ts';

export default function ({ eq }: Testy) {
  const povolene = ['new', 'planned', 'done', 'declined'] as const;
  eq('stav:new projde', stavZPredani('stav:new', povolene), 'new');
  eq('neznámý stav se zahodí', stavZPredani('stav:neco', povolene), undefined);
  eq('jiný druh argumentu se zahodí', stavZPredani('pohled:week', povolene), undefined);
  eq('prázdné a chybějící', [stavZPredani('', povolene), stavZPredani(undefined, povolene), stavZPredani(null, povolene)], [undefined, undefined, undefined]);
  eq('injekce přes velká písmena a mezery neprojde', [stavZPredani('stav:NEW', povolene), stavZPredani('stav: new', povolene)], [undefined, undefined]);
}
