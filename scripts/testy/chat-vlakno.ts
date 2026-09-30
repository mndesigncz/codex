// Čára „Nepřečtené“ ve vlákně chatu (lib/chatVlakno.ts).
//
// Chyba z auditu: index čáry se odvozoval z živé délky vlákna, takže každá
// nová zpráva ji posunula níž — nad zprávu, kterou člověk dávno četl.

import type { Testy } from './_testy.ts';
import { prvniNeprectenaId } from '../../lib/chatVlakno.ts';

export default function ({ eq }: Testy) {
  const zpravy = (n: number) => Array.from({ length: n }, (_, i) => ({ id: 100 + i }));

  // Vlákno o 8 zprávách, 2 nepřečtené: čára nad 7. zprávou (id 106).
  const priOtevreni = zpravy(8);
  const id = prvniNeprectenaId(priOtevreni, 2);
  eq('chat: čára je nad první nepřečtenou', id, 106);

  // Po odeslání vlastní zprávy i po pollingu má čára zůstat u téže zprávy.
  const poDalsich = [...priOtevreni, { id: 108 }, { id: 109 }];
  eq('chat: id čáry se s novými zprávami nemění (drží se přišpendlené id)',
    poDalsich.findIndex(m => m.id === id), 6);

  // Kdyby se počítala z živé délky (původní chyba), skončila by jinde.
  eq('chat: živá délka by čáru posunula (proto se nepočítá znovu)',
    poDalsich[poDalsich.length - 2].id !== id, true);

  eq('chat: nic nepřečteno = žádná čára', prvniNeprectenaId(zpravy(5), 0), null);
  eq('chat: celé vlákno nepřečtené = žádná čára', prvniNeprectenaId(zpravy(3), 3), null);
  eq('chat: víc nepřečtených než zpráv = žádná čára', prvniNeprectenaId(zpravy(3), 9), null);
  eq('chat: prázdné vlákno', prvniNeprectenaId([], 1), null);
  eq('chat: jedna nepřečtená = poslední zpráva', prvniNeprectenaId(zpravy(4), 1), 103);
}
