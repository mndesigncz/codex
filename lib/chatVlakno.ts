// Čistá logika vlákna chatu (bez Reactu, ať jde testovat).

/**
 * Id první nepřečtené zprávy — nad ni patří čára „Nepřečtené“.
 * Počítá se JEDNOU, při prvním načtení vlákna, z počtu nepřečtených při
 * otevření. Dřív se index odvozoval z živého `messages.length`, takže každá
 * vlastní odeslaná zpráva a každá došlá při pollingu čáru posunula o řádek
 * níž — nad zprávu, kterou člověk už dávno četl. Id se s příchozími
 * zprávami nehýbe. Nula znamená „nepřečtené bylo celé vlákno“ (nebo nic):
 * čára tam nemá co oddělovat, vrací se null.
 */
export function prvniNeprectenaId(messages: { id: number }[], neprectenych: number): number | null {
  if (!(neprectenych > 0) || neprectenych >= messages.length) return null;
  return messages[messages.length - neprectenych].id;
}
