// Vymyšlený ukázkový podnik „Kavárna U Lípy". Žádný skutečný podnik ani
// člověk: jména a příjmení jsou běžná česká, sestavená pro ukázku.
// Podnik je v celém demu označený jako ukázka (název týmu nese „(ukázka)").

import type { RoleDema } from '../sceny';

export const NAZEV_PODNIKU = 'Kavárna U Lípy (ukázka)';
export const NAZEV_ORGANIZACE = 'Ukázková organizace';
export const ID_TYMU = 1;
export const ID_ORGANIZACE = 1;
export const KOD_TYMU = 'UKAZKA';

export interface Clen {
  id: number;
  name: string;
  email: string;
  role: 'employer' | 'employee' | 'kiosk';
  avatar: string | null;
  jobTitle: string | null;
  hourlyRate: number;
  phone: string | null;
  /** Klíč přednastavené role (lib/opravneniKatalog): určuje oprávnění a navigaci. */
  roleKlic: 'vedeni' | 'provozni' | 'barista' | 'kuchar' | 'kiosk';
  roleNazev: string;
}

// ID jsou malá a stabilní: fixtury a odkazy z jiných částí ukázky na ně
// míří přímo (úkol přiřazený člověku 3 apod.).
export const LIDE: Clen[] = [
  { id: 1, name: 'Marta Havlíková', email: 'marta@ukazka.example', role: 'employer', avatar: '👩‍🦰', jobTitle: 'Majitelka', hourlyRate: 0, phone: '+420 601 000 101', roleKlic: 'vedeni', roleNazev: 'Majitel / Vedení' },
  { id: 2, name: 'Tomáš Dvořák', email: 'tomas@ukazka.example', role: 'employee', avatar: '🧔', jobTitle: 'Vedoucí směny', hourlyRate: 190, phone: '+420 601 000 102', roleKlic: 'barista', roleNazev: 'Barista / Obsluha' },
  { id: 3, name: 'Eliška Nováková', email: 'eliska@ukazka.example', role: 'employee', avatar: '👱‍♀️', jobTitle: 'Barista', hourlyRate: 170, phone: '+420 601 000 103', roleKlic: 'barista', roleNazev: 'Barista / Obsluha' },
  { id: 4, name: 'Jakub Kolář', email: 'jakub@ukazka.example', role: 'employee', avatar: '🧑', jobTitle: 'Brigádník', hourlyRate: 150, phone: null, roleKlic: 'barista', roleNazev: 'Barista / Obsluha' },
  { id: 5, name: 'Petra Marešová', email: 'petra@ukazka.example', role: 'employee', avatar: '👩‍🍳', jobTitle: 'Kuchařka', hourlyRate: 180, phone: '+420 601 000 105', roleKlic: 'kuchar', roleNazev: 'Kuchař' },
  { id: 6, name: 'Adam Beneš', email: 'adam@ukazka.example', role: 'employee', avatar: '🙂', jobTitle: 'Obsluha', hourlyRate: 150, phone: null, roleKlic: 'barista', roleNazev: 'Barista / Obsluha' },
  { id: 7, name: 'Tablet u baru', email: 'tablet@ukazka.example', role: 'kiosk', avatar: '📟', jobTitle: null, hourlyRate: 0, phone: null, roleKlic: 'kiosk', roleNazev: 'Kiosk (tablet)' },
];

export const clen = (id: number): Clen => LIDE.find(l => l.id === id) ?? LIDE[0];

/** Kdo je „přihlášený" v dané roli ukázky. */
export const KDO_JSEM: Record<RoleDema, number> = { vedeni: 1, zamestnanec: 3, kiosk: 7 };

/** Zaměstnanci a vedení, kteří mohou mít směnu (ne tablet). */
export const PRACUJICI = LIDE.filter(l => l.role !== 'kiosk');
