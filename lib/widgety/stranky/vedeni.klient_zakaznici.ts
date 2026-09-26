// Stránka „Zákazníci" (vedení). Kolo 68 založilo metadata z katalogu; plochu zapne (aktivni: true) a
// doporučené i výchozí rozložení upřesní balík B8 v kole 69.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.klient_zakaznici',
  rozhrani: 'vedeni',
  nazev: 'Zákazníci',
  pohled: 'klient:customers',
  pristup: ['klient.prehled'],
  nastroj: { nazev: 'Zákazníci', ikona: 'users', popis: 'Členové, hodnocení a zprávy hostům.' },
  doporucene: ['klient.clenove', 'klient.hodnoceni'],
  vychozi: { 'typ:vedeni': [{ w: 'klient.clenove', s: 'M' }, { w: 'klient.hodnoceni', s: 'M' }, { w: 'nastroj' }] },
  aktivni: false,
};
