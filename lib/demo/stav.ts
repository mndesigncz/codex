// Stav ukázky v paměti. Vše, co mock server vrací, se skládá odsud a zápisy
// (odškrtnutí úkolu, uzávěrka, návrh rozvrhu, úprava skladu…) ho mění, takže
// další čtení ukáže výsledek jako skutečný server. Reset = vytvořit stav znovu.
//
// Datumy se počítají od dneška v Praze (lib/demo/cas.ts), žádné pevné dny:
// ukázka nikdy „nezestárne" ani po roce.

import { casDnes, dnes, dnyMesice, denVTydnu, mesic, posunDen } from './cas';
import { LIDE, PRACUJICI, KDO_JSEM, clen } from './data/lide';
import type { RoleDema } from './sceny';
import type { PolozkaRozlozeni } from '@/lib/widgety/typy';

export interface Smena {
  id: number; employeeId: number; date: string; startTime: string; endTime: string; type: string;
}
export interface TypSmenyDemo {
  id: number; name: string; startTime: string; endTime: string; color: string; position: number;
  startsAtOpen: boolean; endsAtClose: boolean;
}
export interface UkolDemo {
  id: number; title: string; description: string | null; assignedTo: number | null; createdBy: number;
  priority: 'low' | 'medium' | 'high'; status: 'pending' | 'done'; dueDate: string | null;
  recurrence: string | null; seriesId: string | null; checklist: { text: string; done: boolean }[];
  completedBy: number | null; completedAt: string | null; source: string | null; sourceMeta: unknown;
  requireBeforeClosing: boolean;
}
export interface UzaverkaDemo {
  id: number; created_by: number; date: string; shift_date: string; shift_label: string;
  opening_cash: number; cash_revenue: number; card_revenue: number; tips: number; tips_card: number;
  expenses: number; cash_removed: number; self_payout: number; closing_cash: number; customers: number;
  notes: string | null; approved: boolean; movements: unknown[]; denominations: Record<string, number>;
  shiftEmployees: number[]; final_removal: number; created_at: string;
  handover?: { todo?: string; runningOut?: string; message?: string } | null;
}
export interface KategorieSkladu { id: number; name: string; position: number; parentId: number | null }
export interface Zasoba {
  id: number; name: string; categoryId: number; quantity: number; unit: string;
  minQuantity: number; criticalQuantity: number; maxQuantity: number; supplier: string | null;
  unitCost: number; updatedAt: string; updatedBy: number;
}
export interface PohybSkladu { id: number; itemId: number; oldQuantity: number; newQuantity: number; note: string | null; createdAt: string; userId: number }
export interface OznameniDemo { id: number; content: string; pinned: boolean; createdAt: string; authorId: number }
export interface PricitanaPichacka { id: number; employeeId: number; clockIn: string; clockOut: string | null; source: string; note: string | null }
export interface ZadostVolno { id: number; employeeId: number; fromDate: string; toDate: string; type: string; note: string | null; status: 'pending' | 'approved' | 'rejected'; createdAt: string }
export interface NabidkaSmeny { id: number; shiftId: number; offeredBy: number; claimedBy: number | null; status: 'open' | 'claimed' | 'approved' | 'rejected'; note: string | null }
export interface DostupnostDemo {
  id: number; employeeId: number; month: string; unavailableDates: string[]; dayPreferences: Record<string, string>;
  preferredShift: string | null; maxShifts: number | null; note: string | null; status: string;
}
export interface ObjednavkaDemo {
  id: number; supplier: string; items: { name: string; qty: number; unit: string; itemId: number }[];
  totalCost: number | null; status: 'ordered' | 'received'; note: string | null; createdAt: string; receivedAt: string | null; createdBy: number;
}
export interface ZpravaChatu { id: number; conversationId: number; userId: number; content: string; createdAt: string }

