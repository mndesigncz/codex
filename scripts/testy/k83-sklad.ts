// Kolo 7, balík R7-6 — Sklad, receptury, uzávěrky a dodavatelé.
//
// Peněžní a počtové výpočty, které UI jen kreslí: jméno exportu uzávěrek podle
// zobrazeného období, hosté a útrata na hosta ze souhrnu uzávěrek, souhrn příjmu
// objednávky po položkách (součet cen, nedodáno, strop 10× objednaného), cena za
// balení v haléřích jen s oprávněním, tón marže proti cíli podniku, řazení
// receptur a vývoj ztrát z inventur.

import type { Testy } from './_testy.ts';
import { nazevExportuUzaverek, popisObdobiExportu } from '../../lib/uzaverkyFiltr.ts';

export default function ({ eq }: Testy) {
  // ---- 1) Export uzávěrek: jméno souboru podle toho, co je vidět ----
  eq('export: bez omezení', nazevExportuUzaverek('uzaverky', null), 'uzaverky.csv');
  eq('export: měsíc z MonthNav', nazevExportuUzaverek('uzaverky', '2026-10'), 'uzaverky-2026-10.csv');
  eq('export: měsíc zúžený Od/Do', nazevExportuUzaverek('uzaverky', '2026-10', '2026-10-03', '2026-10-12'), 'uzaverky-2026-10-03_2026-10-12.csv');
  eq('export: jen Od uvnitř měsíce = do konce měsíce', nazevExportuUzaverek('uzaverky', '2026-02', '2026-02-10'), 'uzaverky-2026-02-10_2026-02-28.csv');
  eq('export: Od/Do přes celý měsíc = jméno měsíce', nazevExportuUzaverek('uzaverky', '2026-10', '2026-09-01', '2026-11-30'), 'uzaverky-2026-10.csv');
  eq('export: rozmezí bez měsíce', nazevExportuUzaverek('ucetni-podklad', null, '2026-09-01', '2026-10-15'), 'ucetni-podklad-2026-09-01_2026-10-15.csv');
  eq('export: jeden den (z kalendáře)', nazevExportuUzaverek('uzaverky', null, '2026-10-05', '2026-10-05'), 'uzaverky-2026-10-05.csv');
  eq('export: jen od', nazevExportuUzaverek('uzaverky', null, '2026-09-01'), 'uzaverky-od-2026-09-01.csv');
  eq('export: jen do', nazevExportuUzaverek('uzaverky', null, '', '2026-09-30'), 'uzaverky-do-2026-09-30.csv');
  eq('export: popis období — měsíc', popisObdobiExportu('2026-10'), '2026-10');
  eq('export: popis období — vše', popisObdobiExportu(null), 'vše');
  eq('export: popis období — rozmezí', popisObdobiExportu(null, '2026-10-03', '2026-10-12'), '2026-10-03 – 2026-10-12');
}
