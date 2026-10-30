// Odkaz z oznámení pro zaměstnance (/employee/shifts?view=…&arg=…) otevřený účtem vedení: middleware
// ho přeloží na stejné zobrazení ve vedení, místo aby layout zaměstnance poslal člověka na holý Přehled
// (hlášení: trestaný člen vedení se z oznámení nedostal k trestu).

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { adresaVedeniZeZamestnance } from '../../lib/odkazVedeni.ts';

export default function ({ eq, ok }: Testy) {
  const q = (s: string) => new URLSearchParams(s);
  eq('vedení: trest z oznámení → Odměny ve vedení s argumentem',
    adresaVedeniZeZamestnance('/employee/shifts', q('view=rewards&arg=tresty')), '/employer/overview?view=rewards&arg=tresty');
  eq('vedení: Moje směny zůstanou Moje směny', adresaVedeniZeZamestnance('/employee/shifts', q('view=my-shifts')), '/employer/overview?view=my-shifts');
  eq('vedení: zobrazení jen pro zaměstnance (Dostupnost) → Přehled', adresaVedeniZeZamestnance('/employee/shifts', q('view=availability')), '/employer/overview');
  eq('vedení: bez view → Přehled', adresaVedeniZeZamestnance('/employee/shifts', q('')), '/employer/overview');
  eq('vedení: jiné parametry se nepřenášejí', adresaVedeniZeZamestnance('/employee/shifts', q('view=tasks&x=1')), '/employer/overview?view=tasks');
  eq('vedení: jiné zaměstnanecké cesty nechá layoutu', adresaVedeniZeZamestnance('/employee/chat', q('')), null);
  const mw = readFileSync(new URL('../../middleware.ts', import.meta.url), 'utf8');
  ok('middleware: přesměrování jen pro roli employer a GET', /role === 'employer'/.test(mw) && /adresaVedeniZeZamestnance\(cesta/.test(mw));
}