export interface DemoStav {
  /** Den, od kterého se vše počítá (YYYY-MM-DD, Praha). */
  dnes: string;
  role: RoleDema;
  typySmen: TypSmenyDemo[];
  smeny: Smena[];
  ukoly: UkolDemo[];
  uzaverky: UzaverkaDemo[];
  kategorie: KategorieSkladu[];
  zasoby: Zasoba[];
  pohybySkladu: PohybSkladu[];
  oznameni: OznameniDemo[];
  pichacky: PricitanaPichacka[];
  volno: ZadostVolno[];
  nabidky: NabidkaSmeny[];
  zpravy: ZpravaChatu[];
  dostupnost: DostupnostDemo[];
  objednavky: ObjednavkaDemo[];
  /** Osobní rozložení ploch, které si člověk v ukázce upravil (stránka → položky). */
  rozlozeni?: Record<string, { polozky: PolozkaRozlozeni[]; verze: number }>;
  /** Přečtené konverzace (id → přečteno). */
  precteno: Set<number>;
  /** Postup „Zavírací postup" už tým dnes udělal (povinné před uzávěrkou). */
  zaviraciPostupHotov: boolean;
  /** Přečtené povinné návody. */
  navodPrecten: boolean;
  /** Sekvence pro nová id. */
  dalsiId: number;
  /** Oznámení vzniklá zápisem: chat, upozornění. */
  notifikace: { id: number; title: string; body: string; type: string; link: string | null; is_read: boolean; created_at: string }[];
}

export const OTEVIRACI_DOBA: Record<string, { open: string; close: string; closed: boolean }> = {
  '0': { open: '07:30', close: '20:00', closed: false },
  '1': { open: '07:30', close: '20:00', closed: false },
  '2': { open: '07:30', close: '20:00', closed: false },
  '3': { open: '07:30', close: '20:00', closed: false },
  '4': { open: '07:30', close: '21:00', closed: false },
  '5': { open: '08:00', close: '21:00', closed: false },
  '6': { open: '09:00', close: '18:00', closed: false },
};

const iso = (d: Date) => d.toISOString();
const pred = (ms: number) => iso(new Date(Date.now() - ms));
const MIN = 60_000;
const HOD = 60 * MIN;

/** Typy směn: Ranní od otevření, Odpolední do zavření (generátor si časy dopočítá). */
function typy(): TypSmenyDemo[] {
  return [
    { id: 1, name: 'Ranní', startTime: '07:30', endTime: '14:00', color: '#C8F542', position: 0, startsAtOpen: true, endsAtClose: false },
    { id: 2, name: 'Odpolední', startTime: '14:00', endTime: '20:00', color: '#0A84FF', position: 1, startsAtOpen: false, endsAtClose: true },
  ];
}

/**
 * Uložený rozvrh: dva týdny zpět a týden dopředu (dva lidé denně, střídají se).
 * Zbytek měsíce je prázdný, právě tam generátor ukáže, co umí. Dnes: Tomáš
 * ráno, Eliška odpoledne (u ní pak běží uzávěrka). Směny jdou přes hranici
 * měsíce, ať ukázka není první den v měsíci prázdná.
 */
function smeny(dnesDen: string, t: TypSmenyDemo[], idOd: () => number): Smena[] {
  const [rano, odpo] = t;
  const poradiRano = [2, 5, 3, 4, 2, 6, 5];
  const poradiOdpo = [3, 6, 4, 2, 6, 3, 4];
  const out: Smena[] = [];
  for (let i = -14; i <= 7; i++) {
    const d = posunDen(dnesDen, i);
    const hod = OTEVIRACI_DOBA[String((denVTydnu(d) + 6) % 7)];
    let r = poradiRano[(i + 14) % poradiRano.length];
    let o = poradiOdpo[(i + 14) % poradiOdpo.length];
    if (d === dnesDen) { r = 2; o = 3; }
    if (r === o) o = o === 6 ? 4 : 6;
    out.push({ id: idOd(), employeeId: r, date: d, startTime: rano.startTime, endTime: '14:00', type: rano.name });
    out.push({ id: idOd(), employeeId: o, date: d, startTime: '14:00', endTime: hod.close, type: odpo.name });
  }
  return out;
}

