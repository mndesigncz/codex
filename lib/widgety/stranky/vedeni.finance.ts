// Stránka „Finance" (vedení). Plocha je aktivní od kola 69 (balík B5b).
//
// Bloky, které si FinanceView kreslil sám (čtyři souhrnné karty, Kam šly peníze, Hosté a věrnost,
// Doporučení, Živě z pokladny, Ztráty, Co vydělává), jsou teď widgety; nástrojem stránky zůstává
// kniha výdajů s hledáním, filtrem a detailem účtenky. Přepínač měsíce v hlavičce řídí i widgety
// s volbou „Měsíc" (Tento = měsíc stránky, mesicZVolby v katalogu finance).
//
// Výchozí rozložení je z katalogu. Nástroj má ikonu `book` — `coins` patří Souhrnu měsíce a na jedné
// stránce se ikona ve výchozím rozložení opakovat nesmí (AK-19).
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.finance',
  rozhrani: 'vedeni',
  nazev: 'Finance',
  pohled: 'finance',
  pristup: ['finance.zobrazit', 'finance.trzby'],
  nastroj: { nazev: 'Kniha výdajů', ikona: 'book', popis: 'Výdaje měsíce s účtenkami, objednávkami a výplatami — hledání, filtr a detail účtenky.' },
  inkoust: true,
  doporucene: [
    'finance.souhrn_mesice',
    'finance.trzby_vs_mzdy',
    'finance.kam_sly_penize',
    'finance.hoste_vernost',
    'finance.doporuceni',
    'finance.postrehy',
    'pokladna.zive',
    'trzby.po_dnech',
    'trzby.top_produkty',
    'trzby.platby',
    'trzby.po_obsluze',
    'trzby.hodiny',
    'trzby.prumerna_uctenka',
    'pokladna.stav',
    'finance.ztraty',
    'finance.marze',
    'finance.uctenky',
    'sklad.hodnota_zasob',
    'uzaverky.rozdil_kasy',
    'dochazka.mzdy_za_obdobi',
  ],
  vychozi: {
    'typ:vedeni': [
      { w: 'finance.souhrn_mesice', s: 'L' },
      { w: 'finance.trzby_vs_mzdy', s: 'S' },
      { w: 'finance.kam_sly_penize', s: 'M' },
      { w: 'sklad.hodnota_zasob', s: 'S' },
      { w: 'finance.doporuceni', s: 'L' },
      { w: 'pokladna.zive', s: 'L' },
      { w: 'finance.marze', s: 'L' },
      { w: 'finance.ztraty', s: 'M' },
      { w: 'finance.hoste_vernost', s: 'M' },
      { w: 'nastroj' },
    ],
    'role:ucetni': [
      { w: 'finance.souhrn_mesice', s: 'L' },
      { w: 'finance.trzby_vs_mzdy', s: 'S' },
      { w: 'uzaverky.rozdil_kasy', s: 'S' },
      { w: 'finance.uctenky', s: 'M' },
      { w: 'finance.kam_sly_penize', s: 'M' },
      { w: 'finance.ztraty', s: 'M' },
      { w: 'nastroj' },
    ],
  },
  aktivni: true,
};
