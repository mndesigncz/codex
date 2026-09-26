// Stránka „Zákazníci" (vedení, Managero client). Kolo 68 založilo metadata z katalogu, kolo 69
// (balík B8) plochu zapnulo. Nástroj = Členové / Hodnocení / Zprávy členům (přepínač v `aside`
// hlavičky); každá část jen s vlastním klíčem.
//
// Výchozí rozložení z katalogu: Členové klubu a Hodnocení vedle sebe, nástroj pod nimi.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.klient_zakaznici',
  rozhrani: 'vedeni',
  nazev: 'Zákazníci',
  pohled: 'klient:customers',
  pristup: ['zakaznici.zobrazit', 'zakaznici.recenze', 'zakaznici.zpravy'],
  nastroj: { nazev: 'Zákazníci', ikona: 'user', popis: 'Členové, hodnocení a zprávy hostům.' },
  doporucene: ['klient.clenove', 'klient.hodnoceni', 'klient.vernost_30dni'],
  vychozi: { 'typ:vedeni': [{ w: 'klient.clenove', s: 'M' }, { w: 'klient.hodnoceni', s: 'M' }, { w: 'nastroj' }] },
  aktivni: true,
};