function ukoly(dnesDen: string): UkolDemo[] {
  const zaklad = { description: null, createdBy: 1, priority: 'medium' as const, status: 'pending' as const, recurrence: null, seriesId: null, checklist: [], completedBy: null, completedAt: null, source: null, sourceMeta: null, requireBeforeClosing: false };
  return [
    // Povinný před uzávěrkou: odškrtnutím se uzávěrka odemkne (scéna Uzávěrka).
    { ...zaklad, id: 41, title: 'Vynést koš a přebalit odpad', assignedTo: null, priority: 'high', dueDate: dnesDen, recurrence: 'daily', seriesId: 's-kos', requireBeforeClosing: true },
    { ...zaklad, id: 42, title: 'Doplnit sirupy u baru', description: 'Vanilka, karamel a lískový oříšek.', assignedTo: 3, dueDate: dnesDen,
      checklist: [{ text: 'Vanilka', done: false }, { text: 'Karamel', done: true }, { text: 'Lískový oříšek', done: false }] },
    { ...zaklad, id: 43, title: 'Objednat mléko a oves na víkend', assignedTo: 2, priority: 'high', dueDate: dnesDen },
    { ...zaklad, id: 44, title: 'Vytřít podlahu v zázemí', assignedTo: null, dueDate: posunDen(dnesDen, -1) },
    { ...zaklad, id: 45, title: 'Zkontrolovat data trvanlivosti v lednici', assignedTo: 5, dueDate: posunDen(dnesDen, 1) },
    { ...zaklad, id: 46, title: 'Umýt výlohu a okna', assignedTo: 6, priority: 'low', dueDate: posunDen(dnesDen, 3) },
    { ...zaklad, id: 47, title: 'Napéct ranní koláče', assignedTo: 5, dueDate: dnesDen, status: 'done', completedBy: 5, completedAt: casDnes('07:12', dnesDen) },
    { ...zaklad, id: 48, title: 'Spočítat kasu při otevření', assignedTo: null, dueDate: dnesDen, status: 'done', completedBy: 2, completedAt: casDnes('07:38', dnesDen) },
  ];
}

/** Tržba dne podle dne v týdnu (0 = neděle): pátek a sobota nejsilnější. */
const ZAKLAD_TRZBY = [17200, 14600, 15300, 15900, 16400, 22800, 26100];

/**
 * Minulé uzávěrky: za každý z posledních dnů jedna (uzavírá odpolední směna,
 * ranní je v ní uvedená jako spoluúčastník). Čísla se mění podle dne v týdnu
 * a jsou stabilní (žádná náhoda): ukázka vypadá stejně při každém načtení.
 */
function uzaverky(dnesDen: string, sm: Smena[], idOd: () => number): UzaverkaDemo[] {
  const out: UzaverkaDemo[] = [];
  for (let pred = 14; pred >= 1; pred--) {
    const den = posunDen(dnesDen, -pred);
    const rano = sm.find(x => x.date === den && x.startTime === '07:30');
    const odpo = sm.find(x => x.date === den && x.startTime === '14:00');
    if (!odpo) continue;
    const kolik = Math.round((ZAKLAD_TRZBY[denVTydnu(den)] + ((pred * 431) % 1900) - 800) / 10) * 10;
    const hot = Math.round(kolik * 0.42 / 10) * 10;
    const kar = kolik - hot;
    const sp = 180 + (pred * 37) % 320;
    const otevreni = 2000;
    out.push({
      id: idOd(), created_by: odpo.employeeId, date: den, shift_date: den, shift_label: `${OTEVIRACI_DOBA[String((denVTydnu(den) + 6) % 7)].open}–${odpo.endTime}`,
      opening_cash: otevreni, cash_revenue: hot, card_revenue: kar, tips: sp, tips_card: 0,
      expenses: 0, cash_removed: hot - 1000, self_payout: 0, closing_cash: otevreni + hot + sp - (hot - 1000), customers: Math.round(kolik / 190), notes: pred === 3 ? 'Plná zahrádka, došly croissanty už v poledne.' : null,
      approved: pred > 1, movements: [], denominations: {},
      shiftEmployees: rano && rano.employeeId !== odpo.employeeId ? [odpo.employeeId, rano.employeeId] : [odpo.employeeId],
      final_removal: 0, created_at: casDnes('20:15', den),
      // Předávka dne: to, co nastupující směna čte ráno na tabletu i na Přehledu.
      handover: pred === 1 ? { todo: 'Doplnit mléko do lednice', runningOut: 'Ovesný nápoj a sirup karamel', message: 'Kávovar hlásí odvápnění, tabletky jsou v zásuvce pod barem.' } : null,
    });
  }
  return out;
}

