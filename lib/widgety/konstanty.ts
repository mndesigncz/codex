// Konstanty plochy s widgety (kolo 68, spec §4.13 a §1.4).
//
// Všechno, co se ladí na skutečném telefonu (podržení, hystereze, pružina,
// vlnění), je na jednom místě: když na iPhonu podržení koliduje s rolováním,
// mění se číslo tady, ne v pěti komponentách (spec §8, první riziko).
// Časy jsou v milisekundách, vzdálenosti v CSS pixelech.

/** Podržení, které otevře kontextové menu (na prázdném místě rovnou úpravy). */
export const PODRZENI_MS = 500;

/** Promáčknutí při držení: začne až po 100 ms, ať se ho nedotkne každé rolování. */
export const PROMACKNUTI = { odMs: 100, meritko: 0.98, trvaniMs: 120 } as const;

/** Pohyb prstu, po kterém se podržení ruší (eukleidovsky od stisku). */
export const HYSTEREZE_PX = 10;

/** Kdy začne tah v režimu úprav: myš po 4 px pohybu, dotyk a pero po 180 ms držení (O6). */
export const AKTIVACE_TAHU = { mysPx: 4, dotykMs: 180 } as const;

/** Zvednutí tažené karty. */
export const ZVEDNUTI = { meritko: 1.03, trvaniMs: 120 } as const;

/** Nový cíl tahu platí, až v něm ukazatel vydrží — rychlý přejezd nepřeskládá všechno po cestě. */
export const PRODLEVA_CILE_MS = 80;

/** Pružina: kritické tlumení (bez odskoku), odezva 0,35 s (apple-design). */
export const PRUZINA = { tlumeni: 1, odezva: 0.35 } as const;

/** Strop rychlosti prstu předávané pružině. */
export const STROP_RYCHLOSTI = 2500;

/** Rychlost puštění: nejvýš tolik posledních vzorků z okna před puštěním (spec §4.5). */
export const RYCHLOST_PUSTENI = { oknoMs: 100, vzorku: 5 } as const;

/** Rolování u okraje při tahu: zóna od hrany a nejvyšší rychlost. */
export const ROLOVANI_U_OKRAJE = { zonaPx: 72, maxPxS: 1100 } as const;

/**
 * Vlnění v režimu úprav: délka kmitu ± rozptyl, fáze, úhel a výchylka rohu.
 * Úhel se počítá z velikosti karty (spec O4), ať se roh velké karty nekýve
 * o 4–6 px; 1,2° je jen strop pro malý widget na telefonu.
 */
export const VLNENI = { kmitMs: 260, rozptyl: 0.08, fazeMs: 520, uhelMin: 0.15, uhelMax: 1.2, rohPx: 2.3 } as const;

/** Lišta úprav: příjezd a odjezd (odchod je rychlejší). */
export const LISTA = { prijezdMs: 220, odjezdMs: 160 } as const;

/** Duch odebrané karty. */
export const DUCH_MS = 160;

/** Zápisy rozložení se slučují, než jde PUT. */
export const SLUCOVANI_ZAPISU_MS = 400;

/** Opakování neuloženého zápisu (síť, 5xx). */
export const OPAKOVANI_ZAPISU_MS = [2000, 5000, 15000] as const;

/** Zásobník „Vrátit" — nejvýš tolik kroků, platí do odchodu ze stránky. */
export const VRATIT_KROKU = 20;

/** Toast s akcí „Vrátit" drží déle než obyčejný. */
export const TOAST_S_AKCI_MS = 6000;

/** Sdílená mezipaměť dat widgetů: hotová odpověď platí 30 s. */
export const MEZIPAMET_DAT_MS = 30_000;

/** Po návratu do karty po delší době se data widgetů obnoví. */
export const OBNOVA_PO_NAVRATU_MS = 5 * 60_000;

// ---- Mřížka (spec §3.2) ----

/** Šířka plochy (ne okna), od které má mřížka 4, resp. 2 sloupce. */
export const MRIZKA_PRAHY = { ctyriOdPx: 840, dvaOdPx: 300 } as const;

/** Přirozená šířka widgetu pro zmenšený náhled v galerii (S, M, L). */
export const PRIROZENA_SIRKA = { S: 240, M: 496, L: 1008 } as const;

// ---- Limity rozložení (spec §1.4) ----

/** Víc položek plocha nenese; zbytek se zahodí. */
export const MAX_POLOZEK = 40;

/** Celé tělo PUT — nad tím 413 dřív, než se začne normalizovat. */
export const MAX_TELO_BAJTU = 16 * 1024;

/** Nastavení jedné instance po vyčištění. */
export const MAX_NASTAVENI_BAJTU = 2048;

/** Řetězec v nastavení. */
export const MAX_DELKA_TEXTU = 80;

/** Popisek odkazu (dlaždice). */
export const MAX_POPISEK_ODKAZU = 40;

/** Strop instancí widgetu s `vicekrat`, když si neurčí vlastní. */
export const MAX_INSTANCI = 6;

/**
 * Výchozí z kódu pro roli platí, jen když z něj divákovi zbudou aspoň tři
 * viditelné widgety (spec §1.3, krok 6). Chrání Účetní a Skladníka v kole
 * 68, kdy jejich výchozí stojí hlavně na widgetech z kola 69.
 */
export const PRAVIDLO_TRI = 3;

/**
 * …a zároveň aspoň tahle část položek výchozího role. Samotná trojka
 * nestačí: Skladník s tarifem Max by z deseti položek viděl tři (dvě L)
 * a měl by chudší plochu než se Pro, kde padne na výchozí vedení.
 */
export const PRAVIDLO_TRI_PODIL = 0.5;

/** Limit zápisů rozložení na člověka: 120 za minutu. */
export const LIMIT_ZAPISU = { max: 120, oknoS: 60 } as const;

/** Klíč v localStorage s posledním známým rozložením (kostry do příchodu GET). */
export const KLIC_POSLEDNIHO_ROZLOZENI = 'managero-rozlozeni';

/** Id hlavního nástroje stránky v rozložení. */
export const NASTROJ = 'nastroj';
