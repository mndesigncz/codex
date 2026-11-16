'use client';

// Hlášky validace z lib/tresty (validujTrest, validujDruh) jako klíče t(): server
// i klient vrací tutéž českou větu; tady ji UI přeloží. Věty jsou vypsané doslova,
// ať je check-i18n vidí a slovníky je nesou. Sekce slovníku je stejná jako u ostatních
// oken trestů: useT('widgety') (překladovou funkci dostane soubor z komponenty).
// Hlášky serveru, které nesou částku („Krátit jde nejvýš 1 500 Kč — …"), se ukážou, jak přišly.

import type { PrekladFn } from '@/lib/i18n/client';

export function prelozHlaskuTrestu(t: PrekladFn, chyba: string): string {
  switch (chyba) {
    case 'Vyber, koho se trest týká.': return t('Vyber, koho se trest týká.');
    case 'Napiš, co se stalo.': return t('Napiš, co se stalo.');
    case 'Text je moc dlouhý (nejvýš 500 znaků) nebo moc krátký.': return t('Text je moc dlouhý (nejvýš 500 znaků) nebo moc krátký.');
    case 'Den nesedí — nejvýš 31 dní zpětně a ne do budoucna.': return t('Den nesedí — nejvýš 31 dní zpětně a ne do budoucna.');
    case 'Body musí být celé číslo 0–500.': return t('Body musí být celé číslo 0–500.');
    case 'Krácení prémie musí být celé číslo (nejvýš 5 000).': return t('Krácení prémie musí být celé číslo (nejvýš 5 000).');
    case 'Fotka má neplatnou adresu.': return t('Fotka má neplatnou adresu.');
    case 'Návrh trestu nesedí.': return t('Návrh trestu nesedí.');
    case 'Napiš název prohřešku.': return t('Napiš název prohřešku.');
    case 'Název je moc dlouhý (nejvýš 80 znaků).': return t('Název je moc dlouhý (nejvýš 80 znaků).');
    case 'Popis je moc dlouhý (nejvýš 300 znaků).': return t('Popis je moc dlouhý (nejvýš 300 znaků).');
    case 'Tenhle měsíc nemá žádné prémie, krátit není z čeho. Dej body nebo napomenutí.': return t('Tenhle měsíc nemá žádné prémie, krátit není z čeho. Dej body nebo napomenutí.');
    case 'Krátit jde jen nenárokovou prémii a tenhle měsíc žádná není. Založ ji v Docházce → Prémie a srážky jako „Nenároková prémie“. Starší prémie bez typu se nepočítají.':
      return t('Krátit jde jen nenárokovou prémii a tenhle měsíc žádná není. Založ ji v Docházce → Prémie a srážky jako „Nenároková prémie“. Starší prémie bez typu se nepočítají.');
    case 'Manko řeš dohodou o odpovědnosti, ne trestem.': return t('Manko řeš dohodou o odpovědnosti, ne trestem.');
    case 'Za tohle už trest je.': return t('Za tohle už trest je.');
    case 'Tenhle návrh už je zahozený.': return t('Tenhle návrh už je zahozený.');
    // Kolo 96 — peníze z výplaty (lib/trestyPenize, routy; docs/TRESTY-PENIZE.md kap. 6).
    case 'Neznámý typ nenárokové složky.': return t('Neznámý typ nenárokové složky.');
    case 'Procento musí být větší než 0 a nejvýš 100.': return t('Procento musí být větší než 0 a nejvýš 100.');
    case 'Částka nenárokové složky musí být kladná.': return t('Částka nenárokové složky musí být kladná.');
    case 'Srážka musí být celé kladné číslo (nejvýš 200 000).': return t('Srážka musí být celé kladné číslo (nejvýš 200 000).');
    case 'Splátek může být 1 až 12.': return t('Splátek může být 1 až 12.');
    case 'Výše škody musí být celé kladné číslo.': return t('Výše škody musí být celé kladné číslo.');
    case 'Vyber druh škody.': return t('Vyber druh škody.');
    case 'Náhrada musí být celé kladné číslo (nejvýš 200 000).': return t('Náhrada musí být celé kladné číslo (nejvýš 200 000).');
    case 'Náhrada nemůže být vyšší než škoda.': return t('Náhrada nemůže být vyšší než škoda.');
    case 'Schodek a ztrátu svěřených věcí jde vymáhat jen s podepsanou dohodou o odpovědnosti — zaškrtni ji a doplň datum.':
      return t('Schodek a ztrátu svěřených věcí jde vymáhat jen s podepsanou dohodou o odpovědnosti — zaškrtni ji a doplň datum.');
    case 'Datum dohody o odpovědnosti nemůže být v budoucnu.': return t('Datum dohody o odpovědnosti nemůže být v budoucnu.');
    case 'Nevím, komu má stržená částka přejít.': return t('Nevím, komu má stržená částka přejít.');
    case 'Částka pro kolegu musí být celé kladné číslo.': return t('Částka pro kolegu musí být celé kladné číslo.');
    case 'Vyber, kdo to napravil.': return t('Vyber, kdo to napravil.');
    case 'Moc lidí najednou (nejvýš 50).': return t('Moc lidí najednou (nejvýš 50).');
    case 'Zadej částku aspoň jednomu kolegovi.': return t('Zadej částku aspoň jednomu kolegovi.');
    case 'Kolegům nejde převést víc, než se strhlo.': return t('Kolegům nejde převést víc, než se strhlo.');
    case 'Návrh trestu jde dát jen jednomu člověku.': return t('Návrh trestu jde dát jen jednomu člověku.');
    case 'Peníze z výplaty smí měnit jen ten, kdo vidí mzdy.': return t('Peníze z výplaty smí měnit jen ten, kdo vidí mzdy.');
    case 'Po rozpočítání by někomu vyšlo 0 — zvyš částku.': return t('Po rozpočítání by někomu vyšlo 0 — zvyš částku.');
    case 'Kolega, kterému má částka přejít, není v podniku.': return t('Kolega, kterému má částka přejít, není v podniku.');
    case 'Na směně ten den nikdo další nebyl — vyber lidi, nebo nech částku podniku.': return t('Na směně ten den nikdo další nebyl — vyber lidi, nebo nech částku podniku.');
    case 'Z trestu se nic nestrhne — není co převést kolegům.': return t('Z trestu se nic nestrhne — není co převést kolegům.');
    case 'Člověk není v podniku.': return t('Člověk není v podniku.');
    case 'Srážka už nečeká na souhlas.': return t('Srážka už nečeká na souhlas.');
    case 'Trest je zrušený — srážka už neplatí.': return t('Trest je zrušený — srážka už neplatí.');
    case 'Znovu požádat jde jen po nesouhlasu.': return t('Znovu požádat jde jen po nesouhlasu.');
    case 'Zrušenou srážku už upravit nejde.': return t('Zrušenou srážku už upravit nejde.');
    case 'Srážka už je zrušená.': return t('Srážka už je zrušená.');
    case 'Srážka nenalezena.': return t('Srážka nenalezena.');
    case 'Nevím, co se srážkou udělat.': return t('Nevím, co se srážkou udělat.');
    case 'Člověk nemá v podniku členství (jen zrcadlo) — složku zatím nejde uložit.': return t('Člověk nemá v podniku členství (jen zrcadlo) — složku zatím nejde uložit.');
    case 'Vyber, komu odměna patří.': return t('Vyber, komu odměna patří.');
    case 'Odměna musí být celé kladné číslo.': return t('Odměna musí být celé kladné číslo.');
    case 'Odměna jednomu člověku může být nejvýš 100 000.': return t('Odměna jednomu člověku může být nejvýš 100 000.');
    case 'Po rozpočítání by někdo dostal 0 — zvyš částku.': return t('Po rozpočítání by někdo dostal 0 — zvyš částku.');
    case 'Napiš, za co odměna je.': return t('Napiš, za co odměna je.');
    case 'Den nesedí — ne do budoucna.': return t('Den nesedí — ne do budoucna.');
    case 'Tresty se ještě připravují. Zkus to za chvíli znovu.': return t('Tresty se ještě připravují. Zkus to za chvíli znovu.');
    // Věty pro vedení z jádra (VETA_* v lib/trestyPenize).
    case 'U HPP, DPP i DPČ se srážka strhne až po souhlasu zaměstnance (dohoda o srážkách ze mzdy, § 146 písm. b) zákoníku práce).':
      return t('U HPP, DPP i DPČ se srážka strhne až po souhlasu zaměstnance (dohoda o srážkách ze mzdy, § 146 písm. b) zákoníku práce).');
    case 'Typ smlouvy není vyplněný — bereme ho jako pracovní poměr, srážka počká na souhlas zaměstnance.':
      return t('Typ smlouvy není vyplněný — bereme ho jako pracovní poměr, srážka počká na souhlas zaměstnance.');
    case 'OSVČ není v pracovním poměru — srážka se uplatní hned.': return t('OSVČ není v pracovním poměru — srážka se uplatní hned.');
    case 'Výplaty za poslední 3 měsíce v aplikaci nejsou — strop 4,5násobku průměrného výdělku nejde spočítat. Částku zkontroluj sám.':
      return t('Výplaty za poslední 3 měsíce v aplikaci nejsou — strop 4,5násobku průměrného výdělku nejde spočítat. Částku zkontroluj sám.');
    case 'Období je uzavřené — změna se promítne do dalšího otevřeného období.': return t('Období je uzavřené — změna se promítne do dalšího otevřeného období.');
    // Stav srážky (chip, lib/trestyPenize stavSrazky).
    case 'Čeká na souhlas': return t('Čeká na souhlas');
    case 'Uplatněno': return t('Uplatněno');
    case 'Nesouhlasí': return t('Nesouhlasí');
    case 'Zrušeno': return t('Zrušeno');
    default: return chyba;
  }
}