function sklad(dnesDen: string): { kategorie: KategorieSkladu[]; zasoby: Zasoba[] } {
  const kategorie: KategorieSkladu[] = [
    { id: 1, name: 'Káva', position: 0, parentId: null },
    { id: 2, name: 'Mléčné a alternativy', position: 1, parentId: null },
    { id: 3, name: 'Sirupy a omáčky', position: 2, parentId: null },
    { id: 4, name: 'Pečivo a dezerty', position: 3, parentId: null },
    { id: 5, name: 'Nealko', position: 4, parentId: null },
    { id: 6, name: 'Provoz a drogerie', position: 5, parentId: null },
  ];
  const kdy = casDnes('07:05', dnesDen);
  // [id, název, kat, množství, jednotka, min, kritické, max, dodavatel, cena]
  const r: [number, string, number, number, string, number, number, number, string, number][] = [
    [1, 'Espresso zrna „Domácí směs"', 1, 3, 'kg', 4, 2, 15, 'Pražírna Pod Věží', 620],
    [2, 'Espresso zrna bez kofeinu', 1, 4, 'kg', 2, 1, 6, 'Pražírna Pod Věží', 690],
    [3, 'Mléko čerstvé polotučné', 2, 6, 'l', 12, 6, 60, 'Mlékárna Vysočina', 24],
    [4, 'Ovesný nápoj barista', 2, 5, 'l', 6, 3, 30, 'Makro', 52],
    [5, 'Šlehačka 33 %', 2, 2, 'l', 3, 1, 8, 'Mlékárna Vysočina', 98],
    [6, 'Sirup vanilka', 3, 2, 'ks', 2, 1, 6, 'Makro', 165],
    [7, 'Sirup karamel', 3, 1, 'ks', 2, 1, 6, 'Makro', 165],
    [8, 'Čokoládová poleva', 3, 3, 'ks', 2, 1, 6, 'Makro', 210],
    [9, 'Croissant máslový', 4, 14, 'ks', 10, 5, 40, 'Pekárna U Mostu', 18],
    [10, 'Řezy a koláče (zmrazené)', 4, 9, 'ks', 6, 3, 24, 'Pekárna U Mostu', 34],
    [11, 'Citronová limonáda domácí', 5, 18, 'l', 8, 4, 30, 'vlastní výroba', 22],
    [12, 'Minerálka jemně perlivá', 5, 24, 'ks', 12, 6, 72, 'Makro', 14],
    [13, 'Kelímky 0,3 l na s sebou', 6, 60, 'ks', 150, 60, 800, 'Obaly Plus', 2.2],
    [14, 'Víčka na kelímky', 6, 420, 'ks', 150, 60, 800, 'Obaly Plus', 0.9],
    [15, 'Čisticí tablety do kávovaru', 6, 8, 'ks', 4, 2, 20, 'Pražírna Pod Věží', 22],
    [16, 'Papírové ubrousky', 6, 800, 'ks', 500, 200, 3000, 'Obaly Plus', 0.4],
  ];
  return {
    kategorie,
    zasoby: r.map(([id, name, categoryId, quantity, unit, min, kr, max, supplier, cost]) => ({
      id, name, categoryId, quantity, unit, minQuantity: min, criticalQuantity: kr, maxQuantity: max,
      supplier, unitCost: cost, updatedAt: kdy, updatedBy: 2,
    })),
  };
}

