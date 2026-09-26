'use client';

// Burza směn — od kola 69 (balík B1) widget „Výměny směn" (rozvrh.vymeny
// v components/widgety/oblasti/rozvrh.tsx) a nabídka „Nabídnout do burzy…"
// u řádku v nadcházejících směnách (components/employee/MyShifts.tsx).
//
// Dřív tu byla samostatná karta pod Mými směnami: karta na každou nabídku,
// limetka „Vezmu si to", ručně tmavé „Nabídnout" a hláška „Směna je v burze. ✓".
// Pořád ji ale připojují layouty (EmployerLayout a EmployeeLayout patří
// balíku B8 a v kole 69 je B1 měnit nesmí), takže komponenta zůstává jako
// prázdné místo, aby se burza na stránce neukázala dvakrát. Integrace kola 69
// řádky z layoutů smaže a tenhle soubor s nimi.
export default function ShiftSwap(_props: { user?: { id?: string | number } }) {
  return null;
}
