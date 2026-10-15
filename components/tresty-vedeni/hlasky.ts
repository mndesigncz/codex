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
    default: return chyba;
  }
}
