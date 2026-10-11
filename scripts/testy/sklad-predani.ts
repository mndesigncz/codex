// Co dostane Sklad od widgetu: kategorie jménem a/nebo filtr „jen co dochází" (lib/skladPredani.ts).
import type { Testy } from './_testy.ts';
import { rozborSkladArg, skladArg } from '../../lib/skladPredani.ts';

export default function ({ eq }: Testy) {
  eq('holé jméno je kategorie (starý tvar)', rozborSkladArg('Sirupy'), { kategorie: 'Sirupy', jenDochazi: false });
  eq('stav:dochazi je filtr bez kategorie', rozborSkladArg('stav:dochazi'), { kategorie: undefined, jenDochazi: true });
  eq('filtr i kategorie společně', rozborSkladArg('stav:dochazi|Sirupy'), { kategorie: 'Sirupy', jenDochazi: true });
  eq('prázdný argument = nic', rozborSkladArg(undefined), { kategorie: undefined, jenDochazi: false });
  eq('neznámý stav se ignoruje, nestane se kategorií', rozborSkladArg('stav:neco'), { kategorie: undefined, jenDochazi: false });
  eq('skladArg: kategorie s filtrem', skladArg({ kategorie: 'Sirupy', jenDochazi: true }), 'stav:dochazi|Sirupy');
  eq('skladArg: jen filtr', skladArg({ jenDochazi: true }), 'stav:dochazi');
  eq('skladArg: nic = undefined', skladArg({ kategorie: null }), undefined);
  eq('kruh: skladArg → rozborSkladArg', rozborSkladArg(skladArg({ kategorie: 'Nápoje | s lomítkem'.replace('|', '/'), jenDochazi: true })), { kategorie: 'Nápoje / s lomítkem', jenDochazi: true });
}