function oznameni(dnesDen: string): OznameniDemo[] {
  return [
    { id: 1, content: 'V pátek zavíráme už v 18:00 kvůli soukromé oslavě. Kdo chce navíc směnu, ať napíše Martě.', pinned: true, createdAt: pred(26 * HOD), authorId: 1 },
    { id: 2, content: 'Od pondělí máme nového dodavatele koláčů, ceník najdete ve Skladu. Zkuste všechny druhy, ať víme, co doporučovat hostům.', pinned: true, createdAt: pred(3 * 24 * HOD), authorId: 1 },
  ];
}

function pichacky(dnesDen: string, idOd: () => number): PricitanaPichacka[] {
  // Příchody se počítají od „teď", ne od pevné hodiny: kdo ukázku otevře
  // v jakoukoli dobu, vidí, že Tomáš je na směně už pár hodin a Eliška teprve přišla.
  // Nejdřív po dnešní půlnoci: noční návštěvník by jinak viděl příchod „včera 23:14".
  const odPulnoci = new Date(casDnes('00:05', dnesDen)).getTime();
  const pozdeji = (ms: number) => iso(new Date(Math.max(Date.now() - ms, odPulnoci)));
  const out: PricitanaPichacka[] = [
    { id: idOd(), employeeId: 2, clockIn: pozdeji(3 * HOD + 14 * MIN), clockOut: null, source: 'kiosk', note: null },
    { id: idOd(), employeeId: 5, clockIn: pozdeji(4 * HOD + 2 * MIN), clockOut: null, source: 'kiosk', note: null },
    { id: idOd(), employeeId: 3, clockIn: pozdeji(52 * MIN), clockOut: null, source: 'app', note: null },
  ];
  // Historie minulých dnů (pro Docházku a odpracované hodiny).
  const hist: [number, number, string, string][] = [
    [1, 2, '07:24', '14:08'], [1, 3, '13:55', '20:10'], [2, 3, '07:28', '14:03'], [2, 4, '13:58', '20:05'],
    [3, 6, '08:01', '18:02'], [3, 5, '07:50', '15:40'], [4, 2, '07:27', '14:05'], [4, 6, '13:59', '20:12'],
  ];
  for (const [p, kdo, a, b] of hist) {
    const den = posunDen(dnesDen, -p);
    out.push({ id: idOd(), employeeId: kdo, clockIn: casDnes(a, den), clockOut: casDnes(b, den), source: 'kiosk', note: null });
  }
  return out;
}

/** Dostupnost na tenhle a příští měsíc: generátor s ní při návrhu počítá. */
function dostupnost(dnesDen: string, idOd: () => number): DostupnostDemo[] {
  const m1 = mesic(dnesDen);
  const m2 = mesic(posunDen(dnyMesice(m1)[dnyMesice(m1).length - 1], 1));
  const out: DostupnostDemo[] = [];
  for (const m of [m1, m2]) {
    const dny = dnyMesice(m);
    const v = (i: number) => dny[Math.min(i, dny.length - 1)];
    out.push(
      { id: idOd(), employeeId: 4, month: m, unavailableDates: [v(8), v(9), v(15)], dayPreferences: {}, preferredShift: 'afternoon', maxShifts: 12, note: 'Ve škole do 14:00, ráno nemůžu.', status: 'submitted' },
      { id: idOd(), employeeId: 6, month: m, unavailableDates: [v(11), v(12), v(18), v(19)], dayPreferences: {}, preferredShift: 'flexible', maxShifts: 14, note: null, status: 'submitted' },
      { id: idOd(), employeeId: 5, month: m, unavailableDates: [v(2)], dayPreferences: {}, preferredShift: 'morning', maxShifts: null, note: 'Nejradši ranní, kvůli pečení.', status: 'submitted' },
      { id: idOd(), employeeId: 3, month: m, unavailableDates: [], dayPreferences: {}, preferredShift: 'flexible', maxShifts: null, note: null, status: 'submitted' },
    );
  }
  return out;
}

