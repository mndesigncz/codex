'use client';

// Hlášky validace z lib/navic (validujZapis, validujNabidku) jako klíče t():
// server i klient vrací tutéž českou větu; tady ji UI přeloží. Věty jsou
// vypsané doslova, ať je check-i18n vidí a slovníky je nesou. Sekce slovníku je stejná jako
// u ostatních oken navíc: useT('widgety') (překladovou funkci dostane soubor z komponenty).

import type { PrekladFn } from '@/lib/i18n/client';

export function prelozHlaskuNavic(t: PrekladFn, chyba: string): string {
  switch (chyba) {
    case 'Napiš, co bylo navíc.': return t('Napiš, co bylo navíc.');
    case 'Text je moc dlouhý (nejvýš 500 znaků) nebo moc krátký.': return t('Text je moc dlouhý (nejvýš 500 znaků) nebo moc krátký.');
    case 'Den nesedí (nesmí být v budoucnu).': return t('Den nesedí (nesmí být v budoucnu).');
    case 'Den nesedí — zapsat jde nejvýš 14 dní zpětně a ne do budoucna.': return t('Den nesedí — zapsat jde nejvýš 14 dní zpětně a ne do budoucna.');
    case 'Fotka má neplatnou adresu.': return t('Fotka má neplatnou adresu.');
    case 'Napiš název (co se má udělat).': return t('Napiš název (co se má udělat).');
    case 'Název je moc dlouhý (nejvýš 80 znaků).': return t('Název je moc dlouhý (nejvýš 80 znaků).');
    case 'Popis je moc dlouhý (nejvýš 300 znaků).': return t('Popis je moc dlouhý (nejvýš 300 znaků).');
    case 'Body musí být celé číslo 0–500.': return t('Body musí být celé číslo 0–500.');
    case 'Prémie musí být celé číslo (nejvýš 5 000).': return t('Prémie musí být celé číslo (nejvýš 5 000).');
    case 'Platnost má špatný tvar data.': return t('Platnost má špatný tvar data.');
    case 'Platnost „od" je po „do".': return t('Platnost „od" je po „do".');
    case 'Limit za den musí být 1–50.': return t('Limit za den musí být 1–50.');
    default: return chyba;
  }
}
