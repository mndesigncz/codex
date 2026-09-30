// Rozložení ploch pro ukázku: co vidí vedení na Přehledu, co zaměstnanec
// „Domů" a tablet na Směně. Skládá se ze skutečných widgetů (lib/widgety)
// jen s těmi, které ukázka umí nakrmit daty; ostatní stránky mají výchozí
// rozložení z kódu (lib/widgety/stranky/*).
//
// Scény, kde se hned po otevření něco DĚJE v nástroji stránky (generování
// rozvrhu, zámek uzávěrky), mají nástroj úplně nahoře: ve výchozím rozložení
// leží až za pěti widgety (na 1280×900 na y≈1080, na telefonu ještě níž) a
// návštěvník by po kliknutí na Vygenerovat rozvrh neviděl, že se cokoli stalo.
import type { VychoziPolozka } from '@/lib/widgety/typy';

export const ROZLOZENI_DEMA: Record<string, VychoziPolozka[]> = {
  'vedeni.prehled': [
    { w: 'pokladna.dnes', s: 'M' },
    { w: 'dochazka.prave_na_smene', s: 'M' },
    { w: 'ukoly.dnes', s: 'S' },
    { w: 'sklad.dochazi', s: 'S' },
    { w: 'chat.neprectene', s: 'S' },
    { w: 'tym.clenove', s: 'S' },
    { w: 'rozvrh.dnesni_smeny', s: 'M' },
    { w: 'oznameni.nastenka', s: 'L' },
  ],
  'vedeni.rozvrh': [
    { w: 'nastroj' },
    { w: 'rozvrh.dostupnost_tymu', s: 'L' },
  ],
  // Bez widgetu „Povinné postupy": počítá jen postupy a tvrdil by „Uzávěrka může jít"
  // přímo nad kartou, že je zamčená (chybí povinný úkol). Zámek ukazuje sám formulář.
  'zamestnanec.uzaverka': [
    { w: 'nastroj' },
    { w: 'uzaverky.moje_historie', s: 'L' },
  ],
};
