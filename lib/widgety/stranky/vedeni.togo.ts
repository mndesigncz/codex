// Stránka „TO GO" (vedení) — kapesní režim na telefonu. Plocha je aktivní od kola 69 (balík B5b).
//
// Dřív byly dlaždice a karty TO GO natvrdo v kódu (tmavý hero, devět šedých dlaždic, karty zpráv
// a zásob) a nedalo se nic přeskládat ani skrýt — přitom zrovna na telefonu chce majitel domovskou
// obrazovku „jako iOS" nejvíc. Teď jede ze stejného registru jako Přehled: hero je Pokladna dnes
// (jediná inkoustová plocha), týden je Tržba po dnech, zprávy, sklad a účtenky jsou malé widgety.
// Zkratky na záložky si člověk přidá widgetem Odkaz; ve výchozím rozložení nejsou, protože by se
// jejich ikona `chevronRight` opakovala (AK-19) a „Administrace" vede na celou navigaci.
// Nástroj stránka nemá.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.togo',
  rozhrani: 'vedeni',
  nazev: 'TO GO',
  pohled: 'togo',
  pristup: null,
  nastroj: null,
  inkoust: true,
  doporucene: [
    'pokladna.dnes',
    'trzby.po_dnech',
    'dochazka.dnes_v_podniku',
    'vyroba.k_vyrobe',
    'chat.neprectene',
    'sklad.dochazi',
    'finance.uctenky',
    'odkaz',
  ],
  vychozi: {
    'typ:vedeni': [
      { w: 'pokladna.dnes', s: 'M' },
      { w: 'trzby.po_dnech', s: 'M' },
      { w: 'dochazka.dnes_v_podniku', s: 'M' },
      { w: 'vyroba.k_vyrobe', s: 'M' },
      { w: 'chat.neprectene', s: 'S' },
      { w: 'sklad.dochazi', s: 'S' },
      { w: 'finance.uctenky', s: 'S' },
    ],
  },
  aktivni: true,
};
