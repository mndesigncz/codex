// Cíle průvodce → widgety Přehledu. Čistá funkce, bez databáze a bez Reactu.
//
// Průvodce z odpovědí poskládá první Přehled vedení. Výstup prochází stejnou
// normalizací jako každé rozložení (normalizujRozlozeni), takže neplatné se
// zahodí jako všude jinde; tahle funkce navíc hlídá, co normalizace nehlídá
// a co je vidět na první pohled: Přehled se má číst (strop), ikony se
// neopakují (AK-19), inkoustová plocha je jediná a mřížka nemá osiřelý
// poloviční řádek.

import type { VychoziPolozka, Velikost } from '../widgety/typy.ts';
import { widget as najdiWidget } from '../widgety/katalog/index.ts';
import type { Cil, Pokladna, Tarif } from './typy.ts';
import { CILE_ID } from './typy.ts';

/** Nejvíc položek výchozího Přehledu: víc už se nečte. */
export const STROP_PREHLEDU = 12;
/** Méně než tolik widgetů by byl chudý Přehled, i když člověk nevybral nic. */
export const MIN_PREHLEDU = 6;

export interface VstupPrehledu {
  cile: readonly Cil[];
  /** Kolik lidí bude v týmu (odhad); jen pro Díry v obsazení. */
  velikostTymu?: 'sam' | 'mali' | 'stredni' | 'velky';
  pokladna?: Pokladna;
  tarif: Tarif;
}

type Zaznam = { w: string; s: Velikost };

const PODLE_CILE: Record<Cil, Zaznam[]> = {
  rozvrh: [
    { w: 'rozvrh.dnesni_smeny', s: 'M' },
    { w: 'dochazka.prave_na_smene', s: 'M' },
    { w: 'rozvrh.dostupnost_tymu', s: 'M' },
    { w: 'rozvrh.zadosti_volno', s: 'S' },
  ],
  sklad: [
    { w: 'sklad.dochazi', s: 'M' },
    { w: 'sklad.nakupni_seznam', s: 'M' },
    { w: 'sklad.objednavky', s: 'S' },
  ],
  uzaverky: [
    { w: 'uzaverky.chybejici', s: 'S' },
    { w: 'uzaverky.ke_schvaleni', s: 'S' },
    { w: 'trzby.po_dnech', s: 'M' },
    { w: 'uzaverky.rozdil_kasy', s: 'S' },
  ],
  provoz: [
    { w: 'ukoly.dnes', s: 'S' },
    { w: 'ukoly.po_terminu', s: 'S' },
    { w: 'postupy.povinne_dnes', s: 'M' },
  ],
  hoste: [
    { w: 'klient.dnesni_rezervace', s: 'M' },
    { w: 'klient.hoste_vernost', s: 'M' },
  ],
  finance: [
    { w: 'finance.souhrn_mesice', s: 'M' },
    { w: 'finance.trzby_vs_mzdy', s: 'S' },
  ],
};

/** Když člověk nevybral nic, dostane to, co zná každý podnik. */
const ZAKLAD: Zaznam[] = [
  { w: 'dochazka.prave_na_smene', s: 'M' },
  { w: 'rozvrh.dnesni_smeny', s: 'M' },
  { w: 'ukoly.dnes', s: 'S' },
  { w: 'sklad.dochazi', s: 'S' },
];

const VZDY_NA_ZACATKU: Zaznam[] = [
  { w: 'prehled.ceka_na_tebe', s: 'L' },
  { w: 'prehled.prvni_kroky', s: 'L' },
];
const VZDY_NA_KONCI: Zaznam[] = [
  { w: 'oznameni.nastenka', s: 'M' },
  { w: 'chat.neprectene', s: 'S' },
];
const POKLADNA_STORYOUS: Zaznam[] = [
  { w: 'pokladna.dnes', s: 'M' },
  { w: 'trzby.top_produkty', s: 'M' },
];

const PORADI_TARIFU: Record<Tarif, number> = { zdarma: 0, pro: 1, max: 2 };

