// Stránka „Rezervace" (vedení, Managero client). Kolo 68 založilo jen nástroj, kolo 69 (balík B8)
// plochu zapnulo. Nástroj = rezervace po dnech s přepínačem Dnes / Nadcházející / Minulé
// v `aside` hlavičky (ClientAdmin → Rezervace).
//
// Výchozí rozložení: nástroj nahoře (hlavní práce stránky), pod ním objednávky od stolu
// ve střední velikosti (fronta) — obsluha u dveří řeší obojí zároveň. Katalog stránku nezná; doporučené jsou widgety
// hostů, které se k rezervacím vážou (dnešek, hodnocení, nejbližší akce).
// Ikona nástroje je kalendář, ne kalendář s fajfkou: tu má widget Dnešní rezervace (AK-19).
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.klient_rezervace',
  rozhrani: 'vedeni',
  nazev: 'Rezervace',
  pohled: 'klient:reservations',
  pristup: ['rezervace.zobrazit'],
  nastroj: { nazev: 'Rezervace', ikona: 'calendar', popis: 'Rezervace po dnech s potvrzením a usazením.' },
  doporucene: ['klient.dnesni_rezervace', 'klient.objednavky_od_stolu', 'prehled.ceka_na_tebe', 'klient.hodnoceni', 'akce.nejblizsi'],
  vychozi: { 'typ:vedeni': [{ w: 'nastroj' }, { w: 'klient.objednavky_od_stolu', s: 'M' }] },
  aktivni: true,
};
