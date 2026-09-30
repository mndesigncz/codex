// Nahrávky ovládání aplikace: co ukazují a jak se jmenují soubory.
//
// Videa vyrábí scripts/nahravky/nahraj.mjs přímo ze živé ukázky /demo, rozměry
// a délky z nich zapisuje do nahravky.generated.ts. Popisy jsou tady: nahrávka
// bez popisu je pro odečítač obrazovky němý obdélník, a bez poměru stran by
// stránka po načtení videa poskočila.

import { NAHRAVKY_ROZMERY } from './nahravky.generated';

export type IdNahravky = 'ukol-uzaverka' | 'rozvrh' | 'sklad' | 'kiosk' | 'togo';

export type TvarZarizeni = 'pocitac' | 'tablet' | 'telefon';

export interface Nahravka {
  id: IdNahravky;
  /** Rám zařízení, ve kterém se smyčka ukazuje. */
  zarizeni: TvarZarizeni;
  /** Věta pro odečítač obrazovky: co se ve smyčce děje. */
  popis: string;
  /** Scéna živé ukázky, která ukazuje totéž (tlačítko „Zkus to sám"). */
  scena: 'prehled' | 'rozvrh' | 'uzaverka' | 'sklad' | 'kiosk';
}

export const NAHRAVKY: Record<IdNahravky, Nahravka> = {
  'ukol-uzaverka': {
    id: 'ukol-uzaverka', zarizeni: 'telefon', scena: 'uzaverka',
    popis: 'Zaměstnanec na telefonu odškrtne poslední povinný úkol a zamčená uzávěrka se odemkne.',
  },
  rozvrh: {
    id: 'rozvrh', zarizeni: 'pocitac', scena: 'rozvrh',
    popis: 'Vedení jedním kliknutím vygeneruje rozvrh na měsíc, projde návrh, uloží ho a publikuje.',
  },
  sklad: {
    id: 'sklad', zarizeni: 'pocitac', scena: 'sklad',
    popis: 'Sklad ukáže, co dochází, poskládá nákupní seznam a jedním kliknutím z něj vytvoří objednávky pro dodavatele.',
  },
  kiosk: {
    id: 'kiosk', zarizeni: 'tablet', scena: 'kiosk',
    popis: 'Tablet u baru: klepnutí na jméno, odškrtnutí úkolu a spuštění postupu, bez hesla.',
  },
  togo: {
    id: 'togo', zarizeni: 'telefon', scena: 'prehled',
    popis: 'Majitel v telefonu: přehled dne, docházející zásoby a rozvrh na pár ťuknutí.',
  },
};

export interface RozmerNahravky { w: number; h: number; sec: number }

/** Rozměr nahrávky; chybí-li (skript ještě neběžel), rozumný poměr podle zařízení, ať stránka nepoleze. */
export function rozmerNahravky(id: IdNahravky): RozmerNahravky {
  const r = NAHRAVKY_ROZMERY[id];
  if (r) return { w: r.w, h: r.h, sec: r.sec };
  const z = NAHRAVKY[id].zarizeni;
  return z === 'telefon' ? { w: 360, h: 720, sec: 12 } : z === 'tablet' ? { w: 960, h: 720, sec: 12 } : { w: 1280, h: 720, sec: 12 };
}

export const cestaNahravky = (id: IdNahravky) => `/brand/landing/rec/${id}`;