/** Kandidáti v pořadí důležitosti: nejdřív první widget každého cíle, pak druhý… */
function kandidati(v: VstupPrehledu): Zaznam[] {
  const cile = CILE_ID.filter(c => v.cile.includes(c));
  const sloupce: Zaznam[][] = cile.map(c => {
    const z = PODLE_CILE[c].slice();
    // Díry v obsazení mají smysl až u týmu, kde se směny doopravdy plánují.
    if (c === 'rozvrh' && (v.velikostTymu === 'stredni' || v.velikostTymu === 'velky')) z.splice(3, 0, { w: 'rozvrh.diry', s: 'S' });
    return z;
  });
  const out: Zaznam[] = [];
  // Pokladna jde před cíli: jediná inkoustová plocha Přehledu patří penězům z kasy.
  if (v.pokladna === 'storyous') out.push(...POKLADNA_STORYOUS);
  const nejdelsi = Math.max(0, ...sloupce.map(s => s.length));
  for (let i = 0; i < nejdelsi; i++) for (const s of sloupce) if (s[i]) out.push(s[i]);
  return out;
}

/**
 * Poskládá výchozí Přehled. Pravidla, která hlídá test:
 *  - vždy začíná Čeká na tebe a První kroky a končí Nástěnkou a Chatem,
 *  - nejvýš STROP_PREHLEDU položek, každý cíl je zastoupen (střídání),
 *  - widget s vyšším tarifem, než má podnik, se vynechá,
 *  - ikony se neopakují (při kolizi vyhrává dřívější),
 *  - nejvýš jeden widget s `muzeInkoust`,
 *  - počet S widgetů je sudý (jinak by telefon měl poloviční řádek).
 */
export function sestavPrehled(v: VstupPrehledu): VychoziPolozka[] {
  const pouzite = new Set<string>();
  const ikony = new Set<string>();
  let inkoust = false;
  const vysledek: Zaznam[] = [];
  const zkus = (z: Zaznam): boolean => {
    const d = najdiWidget(z.w);
    if (!d || d.stav !== 'hotovo' || !d.rozhrani.includes('vedeni')) return false;
    if (pouzite.has(z.w)) return false;
    if (PORADI_TARIFU[d.tarif] > PORADI_TARIFU[v.tarif]) return false;
    if (ikony.has(d.ikona)) return false;
    if (d.muzeInkoust && inkoust) return false;
    const velikost = d.velikosti.includes(z.s) ? z.s : d.vychoziVelikost;
    pouzite.add(z.w); ikony.add(d.ikona);
    if (d.muzeInkoust) inkoust = true;
    vysledek.push({ w: z.w, s: velikost });
    return true;
  };

  // Pevný začátek a konec si rezervují místo dopředu, ať je cíle nevytlačí.
  for (const z of VZDY_NA_ZACATKU) zkus(z);
  const konec: Zaznam[] = [];
  for (const z of VZDY_NA_KONCI) {
    const d = najdiWidget(z.w);
    if (d && d.stav === 'hotovo' && !ikony.has(d.ikona)) { ikony.add(d.ikona); pouzite.add(z.w); konec.push({ w: z.w, s: d.velikosti.includes(z.s) ? z.s : d.vychoziVelikost }); }
  }
  const misto = STROP_PREHLEDU - vysledek.length - konec.length;

  const zacatek = vysledek.length;
  const zdroj = v.cile.length ? kandidati(v) : ZAKLAD;
  for (const z of zdroj) {
    if (vysledek.length - zacatek >= misto) break;
    zkus(z);
  }
  // Chudý Přehled: dosypat základ, dokud není aspoň MIN_PREHLEDU.
  if (vysledek.length + konec.length < MIN_PREHLEDU) {
    for (const z of ZAKLAD) { if (vysledek.length + konec.length >= MIN_PREHLEDU) break; zkus(z); }
  }
  const polozky: Zaznam[] = [...vysledek, ...konec];

  // Sudý počet S: lichý by nechal na telefonu poloviční řádek. Nejdřív se
  // zkusí poslední S povýšit na M (pokud to widget umí), jinak se vyhodí.
  const pocetS = () => polozky.filter(p => p.s === 'S').length;
  if (pocetS() % 2 === 1) {
    let i = polozky.length - 1;
    for (; i >= 0; i--) {
      if (polozky[i].s !== 'S') continue;
      const d = najdiWidget(polozky[i].w);
      if (d?.velikosti.includes('M')) { polozky[i] = { ...polozky[i], s: 'M' }; break; }
    }
    if (i < 0) {
      for (let j = polozky.length - 1; j >= 0; j--) {
        if (polozky[j].s === 'S' && !VZDY_NA_ZACATKU.some(z => z.w === polozky[j].w)) { polozky.splice(j, 1); break; }
      }
    }
  }
  return polozky.map(p => ({ w: p.w, s: p.s }));
}

/** Kolik widgetů která velikost zabere — pro miniaturu Přehledu ve finále. */
export const ROZPETI_NAHLEDU: Record<Velikost, number> = { S: 1, M: 2, L: 4 };
