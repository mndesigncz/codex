// Nahrání fotky jako důkazu nebo dokladu: okno Přilož fotku u úkolu
// (components/ukoly/PrilozFoto) a doklady k uzávěrce (CashClosing).
//
// Fotku pak vidí někdo jiný na jiném zařízení, proto jde nahoru jen ve formátu,
// který ukáže každý prohlížeč (pravidla v lib/nahravaniPravidla.ts): velká nebo
// neobvyklá fotka (HEIC z iPhonu, AVIF) se tady převede na zmenšený JPEG, a co
// prohlížeč přečíst neumí, se nepošle — volající dostane NecitelnaFotka a řekne
// člověku srozumitelně, co s tím. Nahrává se přes lib/nahrajSoubor, takže ani
// fotka nad limitem serverless funkce (4,5 MB) neskončí holým 413.

import { postupFotky, poNeprectene } from './nahravaniPravidla';
import { nahrajSoubor } from './nahrajSoubor';
import { okJson } from './api';
import { platnaFotka } from './ukolyPrehled';

/** Tenhle prohlížeč fotku neumí otevřít (typicky HEIC v Chromu) — nic se neposlalo. */
export class NecitelnaFotka extends Error {
  constructor() {
    super('necitelna-fotka');
    this.name = 'NecitelnaFotka';
  }
}

/** Fotka připravená k nahrání: beze změny, převedená na JPEG, nebo výjimka NecitelnaFotka. */
export async function pripravFotku(soubor: File): Promise<File> {
  if (postupFotky(soubor.type, soubor.size) === 'poslat') return soubor;
  const { prevedNaJpeg } = await import('./clientImage');
  const jpeg = await prevedNaJpeg(soubor);
  if (jpeg) {
    // Malý zobrazitelný originál (PNG z obrazovky) může být menší než JPEG — pak zůstane.
    return postupFotky(soubor.type, 0) === 'poslat' && jpeg.size >= soubor.size ? soubor : jpeg;
  }
  if (poNeprectene(soubor.type) === 'poslat') return soubor;
  throw new NecitelnaFotka();
}

/**
 * Připraví a nahraje fotku. Vrátí její adresu (/api/upload/<id>), null, když server
 * odpověděl něčím jiným než adresou fotky. Chyba sítě nebo serveru vyhodí (ApiError
 * s hláškou serveru), nečitelná fotka vyhodí NecitelnaFotka.
 */
export async function nahrajFotku(soubor: File): Promise<string | null> {
  const fotka = await pripravFotku(soubor);
  const d = await nahrajSoubor(fotka, fotka.name || 'foto.jpg').then(okJson);
  return platnaFotka(d?.url) ? d.url : null;
}