export function vytvorStav(role: RoleDema): DemoStav {
  const d = dnes();
  let id = 1000;
  const idOd = () => ++id;
  const t = typy();
  const s = sklad(d);
  const sm = smeny(d, t, idOd);
  const stav: DemoStav = {
    dnes: d,
    role,
    typySmen: t,
    smeny: sm,
    ukoly: ukoly(d),
    uzaverky: uzaverky(d, sm, idOd),
    kategorie: s.kategorie,
    zasoby: s.zasoby,
    pohybySkladu: [
      { id: idOd(), itemId: 3, oldQuantity: 14, newQuantity: 6, note: 'Spotřeba za den', createdAt: pred(5 * HOD), userId: 2 },
      { id: idOd(), itemId: 9, oldQuantity: 24, newQuantity: 14, note: 'Ranní dodávka pečiva', createdAt: pred(4 * HOD), userId: 5 },
      { id: idOd(), itemId: 1, oldQuantity: 5, newQuantity: 3, note: null, createdAt: pred(2 * HOD), userId: 3 },
    ],
    oznameni: oznameni(d),
    pichacky: pichacky(d, idOd),
    volno: [
      { id: idOd(), employeeId: 6, fromDate: posunDen(d, 9), toDate: posunDen(d, 11), type: 'vacation', note: 'Svatba v rodině', status: 'pending', createdAt: pred(20 * HOD) },
      { id: idOd(), employeeId: 4, fromDate: posunDen(d, 4), toDate: posunDen(d, 4), type: 'other', note: 'Zkouška ve škole', status: 'approved', createdAt: pred(4 * 24 * HOD) },
    ],
    nabidky: [],
    zpravy: [
      { id: idOd(), conversationId: 1, userId: 3, content: 'Dneska nám došel karamel, objednala jsem, ať to není na víkend problém.', createdAt: pred(2 * HOD) },
      { id: idOd(), conversationId: 1, userId: 2, content: 'Super, díky. Kdo může v sobotu vzít odpolední navíc?', createdAt: pred(95 * MIN) },
      { id: idOd(), conversationId: 1, userId: 6, content: 'Já můžu, mám volno.', createdAt: pred(40 * MIN) },
    ],
    dostupnost: dostupnost(d, idOd),
    objednavky: [
      { id: idOd(), supplier: 'Pražírna Pod Věží', items: [{ name: 'Espresso zrna „Domácí směs"', qty: 10, unit: 'kg', itemId: 1 }], totalCost: 6200, status: 'ordered', note: 'Dodání ve čtvrtek dopoledne.', createdAt: pred(28 * HOD), receivedAt: null, createdBy: 1 },
      { id: idOd(), supplier: 'Makro', items: [{ name: 'Sirup karamel', qty: 4, unit: 'ks', itemId: 7 }, { name: 'Ovesný nápoj barista', qty: 24, unit: 'l', itemId: 4 }], totalCost: 1908, status: 'received', note: null, createdAt: pred(9 * 24 * HOD), receivedAt: pred(8 * 24 * HOD), createdBy: 1 },
    ],
    precteno: new Set(),
    zaviraciPostupHotov: true,
    navodPrecten: true,
    dalsiId: id,
    notifikace: [
      { id: 1, title: 'Nový úkol', body: 'Doplnit sirupy u baru', type: 'info', link: null, is_read: false, created_at: pred(3 * HOD) },
    ],
  };
  return stav;
}

export const lideVTymu = () => LIDE;
export { PRACUJICI, KDO_JSEM, clen };
