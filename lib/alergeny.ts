// Alergeny na jídelním lístku: čtrnáct skupin podle nařízení EU č. 1169/2011
// (číslování jako v české praxi) a štítky jídel (vegan, pikantní…).
//
// Alergeny jsou katalog podle id (kód 1–14), ne česká věta jako klíč: názvy jsou
// právně vázané, proto žijí na jednom místě ve všech pěti jazycích a server je
// posílá hostovi v jazyce, který si zvolil (lístek je statická stránka, která
// slovník aplikace nemá). Názvy vycházejí z úředního znění nařízení; překlady
// pl/sk/de psal model a PŘED SPUŠTĚNÍM DANÉ ZEMĚ je musí ověřit rodilý mluvčí
// (`povinne_overit`, plán §7.2 a §10 bod 6).
//
// Bez vyplněných alergenů u položky se NEZOBRAZÍ NIC (ne „bez alergenů"):
// prázdné pole neznamená, že jídlo alergen neobsahuje, jen že ho nikdo nevyplnil.
//
// Čistý modul bez Reactu; běží i v `npm test` (relativní importy s příponou).

import type { Jazyk } from './i18n/config.ts';

export const KODY_ALERGENU = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;
export type KodAlergenu = (typeof KODY_ALERGENU)[number];

export const ALERGENY: Record<KodAlergenu, Record<Jazyk, string>> = {
  1: { cs: 'Obiloviny obsahující lepek', en: 'Cereals containing gluten', de: 'Glutenhaltiges Getreide', sk: 'Obilniny obsahujúce lepok', pl: 'Zboża zawierające gluten' },
  2: { cs: 'Korýši', en: 'Crustaceans', de: 'Krebstiere', sk: 'Kôrovce', pl: 'Skorupiaki' },
  3: { cs: 'Vejce', en: 'Eggs', de: 'Eier', sk: 'Vajcia', pl: 'Jaja' },
  4: { cs: 'Ryby', en: 'Fish', de: 'Fisch', sk: 'Ryby', pl: 'Ryby' },
  5: { cs: 'Arašídy', en: 'Peanuts', de: 'Erdnüsse', sk: 'Arašidy', pl: 'Orzeszki ziemne' },
  6: { cs: 'Sója', en: 'Soya', de: 'Soja', sk: 'Sója', pl: 'Soja' },
  7: { cs: 'Mléko', en: 'Milk', de: 'Milch', sk: 'Mlieko', pl: 'Mleko' },
  8: { cs: 'Skořápkové plody', en: 'Tree nuts', de: 'Schalenfrüchte', sk: 'Orechy', pl: 'Orzechy' },
  9: { cs: 'Celer', en: 'Celery', de: 'Sellerie', sk: 'Zeler', pl: 'Seler' },
  10: { cs: 'Hořčice', en: 'Mustard', de: 'Senf', sk: 'Horčica', pl: 'Gorczyca' },
  11: { cs: 'Sezam', en: 'Sesame', de: 'Sesam', sk: 'Sezam', pl: 'Sezam' },
  12: { cs: 'Oxid siřičitý a siřičitany', en: 'Sulphur dioxide and sulphites', de: 'Schwefeldioxid und Sulfite', sk: 'Oxid siričitý a siričitany', pl: 'Dwutlenek siarki i siarczyny' },
  13: { cs: 'Vlčí bob', en: 'Lupin', de: 'Lupinen', sk: 'Vlčí bôb', pl: 'Łubin' },
  14: { cs: 'Měkkýši', en: 'Molluscs', de: 'Weichtiere', sk: 'Mäkkýše', pl: 'Mięczaki' },
};

export function jeKodAlergenu(v: unknown): v is KodAlergenu {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 14;
}

/** Název alergenu v jazyce; neznámý kód vrací prázdný řetězec (nikdy „undefined"). */
export function nazevAlergenu(kod: KodAlergenu, jazyk: Jazyk): string {
  return ALERGENY[kod]?.[jazyk] ?? ALERGENY[kod]?.cs ?? '';
}

/**
 * Cokoli z těla požadavku nebo z databáze → seřazený seznam platných kódů 1–14
 * bez duplicit. Čísla jako řetězec („3") se berou; desetinná a mimo rozsah ne.
 */
export function cistiAlergeny(raw: unknown): KodAlergenu[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<KodAlergenu>();
  for (const x of raw) {
    const n = typeof x === 'string' && /^\d{1,2}$/.test(x.trim()) ? Number(x) : x;
    if (jeKodAlergenu(n)) out.add(n);
  }
  return Array.from(out).sort((a, b) => a - b);
}

// ---- štítky jídel ---------------------------------------------------------

export const KODY_STITKU = ['vegan', 'vegetarian', 'bez-lepku', 'pikantni', 'novinka', 'doporucujeme'] as const;
export type KodStitku = (typeof KODY_STITKU)[number];

/**
 * Štítky NEJSOU právní tvrzení: „vegan" nebo „bez lepku" musí podnik zadat jen
 * tehdy, když si je jistý (v editoru je k tomu nápověda). Alergeny jsou jediné,
 * co nařízení vyžaduje.
 */
export const STITKY: Record<KodStitku, Record<Jazyk, string>> = {
  vegan: { cs: 'Vegan', en: 'Vegan', de: 'Vegan', sk: 'Vegán', pl: 'Wegańskie' },
  vegetarian: { cs: 'Vegetariánské', en: 'Vegetarian', de: 'Vegetarisch', sk: 'Vegetariánske', pl: 'Wegetariańskie' },
  'bez-lepku': { cs: 'Bez lepku', en: 'Gluten-free', de: 'Glutenfrei', sk: 'Bez lepku', pl: 'Bez glutenu' },
  pikantni: { cs: 'Pikantní', en: 'Spicy', de: 'Scharf', sk: 'Pikantné', pl: 'Ostre' },
  novinka: { cs: 'Novinka', en: 'New', de: 'Neu', sk: 'Novinka', pl: 'Nowość' },
  doporucujeme: { cs: 'Doporučujeme', en: 'Recommended', de: 'Empfehlung', sk: 'Odporúčame', pl: 'Polecamy' },
};

export function cistiStitky(raw: unknown): KodStitku[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<KodStitku>();
  for (const x of raw) if (typeof x === 'string' && (KODY_STITKU as readonly string[]).includes(x)) out.add(x as KodStitku);
  return KODY_STITKU.filter(k => out.has(k));
}
