// Filtry uzávěrek (lib/uzaverkyFiltr.ts): hledání bez diakritiky i podle dne „5. 10.", stav, kasa, směna,
// rozmezí dnů, řazení s chybějícími hodnotami na konci a to, že vstup se nemění.
import type { Testy } from './_testy.ts';
import { filtrujUzaverky, pocetFiltru, PRAZDNY_FILTR, stitkySmen, jmenaZUzaverek, type FiltrUzaverek } from '../../lib/uzaverkyFiltr.ts';

export default function ({ eq, ok }: Testy) {
  // Kasa: opening 1000 + hotovost 5000 = očekáváme 6000; closing_cash určuje rozdíl.
  const u = (id: number, date: string, x: Record<string, unknown> = {}) => ({
    id, team_id: 1, date, shift_label: 'Ranní', notes: null, author_name: 'Eva', approved: true,
    opening_cash: 1000, cash_revenue: 5000, card_revenue: 2000, expenses: 0, cash_removed: 0, self_payout: 0, tips: 0,
    closing_cash: 6000, shiftEmployees: [{ id: 1, name: 'Eva' }], covered_by: null, ...x,
  }) as any;
  const radky = [
    u(1, '2026-10-01'),
    u(2, '2026-10-02', { shift_label: 'Večerní', approved: false, closing_cash: 5900, notes: 'Chybí stovka — Žďárský', shiftEmployees: [{ id: 2, name: 'Tomáš Žďárský' }] }),
    u(3, '2026-10-05', { closing_cash: 9150, cash_revenue: 8000 }),   // očekáváno 1000 + 8000 = 9000 → přebytek 150
    u(4, '2026-10-05', { shift_label: 'Večerní', trzbaSkryta: true, cash_revenue: null, card_revenue: null, closing_cash: null }),
  ];
  const F = (x: Partial<FiltrUzaverek>) => ({ ...PRAZDNY_FILTR, ...x });
  const ids = (x: Partial<FiltrUzaverek>) => filtrujUzaverky(radky, F(x)).map(r => r.id);

  eq('uzávěrky: bez filtru všechny, nejnovější první', ids({}), [4, 3, 2, 1]);
  eq('uzávěrky: nejstarší první', ids({ razeni: 'nejstarsi' }), [1, 2, 3, 4]);
  eq('uzávěrky: hledání bez diakritiky a velikosti písmen', ids({ hledej: 'zdarsky' }), [2]);
  eq('uzávěrky: hledání v poznámce', ids({ hledej: 'stovka' }), [2]);
  eq('uzávěrky: hledání podle dne „5. 10."', ids({ hledej: '5. 10.' }), [4, 3]);
  eq('uzávěrky: hledání podle ISO dne', ids({ hledej: '2026-10-02' }), [2]);
  eq('uzávěrky: hledání podle směny', ids({ hledej: 'vecerni' }), [4, 2]);
  eq('uzávěrky: stav ke schválení', ids({ stav: 'ceka' }), [2]);
  eq('uzávěrky: stav schválené', ids({ stav: 'schvaleno' }), [4, 3, 1]);
  eq('uzávěrky: kasa sedí (skrytá tržba nikdy nesedí)', ids({ kasa: 'sedi' }), [1]);
  eq('uzávěrky: kasa manko', ids({ kasa: 'manko' }), [2]);
  eq('uzávěrky: kasa přebytek', ids({ kasa: 'prebytek' }), [3]);
  eq('uzávěrky: směna', ids({ smena: 'Večerní' }), [4, 2]);
  eq('uzávěrky: od–do včetně', ids({ od: '2026-10-02', do: '2026-10-05' }), [4, 3, 2]);
  eq('uzávěrky: jen od', ids({ od: '2026-10-05' }), [4, 3]);
  eq('uzávěrky: kombinace filtrů', ids({ smena: 'Večerní', stav: 'ceka' }), [2]);
  eq('uzávěrky: nic neodpovídá = prázdný seznam', ids({ hledej: 'neexistuje' }), []);
  eq('uzávěrky: řazení podle tržby (shoda → novější den), skrytá na konec', ids({ razeni: 'trzba' }), [3, 2, 1, 4]);
  eq('uzávěrky: řazení podle rozdílu v kase (největší první, bez rozdílu na konec)', ids({ razeni: 'rozdil' }), [3, 2, 1, 4]);
  eq('uzávěrky: počet zapnutých filtrů (řazení se nepočítá)', pocetFiltru(F({ hledej: 'a', stav: 'ceka', od: '2026-10-01', razeni: 'trzba' })), 3);
  eq('uzávěrky: prázdný filtr = nula', pocetFiltru(PRAZDNY_FILTR), 0);
  eq('uzávěrky: štítky směn podle abecedy', stitkySmen(radky), ['Ranní', 'Večerní']);
  eq('uzávěrky: jména — nejčastější první', jmenaZUzaverek(radky, 2), ['Eva', 'Tomáš Žďárský']);
  const kopie = JSON.stringify(radky);
  filtrujUzaverky(radky, F({ razeni: 'trzba' }));
  ok('uzávěrky: vstup se nemění', JSON.stringify(radky) === kopie);
}
