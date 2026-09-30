// Rozložení ploch pro ukázku: co vidí vedení na Přehledu, co zaměstnanec
// „Domů" a tablet na Směně. Skládá se ze skutečných widgetů (lib/widgety)
// jen s těmi, které ukázka umí nakrmit daty; ostatní stránky mají výchozí
// rozložení z kódu (lib/widgety/stranky/*).
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
};
