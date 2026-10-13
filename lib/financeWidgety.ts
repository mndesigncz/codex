// Čistá logika widgetů tržeb, financí a organizace (kolo 69, balík B5b).
//
// Bez Reactu a bez aliasu `@/`, aby ji šlo testovat přímo v Node
// (scripts/testy/k69-b5b.ts). Komponenty (components/widgety/oblasti/{trzby,
// finance,organizace}.tsx, components/employer/*) si odsud berou výběr dat
// z odpovědí API, období a výpočty — kreslení zůstává u nich.
//
// Proč výběr (`vyber*`) místo holé odpovědi: widget nesmí z nečekaného tvaru
// udělat nuly. Chybějící `summary` nebo `advice` je chyba widgetu (ErrorState
// se „Zkusit znovu"), ne „0 Kč"; a null z API (tržby, které role v podniku
// nesmí vidět) zůstává null, ne nula, která by tvrdila, že podnik nic neutržil.

import { dayPlus, parseDbTime, pragueDayOf, pragueMomentOf, pragueToday } from './pragueTime.ts';
import { okJson } from './api.ts';
import { vyresPreset } from './obdobi.ts';
import { dnesJesteChybi } from './uzaverkyOrganizace.ts';
import { earnedFor } from './wages.ts';
import { konecSmeny, rozeberZaznam, type ClenRosteru, type ZaznamDochazky } from './dochazkaPrehled.ts';

const cis = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const nebo = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const text = (v: unknown) => (typeof v === 'string' ? v : '');

export type TonRady = 'good' | 'warn' | 'info';
export interface RadaSIkonou { icon: string; title: string; text: string; tone: TonRady }

function rady(list: unknown): RadaSIkonou[] {
  return Array.isArray(list) ? list
    .filter((i: any) => i && typeof i.title === 'string')
    .map((i: any) => ({
      icon: typeof i.icon === 'string' ? i.icon : 'bulb', title: i.title, text: text(i.text),
      tone: i.tone === 'good' || i.tone === 'warn' ? i.tone : 'info',
    })) : [];
}

// ---------------------------------------------------------------------------
// Období a měsíc
// ---------------------------------------------------------------------------

/** Období widgetu tržeb → dny od–do (pražské „RRRR-MM-DD"). `mesic` = od prvního dne měsíce do dneška. */
export function obdobiPokladny(id: unknown, dnes: string = pragueToday()): { from: string; to: string; popis: string } {
  // „rozmezi:RRRR-MM-DD:RRRR-MM-DD" = vlastní rozmezí (jednotný model období, lib/obdobi).
  const rm = /^rozmezi:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/.exec(String(id));
  if (rm) return rm[2] < rm[1] ? { from: rm[2], to: rm[1], popis: 'Rozmezí' } : { from: rm[1], to: rm[2], popis: 'Rozmezí' };
  // „mesic:RRRR-MM" = celý vybraný měsíc (u dnešního jen do dneška, budoucí dny nemají tržbu).
  // `popis` nese přímo „RRRR-MM"; název měsíce v jazyce uživatele skládá widget.
  const mm = /^mesic:(\d{4})-(\d{2})$/.exec(String(id));
  if (mm) {
    const mesic = `${mm[1]}-${mm[2]}`;
    const od = `${mesic}-01`;
    const posledni = `${mesic}-${String(new Date(Date.UTC(Number(mm[1]), Number(mm[2]), 0)).getUTCDate()).padStart(2, '0')}`;
    const konec = posledni < dnes ? posledni : dnes < od ? od : dnes;
    return { from: od, to: konec, popis: mesic };
  }
  switch (id) {
    case 'vcera': return { from: dayPlus(dnes, -1), to: dayPlus(dnes, -1), popis: 'Včera' };
    case 'tyden': { const x = vyresPreset('tyden', dnes); return { from: x.od, to: x.do, popis: 'Tento týden' }; }
    case 'minuly_mesic': { const x = vyresPreset('minuly_mesic', dnes); return { from: x.od, to: x.do, popis: 'Minulý měsíc' }; }
    case '90_dni': return { from: dayPlus(dnes, -89), to: dnes, popis: 'Poslední 3 měsíce' };
    case '180_dni': return { from: dayPlus(dnes, -179), to: dnes, popis: 'Posledních 6 měsíců' };
    case '365_dni': return { from: dayPlus(dnes, -364), to: dnes, popis: 'Poslední rok' };
    case '7_dni': return { from: dayPlus(dnes, -6), to: dnes, popis: 'Posledních 7 dní' };
    case '14_dni': return { from: dayPlus(dnes, -13), to: dnes, popis: 'Posledních 14 dní' };
    case '30_dni': return { from: dayPlus(dnes, -29), to: dnes, popis: 'Posledních 30 dní' };
    case 'mesic':
    case 'tento_mesic': return { from: `${dnes.slice(0, 7)}-01`, to: dnes, popis: 'Tento měsíc' };
    default: return { from: dnes, to: dnes, popis: 'Dnes' };
  }
}

/** Dny od–do včetně (poledne UTC, ať přechod letního času den nepřeskočí). Strop 400 dní. */
export function dnyObdobi(od: string, doDne: string): string[] {
  const out: string[] = [];
  for (let d = od; d <= doDne && out.length < 400; d = dayPlus(d, 1)) out.push(d);
  return out;
}

/** Měsíce, do kterých období sahá (jeden nebo dva „RRRR-MM") — pro kalendář uzávěrek po měsících. */
export const mesiceObdobi = (od: string, doDne: string) => [...new Set([od.slice(0, 7), doDne.slice(0, 7)])];

// ---------------------------------------------------------------------------
// Pokladna: /api/pos/daily
// ---------------------------------------------------------------------------

export interface DenPokladny {
  day: string; bills: number; cash: number; card: number; other: number; total: number;
  tips: number; refundCount: number; refundTotal: number;
  closings: number; declared: number | null; diff: number | null;
}
export interface PolozkaPokladny { productId: string; name: string; category: string | null; qty: number; revenue: number | null }
export interface OsobaPokladny { name: string; total: number; bills: number }
/** Otevřený (ještě nezaplacený) účet v pokladně. */
export interface OtevrenyUcet { id: string; stul: string | null; od: string; castka: number; hoste: number | null; kdo: string | null; den: string }
export interface OtevreneUcty {
  pocet: number; soucet: number;
  /** Kdy byl otevřen nejstarší z nich (ISO), null = žádný. */
  nejstarsi: string | null;
  poDnech: Record<string, { pocet: number; soucet: number }>;
  ucty: OtevrenyUcet[];
}
export interface SouctyPokladny {
  bills: number; total: number; cash: number; card: number; other: number; tips: number;
  tipsCash: number; tipsCard: number; refundCount: number; refundTotal: number;
  /** Slevy na účtenkách a smazané (stornované) účty v období (kolo 81); starší server = nuly. */
  discounts: number; voidCount: number; voidTotal: number;
  avgBill: number; soldQty: number; productRevenue: number;
  methods: { id: string; label: string; amount: number }[];
}

/** Odpověď /api/pos/daily vybraná pro widgety. Obal (nikdy null), aby „nepropojeno" nebylo „načítám". */
export interface DenniPokladna {
  propojeno: boolean;
  from: string; to: string;
  misto: string | null;
  posledniSynchronizace: string | null;
  soucty: SouctyPokladny;
  dny: DenPokladny[];
  hodiny: number[];
  obsluha: OsobaPokladny[];
  polozky: PolozkaPokladny[];
  /** Rozpracovaná tržba: účty, které ještě nikdo nezaplatil. Nejsou v `soucty` ani v `dny`. */
  otevrene: OtevreneUcty;
  poznamky: { tone: TonRady; title: string; text: string }[];
  poznamka: string;
}

/** `open` z /api/pos/daily; starší odpověď bez něj = žádné otevřené účty. */
export function vyberOtevrene(raw: any): OtevreneUcty {
  const prazdne: OtevreneUcty = { pocet: 0, soucet: 0, nejstarsi: null, poDnech: {}, ucty: [] };
  if (!raw || typeof raw !== 'object') return prazdne;
  const poDnech: OtevreneUcty['poDnech'] = {};
  if (raw.byDay && typeof raw.byDay === 'object') {
    for (const [d, v] of Object.entries(raw.byDay as Record<string, any>)) poDnech[d] = { pocet: cis(v?.count), soucet: cis(v?.total) };
  }
  return {
    pocet: cis(raw.count), soucet: cis(raw.total),
    nejstarsi: typeof raw.oldestSince === 'string' ? raw.oldestSince : null,
    poDnech,
    ucty: Array.isArray(raw.items) ? raw.items.map((o: any) => ({
      id: text(o?.id), stul: o?.desk != null && String(o.desk) !== '' ? String(o.desk) : null, od: text(o?.since),
      castka: cis(o?.total), hoste: nebo(o?.persons), kdo: text(o?.who).trim() || null, den: text(o?.day),
    })) : [],
  };
}

export function vyberDenniPokladnu(raw: any): DenniPokladna {
  if (!raw || typeof raw !== 'object') throw new Error('Pokladna odpověděla v nečekaném tvaru.');
  const t = raw.totals ?? {};
  return {
    propojeno: raw.connected === true && !!raw.totals,
    from: text(raw.from), to: text(raw.to),
    misto: text(raw.placeName).trim() || null,
    posledniSynchronizace: typeof raw.lastSyncAt === 'string' ? raw.lastSyncAt : null,
    soucty: {
      bills: cis(t.bills), total: cis(t.total), cash: cis(t.cash), card: cis(t.card), other: cis(t.other), tips: cis(t.tips),
      tipsCash: cis(t.tipsCash), tipsCard: cis(t.tipsCard), refundCount: cis(t.refundCount), refundTotal: cis(t.refundTotal),
      discounts: cis(t.discounts), voidCount: cis(t.voidCount), voidTotal: cis(t.voidTotal),
      avgBill: cis(t.avgBill), soldQty: cis(t.soldQty), productRevenue: cis(t.productRevenue),
      methods: Array.isArray(t.methods) ? t.methods.map((m: any) => ({ id: text(m?.id), label: text(m?.label) || text(m?.id), amount: cis(m?.amount) })) : [],
    },
    dny: Array.isArray(raw.days) ? raw.days.map((d: any) => ({
      day: text(d?.day), bills: cis(d?.bills), cash: cis(d?.cash), card: cis(d?.card), other: cis(d?.other), total: cis(d?.total),
      tips: cis(d?.tips), refundCount: cis(d?.refundCount), refundTotal: cis(d?.refundTotal),
      closings: cis(d?.closings), declared: nebo(d?.declared), diff: nebo(d?.diff),
    })) : [],
    hodiny: Array.isArray(raw.hours) ? raw.hours.map(cis) : [],
    obsluha: Array.isArray(raw.byPerson) ? raw.byPerson.map((p: any) => ({ name: text(p?.name) || 'Bez jména', total: cis(p?.total), bills: cis(p?.bills) })) : [],
    polozky: Array.isArray(raw.items) ? raw.items.map((i: any) => ({
      productId: text(i?.productId) || text(i?.name), name: text(i?.name) || 'Bez názvu', category: text(i?.category) || null,
      qty: cis(i?.qty), revenue: nebo(i?.revenue),
    })) : [],
    otevrene: vyberOtevrene(raw.open),
    poznamky: rady(raw.notes).map(({ tone, title, text: t2 }) => ({ tone, title, text: t2 })),
    poznamka: text(raw.note),
  };
}

/**
 * Kasa proti uzávěrkám: dny s rozdílem nad práh a dny s tržbou bez uzávěrky.
 * Dnešek se nepočítá — uzávěrka se píše až na konci směny a „rozdíl" by byl
 * celá tržba. Čistý rozdíl sčítá jen dny, kde uzávěrka je.
 */
export function kasaProtiUzaverkam(dny: DenPokladny[], prah: number, dnes: string) {
  const minule = dny.filter(x => x.day < dnes);
  const mimo = minule.filter(x => x.diff != null && Math.abs(x.diff) > prah);
  const bezUzaverky = minule.filter(x => x.closings === 0 && x.total > 0);
  const cisty = minule.reduce((s, x) => s + (x.diff ?? 0), 0);
  return { mimo, bezUzaverky, cisty, vse: [...mimo, ...bezUzaverky].sort((a, b) => b.day.localeCompare(a.day)) };
}

/** Z /api/closings/calendar tržby po dnech; bez tržeb (jen vlastní uzávěrky) je to chyba, ne nuly. */
export function vyberKalendarTrzeb(raw: any): Record<string, number> {
  if (!raw || typeof raw !== 'object' || !raw.days || typeof raw.days !== 'object') throw new Error('Uzávěrky přišly v nečekaném tvaru.');
  if (raw.selfOnly === true) throw new Error('Tržby z uzávěrek vidí jen ten, kdo smí vidět všechny uzávěrky.');
  const out: Record<string, number> = {};
  for (const [den, v] of Object.entries(raw.days as Record<string, any>)) if (v && v.revenue != null) out[den] = cis(v.revenue);
  return out;
}

// ---------------------------------------------------------------------------
// Finance: /api/finance
// ---------------------------------------------------------------------------

/** Položka objednávky dodavateli, jak ji nese kniha výdajů (kolo 81). */
export interface PolozkaObjednavky { name: string; qty: number; unit: string }

export interface RadekKnihy {
  date: string; kind: string; label: string; amount: number;
  receiptId?: number; photoUrl?: string | null; note?: string | null;
  /** Kategorie účtenky (KATEGORIE_UCTENEK); null = starší účtenka bez kategorie. */
  category?: KategorieUctenky | null;
  /** Objednávka dodavateli: id, položky a kdo ji zadal — pro detail v knize výdajů. */
  orderId?: number;
  items?: PolozkaObjednavky[];
  orderedBy?: string | null;
  /** Dodavatel (účtenka i objednávka) pro seskupení „Podle dodavatele"; null = bez jména. */
  supplier?: string | null;
}

export interface FinanceMesice {
  mesic: string;
  /** Rozsah měsíců „RRRR-MM" (kolo 8); u jednoho měsíce od = do = mesic. Srovnávané období: predOd–predDo. */
  od: string; do: string; mesicu: number;
  predOd: string; predDo: string;
  souhrn: {
    revenue: number; prevRevenue: number; cash: number; card: number; tips: number;
    purchases: number; wagesCash: number; wagesWorked: number; gross: number; diffSum: number;
    /** Pevné náklady měsíce (nájem, energie…) a výsledek po nich (kolo 81). */
    fixedCosts: number; net: number;
    /** Podnik má pevné náklady vyplněné; bez nich je `net` = `gross` a widget to řekne. */
    fixedCostsSet: boolean;
    stockValue: number; stockTop: { name: string; value: number }[];
    laborTargetPct: number | null; closingsCount: number; mzdySkryte: boolean;
    /** Odpracované hodiny započítané do mezd za měsíc a za minulý měsíc (kolo 8); starší server = 0. */
    wagesHours: number; prevWagesHours: number;
  };
  hoste: { orders: number; total: number; offPos: number; offPosTotal: number; members: number; newMembers: number; couponsRedeemed: number };
  /** Dny v týdnu (0 = pondělí): tržba z uzávěrek, dny s uzávěrkou, odpracované hodiny — vždy sedm řádků. */
  dnyVTydnu: DenTydneFinanci[];
  kniha: RadekKnihy[];
  postrehy: RadaSIkonou[];
}

export interface DenTydneFinanci { poradi: number; trzba: number; dnu: number; hodiny: number }

export function vyberFinance(raw: any): FinanceMesice {
  if (!raw || typeof raw !== 'object' || !raw.summary || typeof raw.summary !== 'object') throw new Error('Finance přišly v nečekaném tvaru.');
  const s = raw.summary; const g = raw.guest ?? {};
  const mesic = text(raw.month);
  const od = text(raw.from) || mesic, doM = text(raw.to) || od;
  return {
    mesic,
    od, do: doM, mesicu: Math.max(1, cis(raw.months) || pocetMesicuRozsahu(od, doM)),
    predOd: text(raw.prevFrom) || text(raw.prevMonth), predDo: text(raw.prevTo) || text(raw.prevMonth),
    souhrn: {
      revenue: cis(s.revenue), prevRevenue: cis(s.prevRevenue), cash: cis(s.cash), card: cis(s.card), tips: cis(s.tips),
      purchases: cis(s.purchases), wagesCash: cis(s.wagesCash), wagesWorked: cis(s.wagesWorked), gross: cis(s.gross), diffSum: cis(s.diffSum),
      // Starší server pevné náklady neposílá: výsledek je pak hrubý a `fixedCostsSet` false — nic se nevymýšlí.
      fixedCosts: cis(s.fixedCosts),
      net: s.net == null ? cis(s.gross) : cis(s.net),
      fixedCostsSet: s.fixedCostsSet === true,
      stockValue: cis(s.stockValue),
      stockTop: Array.isArray(s.stockTop) ? s.stockTop.map((i: any) => ({ name: text(i?.name), value: cis(i?.value) })) : [],
      laborTargetPct: nebo(s.laborTargetPct),
      closingsCount: cis(s.closingsCount),
      mzdySkryte: s.mzdySkryte === true,
      wagesHours: cis(s.wagesHours), prevWagesHours: cis(s.prevWagesHours),
    },
    hoste: {
      orders: cis(g.orders), total: cis(g.total), offPos: cis(g.offPos), offPosTotal: cis(g.offPosTotal),
      members: cis(g.members), newMembers: cis(g.newMembers), couponsRedeemed: cis(g.couponsRedeemed),
    },
    dnyVTydnu: Array.from({ length: 7 }, (_, i) => {
      const w = Array.isArray(raw.weekdays) ? raw.weekdays.find((x: any) => Number(x?.wd) === i) : null;
      return { poradi: i, trzba: cis(w?.revenue), dnu: cis(w?.days), hodiny: cis(w?.hours) };
    }),
    kniha: Array.isArray(raw.ledger) ? raw.ledger.map((r: any) => ({
      date: text(r?.date), kind: text(r?.kind), label: text(r?.label), amount: cis(r?.amount),
      receiptId: r?.receiptId != null ? Number(r.receiptId) : undefined, photoUrl: r?.photoUrl ?? null, note: r?.note ?? null,
      category: jeKategorieUctenky(r?.category) ? r.category : null,
      orderId: r?.orderId != null ? Number(r.orderId) : undefined,
      items: Array.isArray(r?.items) ? r.items.filter((i: any) => i && typeof i.name === 'string')
        .map((i: any) => ({ name: i.name, qty: cis(i.qty), unit: text(i.unit) })) : undefined,
      orderedBy: text(r?.orderedBy).trim() || null,
      supplier: text(r?.supplier).trim() || null,
    })) : [],
    postrehy: rady(raw.insights),
  };
}

/**
 * Adresa /api/finance pro měsíc („RRRR-MM") nebo rozsah měsíců („RRRR-MM:RRRR-MM", kolo 8).
 * Jeden měsíc jde dál přes `?month=`, ať sondy a mezipaměť widgetů drží stejnou URL jako dřív.
 */
export const urlFinanci = (obdobi: string) => {
  const r = rozsahMesicu(obdobi);
  return r.od === r.do ? `/api/finance?month=${r.od}` : `/api/finance?from=${r.od}&to=${r.do}`;
};

// ---------------------------------------------------------------------------
// Období Financí: měsíc nebo rozsah měsíců (kolo 8, R8-4)
// ---------------------------------------------------------------------------
//
// Hlavička Financí dřív uměla jen ‹ měsíc ›. Square a Toast mají výběr rozsahu a „compare to":
// předchozí období nebo stejné období loni. Období stránky je tu řetězec „RRRR-MM" nebo
// „RRRR-MM:RRRR-MM" — stejný tvar nese MesicStrankyFinanci do widgetů, takže souhrn nahoře,
// Kam šly peníze i kniha výdajů ukazují vždycky týž rozsah (a jednu URL).

export type PresetObdobiFinanci = 'tento_mesic' | 'minuly_mesic' | 'ctvrtleti' | 'od_zacatku_roku' | 'lonsky_rok' | 'vlastni';
export type SrovnaniFinanci = 'predchozi' | 'loni';

export const PRESETY_OBDOBI_FINANCI: PresetObdobiFinanci[] = ['tento_mesic', 'minuly_mesic', 'ctvrtleti', 'od_zacatku_roku', 'lonsky_rok', 'vlastni'];

/** Měsíc posunutý o `o` měsíců („RRRR-MM"). */
export function posunMesice(mesic: string, o: number): string {
  const [y, m] = mesic.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + o, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Kolik měsíců má rozsah od–do včetně (obrácený nebo vadný = 1). */
export function pocetMesicuRozsahu(od: string, doM: string): number {
  const [y1, m1] = od.split('-').map(Number); const [y2, m2] = doM.split('-').map(Number);
  const n = (y2 - y1) * 12 + (m2 - m1) + 1;
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

const JE_MESIC = /^\d{4}-\d{2}$/;

/** „RRRR-MM" nebo „RRRR-MM:RRRR-MM" → { od, do }; vadný nebo obrácený tvar = dnešní měsíc. */
export function rozsahMesicu(obdobi: string, dnes: string = pragueToday()): { od: string; do: string } {
  const [a, b] = String(obdobi).split(':');
  const od = JE_MESIC.test(a) ? a : dnes.slice(0, 7);
  const doM = b != null && JE_MESIC.test(b) ? b : od;
  return doM < od ? { od: doM, do: od } : { od, do: doM };
}

/** Zpět do řetězce období: jeden měsíc bez dvojtečky. */
export const obdobiZRozsahu = (od: string, doM: string): string => (od === doM ? od : `${od}:${doM}`);

/** Rozsah měsíců z rychlé volby k danému „dnes" (čtvrtletí a rok jen do dnešního měsíce — budoucí měsíce nemají co ukázat). */
export function rozsahZVolby(preset: Exclude<PresetObdobiFinanci, 'vlastni'>, dnes: string = pragueToday()): { od: string; do: string } {
  const mesic = dnes.slice(0, 7);
  const [y, m] = mesic.split('-').map(Number);
  switch (preset) {
    case 'tento_mesic': return { od: mesic, do: mesic };
    case 'minuly_mesic': { const p = posunMesice(mesic, -1); return { od: p, do: p }; }
    case 'ctvrtleti': return { od: `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, '0')}`, do: mesic };
    case 'od_zacatku_roku': return { od: `${y}-01`, do: mesic };
    case 'lonsky_rok': return { od: `${y - 1}-01`, do: `${y - 1}-12` };
  }
}

/** Stejně dlouhý rozsah bezprostředně před tímhle (totéž, co počítá server jako prevRevenue). */
export function predchoziRozsahMesicu(od: string, doM: string): { od: string; do: string } {
  const n = pocetMesicuRozsahu(od, doM);
  return { od: posunMesice(od, -n), do: posunMesice(od, -1) };
}

/** Tytéž měsíce o rok dřív („stejné období loni"). */
export const lonskyRozsah = (od: string, doM: string): { od: string; do: string } => ({ od: posunMesice(od, -12), do: posunMesice(doM, -12) });

/** Rozsah ke srovnání podle volby: předchozí období, nebo stejné období loni. */
export function rozsahSrovnani(obdobi: string, srovnani: SrovnaniFinanci): string {
  const r = rozsahMesicu(obdobi);
  const x = srovnani === 'loni' ? lonskyRozsah(r.od, r.do) : predchoziRozsahMesicu(r.od, r.do);
  return obdobiZRozsahu(x.od, x.do);
}

/** Měsíce rozsahu od nejnovějšího (pro knihu výdajů po měsících). */
export function mesiceRozsahu(od: string, doM: string): string[] {
  const out: string[] = [];
  for (let m = doM; m >= od && out.length < 36; m = posunMesice(m, -1)) out.push(m);
  return out;
}

/** Změna čtyř čísel souhrnu proti srovnávanému období (%); null, kde srovnávané období nic nemá. */
export function zmenySouhrnu(ted: FinanceMesice, pred: FinanceMesice | null): { trzby: number | null; nakupy: number | null; mzdy: number | null; vysledek: number | null } {
  if (!pred) return { trzby: zmenaProti(ted.souhrn.revenue, ted.souhrn.prevRevenue), nakupy: null, mzdy: null, vysledek: null };
  const vys = (a: number, b: number) => (b !== 0 ? Math.round(((a - b) / Math.abs(b)) * 100) : null);
  return {
    trzby: zmenaProti(ted.souhrn.revenue, pred.souhrn.revenue),
    nakupy: zmenaProti(ted.souhrn.purchases, pred.souhrn.purchases),
    mzdy: ted.souhrn.mzdySkryte || pred.souhrn.mzdySkryte ? null : zmenaProti(mzdyMesice(ted), mzdyMesice(pred)),
    // Výsledek může být záporný: změna proti absolutní hodnotě (ze −10 000 na −5 000 je +50 %).
    vysledek: vys(ted.souhrn.net, pred.souhrn.net),
  };
}

/** Mzdy měsíce: odpracováno × sazba, a když docházka chybí, denní výplaty (jako dřív FinanceView). */
export const mzdyMesice = (f: FinanceMesice) => Math.max(f.souhrn.wagesCash, f.souhrn.wagesWorked);

/**
 * Podíl mezd na tržbách v % a jestli je nad cílem podniku. Bez tržeb nebo se
 * skrytými mzdami (role bez finance.mzdy) null — nula by tvrdila „mzdy nic
 * nestojí". Bez nastaveného cíle `nadCilem` null: cíl si widget nevymýšlí.
 */
export function podilMezd(f: FinanceMesice): { podil: number; cil: number | null; nadCilem: boolean | null } | null {
  if (f.souhrn.mzdySkryte || f.souhrn.revenue <= 0) return null;
  const podil = Math.round((mzdyMesice(f) / f.souhrn.revenue) * 100);
  const cil = f.souhrn.laborTargetPct;
  return { podil, cil, nadCilem: cil == null ? null : podil > cil };
}

/**
 * Tržba na odpracovanou hodinu (SPLH): celé jednotky měny; null bez hodin nebo se skrytými mzdami
 * (bez finance.mzdy API hodiny neposílá — nula by tvrdila, že nikdo nepracoval).
 */
export function trzbaNaHodinu(trzba: number, hodiny: number): number | null {
  if (!(hodiny > 0) || !(trzba >= 0)) return null;
  return Math.round(trzba / hodiny);
}

export interface KcNaHodinuDne { poradi: number; kcH: number | null; nejslabsi: boolean }

/**
 * Kč na hodinu práce po dnech v týdnu (pondělí první), nejslabší den z těch, které hodiny i tržbu mají,
 * je označený — „v úterý odpoledne je obsluhy moc" se tak vidí na jeden pohled.
 */
export function kcNaHodinuPoDnech(f: Pick<FinanceMesice, 'dnyVTydnu' | 'souhrn'>): KcNaHodinuDne[] {
  if (f.souhrn.mzdySkryte) return f.dnyVTydnu.map(d => ({ poradi: d.poradi, kcH: null, nejslabsi: false }));
  const radky = f.dnyVTydnu.map(d => ({ poradi: d.poradi, kcH: d.dnu > 0 ? trzbaNaHodinu(d.trzba, d.hodiny) : null, nejslabsi: false }));
  const sHodnotou = radky.filter(r => r.kcH != null && r.kcH > 0);
  if (sHodnotou.length >= 2) {
    const min = Math.min(...sHodnotou.map(r => r.kcH as number));
    const prvni = radky.find(r => r.kcH === min);
    if (prvni) prvni.nejslabsi = true;
  }
  return radky;
}

/** Kam šly peníze: nákupy, výdaje z kasy a mzdy (jen když nejsou skryté); nuly vypadnou. */
export function kamSlyPenize(f: FinanceMesice): { klic: 'nakupy' | 'kasa' | 'mzdy'; castka: number; pct: number }[] {
  const soucet = (druhy: string[]) => f.kniha.filter(r => druhy.includes(r.kind)).reduce((a, r) => a + r.amount, 0);
  const r = [
    { klic: 'nakupy' as const, castka: soucet(['receipt', 'order']) },
    { klic: 'kasa' as const, castka: soucet(['expense']) },
    ...(f.souhrn.mzdySkryte ? [] : [{ klic: 'mzdy' as const, castka: mzdyMesice(f) }]),
  ].filter(x => x.castka > 0);
  const max = Math.max(1, ...r.map(x => x.castka));
  return r.map(x => ({ ...x, pct: Math.max(2, Math.round((x.castka / max) * 100)) }));
}

/** Změna proti minulému měsíci v %, nebo null, když minulý měsíc nic neměl. */
export const zmenaProti = (ted: number, predtim: number) => (predtim > 0 ? Math.round(((ted - predtim) / predtim) * 100) : null);

// ---------------------------------------------------------------------------
// Pevné náklady podniku (teams.fixed_costs) — kolo 81
// ---------------------------------------------------------------------------

/** Jeden řádek pevných nákladů: nájem, energie, pojištění… Částka za měsíc, celé jednotky měny. */
export interface PevnyNaklad { name: string; amount: number }

export const MAX_PEVNYCH_NAKLADU = 20;
export const MAX_NAZEV_NAKLADU = 40;

/**
 * Očistí pole pevných nákladů z API nebo formuláře. Vrátí null, když tvar
 * nesedí (není pole, přes 20 řádků, prázdný nebo dlouhý název, záporná nebo
 * necelá částka) — server pak odmítne celou změnu, ne půlku.
 */
export function cistePevneNaklady(raw: unknown): PevnyNaklad[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_PEVNYCH_NAKLADU) return null;
  const out: PevnyNaklad[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') return null;
    const name = typeof (r as any).name === 'string' ? (r as any).name.trim() : '';
    const amount = Number((r as any).amount);
    if (!name || name.length > MAX_NAZEV_NAKLADU) return null;
    if (!Number.isFinite(amount) || amount < 0 || !Number.isInteger(amount)) return null;
    out.push({ name, amount });
  }
  return out;
}

/** Uložené pevné náklady z databáze (JSONB nebo nic) — vadný záznam je prázdný seznam, ne pád. */
export const pevneNakladyZDb = (raw: unknown): PevnyNaklad[] => cistePevneNaklady(raw) ?? [];

/** Součet pevných nákladů za měsíc. */
export const soucetPevnychNakladu = (rows: readonly PevnyNaklad[]): number => rows.reduce((s, r) => s + r.amount, 0);

/** Výsledek po pevných nákladech: hrubý výsledek (tržby − nákupy − mzdy) minus nájem a energie. */
export const cistyVysledek = (gross: number, fixedCosts: number): number => gross - fixedCosts;

/** Částka z pole formuláře („12 000", „1200,00") na celé jednotky; null = nečitelné nebo záporné. */
export function castkaNakladuZPole(text: string): number | null {
  const cisty = String(text).replace(/\s/g, '').replace(',', '.');
  if (!cisty) return null;
  const n = Number(cisty);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

// ---------------------------------------------------------------------------
// Kategorie účtenek (receipts.category) — kolo 81
// ---------------------------------------------------------------------------

/** Pevné hodnoty do databáze; popisky překládá rozhraní (viz popiskyKategorii v komponentách). */
export const KATEGORIE_UCTENEK = ['suroviny', 'napoje', 'provoz', 'vybaveni', 'jine'] as const;
export type KategorieUctenky = typeof KATEGORIE_UCTENEK[number];
export const VYCHOZI_KATEGORIE_UCTENKY: KategorieUctenky = 'suroviny';
/** České popisky (klíče pro `t`): „Suroviny", „Nápoje", „Provoz", „Vybavení", „Jiné". */
export const POPISKY_KATEGORII_CS: Record<KategorieUctenky, string> = {
  suroviny: 'Suroviny', napoje: 'Nápoje', provoz: 'Provoz', vybaveni: 'Vybavení', jine: 'Jiné',
};

export const jeKategorieUctenky = (v: unknown): v is KategorieUctenky => typeof v === 'string' && (KATEGORIE_UCTENEK as readonly string[]).includes(v);

/** Platné datum nákupu („RRRR-MM-DD", ne po dnešku); jinak null. */
export function datumNakupu(v: unknown, dnes: string): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return null;
  return v <= dnes ? v : null;
}

/** Počty účtenek knihy podle kategorie (jen druh receipt); účtenka bez kategorie se počítá jako „jine". */
export function poctyKategorii(kniha: readonly RadekKnihy[]): Record<KategorieUctenky, number> {
  const out = Object.fromEntries(KATEGORIE_UCTENEK.map(k => [k, 0])) as Record<KategorieUctenky, number>;
  for (const r of kniha) if (r.kind === 'receipt') out[r.category ?? 'jine'] += 1;
  return out;
}

// ---------------------------------------------------------------------------
// Slevy z pokladny — kolo 81
// ---------------------------------------------------------------------------

/** Nad kolik procent tržby jsou slevy varování (Chip wait, rada). */
export const PRAH_SLEV_PCT = 5;

/** Podíl slev na tržbě v celých procentech; bez tržby 0 (ne dělení nulou, ne „nekonečno"). */
export function podilSlev(slevy: number, trzba: number): number {
  if (!(trzba > 0) || !(slevy > 0)) return 0;
  return Math.round((slevy / trzba) * 100);
}

export const slevyNadPrah = (slevy: number, trzba: number): boolean => podilSlev(slevy, trzba) > PRAH_SLEV_PCT;

// ---------------------------------------------------------------------------
// Kniha výdajů podle dodavatele — kolo 81
// ---------------------------------------------------------------------------

export interface RadekDodavatele {
  /** Jméno, jak ho napsal první doklad (normalizovaný klíč spojí „Makro" a „MAKRO"). */
  nazev: string;
  klic: string;
  castka: number;
  dokladu: number;
  /** Podíl na všech výdajích knihy v celých procentech. */
  pct: number;
}

const klicDodavatele = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Účtenky a objednávky seskupené podle dodavatele, největší první. Doklad bez
 * dodavatele jde pod „" (rozhraní ho pojmenuje „Bez dodavatele"). Procento je
 * z celé knihy (i mzdy a výdaje z kasy), aby odpovídalo na „kolik z výdajů jde přes Makro".
 */
export function podleDodavatele(kniha: readonly RadekKnihy[]): RadekDodavatele[] {
  const celkem = kniha.reduce((s, r) => s + r.amount, 0);
  const m = new Map<string, RadekDodavatele>();
  for (const r of kniha) {
    if (r.kind !== 'receipt' && r.kind !== 'order') continue;
    const jmeno = (r.supplier ?? '').trim();
    const klic = klicDodavatele(jmeno);
    const z = m.get(klic) ?? { nazev: jmeno, klic, castka: 0, dokladu: 0, pct: 0 };
    z.castka += r.amount; z.dokladu += 1;
    m.set(klic, z);
  }
  return [...m.values()].map(z => ({ ...z, pct: celkem > 0 ? Math.round((z.castka / celkem) * 100) : 0 }))
    .sort((a, b) => b.castka - a.castka || a.nazev.localeCompare(b.nazev, 'cs'));
}

// ---------------------------------------------------------------------------
// Organizace: /api/organization/overview
// ---------------------------------------------------------------------------

export interface RadekPodnikuApi {
  teamId: number; name: string; currency: string;
  /** null = role v tom podniku tržby (mzdy) vidět nesmí. */
  revenue: number | null; wages: number | null;
  closings: number; missingClosings: number; pendingApproval: number;
  members: number; onShiftNow: number; stockAlerts: number;
  /** Dnešek bez uzávěrky (do `missingClosings` se nepočítá — N9) a jestli podnik už zavřel. */
  missingToday: boolean; todayAfterClose: boolean;
}
export interface SouhrnApi {
  currency: string | null; revenue: number | null; wages: number | null; laborPct: number | null;
  missingClosings: number; pendingApproval: number; onShiftNow: number; stockAlerts: number;
  /** Podniky, které dnes už zavřely a uzávěrku ještě nemají. */
  missingTodayAfterClose: number;
}
export interface PrehledOrganizace {
  dostupny: boolean;
  duvod: string | null;
  zprava: string | null;
  mesic: string;
  organizace: string | null;
  podniky: RadekPodnikuApi[];
  celkem: SouhrnApi | null;
}

/** Nedostupný přehled (vypnutý, jeden podnik) je platná odpověď, ne chyba. */
export function vyberPrehled(raw: any): PrehledOrganizace {
  if (!raw || typeof raw !== 'object') throw new Error('Přehled organizace přišel v nečekaném tvaru.');
  if (raw.available !== true) {
    return { dostupny: false, duvod: typeof raw.reason === 'string' ? raw.reason : null, zprava: typeof raw.message === 'string' ? raw.message : null, mesic: '', organizace: null, podniky: [], celkem: null };
  }
  const t = raw.total ?? {};
  return {
    dostupny: true, duvod: null, zprava: null,
    mesic: text(raw.month),
    organizace: typeof raw.organization?.name === 'string' ? raw.organization.name : null,
    podniky: Array.isArray(raw.teams) ? raw.teams.map((r: any) => ({
      teamId: Number(r.teamId), name: text(r.name), currency: text(r.currency) || 'CZK',
      revenue: nebo(r.revenue), wages: nebo(r.wages),
      closings: cis(r.closings), missingClosings: cis(r.missingClosings), pendingApproval: cis(r.pendingApproval),
      members: cis(r.members), onShiftNow: cis(r.onShiftNow), stockAlerts: cis(r.stockAlerts),
      // Jen skutečné true: starší server pole neposílá a z undefined nesmí vzniknout připomínka.
      missingToday: r.missingToday === true, todayAfterClose: r.todayAfterClose === true,
    })) : [],
    celkem: {
      currency: typeof t.currency === 'string' ? t.currency : null,
      revenue: nebo(t.revenue), wages: nebo(t.wages), laborPct: nebo(t.laborPct),
      missingClosings: cis(t.missingClosings), pendingApproval: cis(t.pendingApproval),
      onShiftNow: cis(t.onShiftNow), stockAlerts: cis(t.stockAlerts),
      missingTodayAfterClose: cis(t.missingTodayAfterClose),
    },
  };
}

export const urlPrehledu = (mesic: string) => `/api/organization/overview?month=${mesic}`;

/**
 * Podnik „potřebuje pozornost": chybí uzávěrka (i dnešní, když už podnik
 * zavřel), čeká schválení nebo dochází sklad.
 */
export const potrebujePozornost = (r: RadekPodnikuApi) => r.missingClosings > 0 || r.pendingApproval > 0 || r.stockAlerts > 0
  || dnesJesteChybi(r);

// ---------------------------------------------------------------------------
// Přehledy tržby v čase: týdny, dny v týdnu, kalendář (widget Tržba po dnech)
// ---------------------------------------------------------------------------

/** Den a jeho tržba; budoucí dny a dny bez dat mají 0 (rozliší se podle `dnes`). */
export interface DenTrzbyData { den: string; trzba: number }

/** 0 = pondělí … 6 = neděle. Poledne UTC, ať se den nepřehoupne podle pásma zařízení. */
export const poradiDneVTydnu = (d: string): number => (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7;
/** Pondělí týdne, do kterého den patří. */
export const pondeliTydne = (d: string): string => dayPlus(d, -poradiDneVTydnu(d));

export interface TydenTrzeb {
  od: string; do: string;
  soucet: number;
  /** Dny s nenulovou tržbou (zavřeno / bez dat se nepočítá). */
  dnu: number;
  /** Průměr na den s tržbou; neúplný týden se tak nesrovnává s plným podle součtu. */
  prumer: number;
  /** Změna průměru proti předchozímu týdnu v datech (%); null = není s čím srovnat. */
  zmena: number | null;
}

/** Týdny od pondělí do neděle, nejnovější první; dny po `dnes` se nepočítají. */
export function tydnyTrzeb(dny: readonly DenTrzbyData[], dnes: string): TydenTrzeb[] {
  const m = new Map<string, DenTrzbyData[]>();
  for (const x of dny) {
    if (!x.den || x.den > dnes) continue;
    const k = pondeliTydne(x.den);
    const l = m.get(k) ?? []; l.push(x); m.set(k, l);
  }
  const chronologicky = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, l]) => {
    const dnyL = [...l].sort((a, b) => a.den.localeCompare(b.den));
    const soucet = dnyL.reduce((s, x) => s + x.trzba, 0);
    const dnu = dnyL.filter(x => x.trzba > 0).length;
    return { od: dnyL[0].den, do: dnyL[dnyL.length - 1].den, soucet, dnu, prumer: dnu ? Math.round(soucet / dnu) : 0, zmena: null as number | null };
  });
  chronologicky.forEach((t, i) => { if (i > 0 && chronologicky[i - 1].prumer > 0 && t.prumer > 0) t.zmena = zmenaProti(t.prumer, chronologicky[i - 1].prumer); });
  return chronologicky.reverse();
}

export interface DenVTydnu {
  /** 0 = pondělí … 6 = neděle. */
  poradi: number;
  dnu: number;
  prumer: number;
  nejsilnejsi: boolean;
}

/** Průměrná tržba podle dne v týdnu (jen dny s tržbou do `dnes`); vždy sedm řádků, pondělí první. */
export function dnyVTydnu(dny: readonly DenTrzbyData[], dnes: string): DenVTydnu[] {
  const soucty = Array.from({ length: 7 }, () => ({ soucet: 0, dnu: 0 }));
  for (const x of dny) {
    if (!x.den || x.den > dnes || !(x.trzba > 0)) continue;
    const s = soucty[poradiDneVTydnu(x.den)]; s.soucet += x.trzba; s.dnu += 1;
  }
  const prumery = soucty.map(s => (s.dnu ? Math.round(s.soucet / s.dnu) : 0));
  const max = Math.max(...prumery);
  return soucty.map((s, poradi) => ({ poradi, dnu: s.dnu, prumer: prumery[poradi], nejsilnejsi: max > 0 && prumery[poradi] === max }));
}

export interface BunkaKalendare {
  /** null = buňka mimo zobrazené období (zarovnání na týdny). */
  den: string | null;
  trzba: number | null;
  /** 0–1 podíl na nejsilnějším dni (podbarvení). */
  intenzita: number;
  dnes: boolean;
  budouci: boolean;
}

/** Kalendář po týdnech (pondělí první) přes celé období; řádky jsou týdny shora dolů. */
export function kalendarTrzeb(dny: readonly DenTrzbyData[], dnes: string): BunkaKalendare[][] {
  if (dny.length === 0) return [];
  const trzba = new Map(dny.map(x => [x.den, x.trzba]));
  const od = dny.reduce((m, x) => (x.den < m ? x.den : m), dny[0].den);
  const doD = dny.reduce((m, x) => (x.den > m ? x.den : m), dny[0].den);
  const max = dny.reduce((m, x) => (x.den <= dnes ? Math.max(m, x.trzba) : m), 0);
  const radky: BunkaKalendare[][] = [];
  for (let zacatek = pondeliTydne(od); zacatek <= doD; zacatek = dayPlus(zacatek, 7)) {
    radky.push(Array.from({ length: 7 }, (_, i) => {
      const d = dayPlus(zacatek, i);
      if (d < od || d > doD) return { den: null, trzba: null, intenzita: 0, dnes: false, budouci: false };
      const t = trzba.get(d) ?? 0;
      return { den: d, trzba: t, intenzita: max > 0 && d <= dnes ? Math.min(1, t / max) : 0, dnes: d === dnes, budouci: d > dnes };
    }));
  }
  return radky;
}

/** Kolik minut je účet otevřený (od `od` do `nyni`); neplatný čas nebo budoucnost = 0. */
export function minutOtevrenosti(od: string, nyni: number = Date.now()): number {
  const t = Date.parse(od);
  if (!Number.isFinite(t) || t > nyni) return 0;
  return Math.floor((nyni - t) / 60000);
}

/** Jak dlouho se má účet brát jako „dlouho otevřený" (zapomenutý na stole). */
export const DLOUHO_OTEVRENY_MIN = 120;

/**
 * Je účet z pokladny otevřený (rozpracovaná tržba), ne zaplacený? Ano, když není vrácený, nemá `paid_at`,
 * není fiskalizovaný (uzavřený účet bez `paid_at` je zaplacený, jen to pokladna nenapsala) a má částku.
 * Do tržby se otevřený účet nepočítá; ukazuje se zvlášť (Otevřené účty, detail dne).
 */
export function jeOtevrenyUcet(b: { refunded?: boolean; deleted?: boolean; paidAt?: string | null; fiscalized?: boolean; finalPrice?: number }): boolean {
  return !b.deleted && !b.refunded && b.paidAt == null && !b.fiscalized && Number(b.finalPrice) > 0;
}

/** Kalendáře uzávěrek za víc měsíců najednou (tržba dne z uzávěrek, když pokladna chybí). */
export async function nactiKalendareUzaverek(mesice: readonly string[]): Promise<Record<string, number>> {
  const casti = await Promise.all(mesice.map(m => fetch(`/api/closings/calendar?month=${m}`).then(okJson).then(vyberKalendarTrzeb)));
  return Object.assign({}, ...casti);
}

/** Tržba za hodiny 0 až `hodina` včetně (pole hodin z /api/pos/daily, index = hodina dne). */
export function trzbaDoHodiny(hodiny: readonly number[], hodina: number): number {
  let soucet = 0;
  for (let h = 0; h <= hodina && h < hodiny.length; h++) soucet += Number(hodiny[h]) || 0;
  return soucet;
}

/**
 * Změna dnešní tržby proti stejnému dni minulý týden ke stejné hodině (v %). Porovnává se jen do poslední dokončené hodiny:
 * celodenní součet minulého týdne by dopoledne ukazoval dramatický propad a dnešní rozpracovaná hodina by srovnání křivila.
 * null = nejde (půlnoc, minulý týden nic neprodal).
 */
export function zmenaOprotiMinulemuTydnu(dnes: readonly number[], minuly: readonly number[], hodinaTed: number): { pct: number; doHodiny: number } | null {
  const posledni = hodinaTed - 1;
  if (posledni < 0) return null;
  const min = trzbaDoHodiny(minuly, posledni);
  if (!(min > 0)) return null;
  return { pct: Math.round(((trzbaDoHodiny(dnes, posledni) - min) / min) * 100), doHodiny: hodinaTed };
}

// ---------------------------------------------------------------------------
// Mzdy dnes živě: náklad směny proti dnešní tržbě (kolo 8, R8-4)
// ---------------------------------------------------------------------------
//
// Toast ukazuje labor cost jako % net sales po čtvrthodinách „for in-the-moment
// staffing decisions". Tady totéž z toho, co aplikace už má: roster z
// /api/attendance (kdo je napíchnutý, od kdy, za kolik, jaký má plán) a dnešní
// záznamy docházky (kdo už odešel a kolik to stálo). Tržba je z pokladny.

/** Roster a dnešní záznamy z GET /api/attendance?days=1, jak je potřebuje mzdyDnes. */
export interface DochazkaDnes { roster: ClenRosteru[]; entries: ZaznamDochazky[] | null }

export function vyberDochazkuDnes(raw: any): DochazkaDnes {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.roster)) throw new Error('Docházka přišla v nečekaném tvaru.');
  return {
    roster: raw.roster.filter((r: any) => r && r.id != null).map((r: any) => ({
      id: r.id, name: typeof r.name === 'string' ? r.name : undefined, avatar: r.avatar ?? null,
      openSince: r.openSince ?? null, openEntryId: r.openEntryId ?? null,
      shiftStart: r.shiftStart ?? null, shiftEnd: r.shiftEnd ?? null,
      hourlyRate: r.hourlyRate == null ? null : Number(r.hourlyRate),
    })),
    // Bez dochazka.zobrazit API záznamy neposílá (pole chybí) — hotové dnešní směny pak neznáme.
    entries: Array.isArray(raw.entries) ? raw.entries.filter((e: any) => e && typeof e.clockIn === 'string').map((e: any) => ({
      id: e.id, employeeId: e.employeeId, clockIn: e.clockIn, clockOut: e.clockOut ?? null,
    })) : null,
  };
}

export interface ClovekNaSmene {
  id: string;
  jmeno: string;
  avatar: string | null;
  /** Sazba za hodinu; null = nenastavená (náklad se nepočítá). */
  sazba: number | null;
  /** Od kdy je napíchnutý. */
  od: Date;
  /** Náklad běžící směny do teď. */
  naklad: number;
  /** Plánovaný konec „HH:MM", nebo null bez plánu. */
  planDo: string | null;
}

export interface MzdyDnes {
  /** Náklad odpracovaného času dnes do teď: hotové dnešní směny + běžící × sazby. */
  naklad: number;
  /** Odhad do konce plánu: zbytek běžících směn a celé plánované směny lidí, kteří teprve přijdou. */
  doKonce: number;
  /** Lidé právě na směně, nejdražší první. */
  lide: ClovekNaSmene[];
  /** Lidé s časem dnes, ale bez sazby — jejich náklad v součtu chybí. */
  bezSazby: number;
  /** Dnešní hotové směny jsou v součtu (jen s dochazka.zobrazit); jinak je to jen běžící čas. */
  sHotovymi: boolean;
}

const sazbaClena = (r: ClenRosteru): number | null => (Number.isFinite(Number(r.hourlyRate)) && Number(r.hourlyRate) > 0 ? Number(r.hourlyRate) : null);

/**
 * Dnešní mzdový náklad živě. Běžící směny se berou z rosteru (openSince), hotové
 * z dnešních záznamů (clockOut), ať se jeden záznam nepočítá dvakrát. Zapomenuté
 * odpíchnutí (nad 16 h) a záznamy nad 24 h se nepočítají — stejně jako lib/wages.
 */
export function mzdyDnes(d: DochazkaDnes, ted: number, dnes: string): MzdyDnes {
  let naklad = 0, doKonce = 0, bezSazby = 0;
  const lide: ClovekNaSmene[] = [];
  const sHotovymi = d.entries != null;
  const hotoveDnes = new Set<string>();
  for (const e of d.entries ?? []) {
    if (!e.clockOut) continue;
    const od = parseDbTime(e.clockIn);
    if (!od || pragueDayOf(od) !== dnes) continue;
    const id = String(e.employeeId ?? '');
    const clen = d.roster.find(r => String(r.id) === id);
    const sazba = clen ? sazbaClena(clen) : null;
    const { ms } = rozeberZaznam(e, ted);
    if (ms <= 0) continue;
    hotoveDnes.add(id);
    if (sazba == null) { bezSazby += 1; continue; }
    naklad += earnedFor(ms, sazba);
  }
  for (const r of d.roster) {
    const id = String(r.id);
    const sazba = sazbaClena(r);
    const od = parseDbTime(r.openSince);
    const konec = konecSmeny(dnes, r.shiftStart, r.shiftEnd);
    if (od) {
      const { ms } = rozeberZaznam({ clockIn: r.openSince as string, clockOut: null }, ted);
      const n = sazba != null ? earnedFor(ms, sazba) : 0;
      if (sazba == null && ms > 0 && !hotoveDnes.has(id)) bezSazby += 1;
      naklad += n;
      if (sazba != null && konec && konec.getTime() > ted && konec.getTime() > od.getTime()) doKonce += earnedFor(konec.getTime() - ted, sazba);
      lide.push({ id, jmeno: r.name ?? 'Bez jména', avatar: r.avatar ?? null, sazba, od, naklad: n, planDo: konec ? String(r.shiftEnd).slice(0, 5) : null });
      continue;
    }
    // Teprve přijde: plánovaná směna, která ještě nezačala, stojí celá. Kdo měl začít a nepřišel, se nepočítá —
    // nevíme, jestli přijde; kdo už dnes odpracoval a odešel, je v `naklad`.
    const zacatek = r.shiftStart ? pragueMomentOf(dnes, String(r.shiftStart).slice(0, 5)) : null;
    if (sazba != null && zacatek && konec && zacatek.getTime() > ted && konec.getTime() > zacatek.getTime() && !hotoveDnes.has(id)) {
      doKonce += earnedFor(konec.getTime() - zacatek.getTime(), sazba);
    }
  }
  lide.sort((a, b) => b.naklad - a.naklad || a.jmeno.localeCompare(b.jmeno, 'cs'));
  return { naklad, doKonce, lide, bezSazby, sHotovymi };
}

/** Podíl mzdového nákladu na tržbě v celých %, null bez tržby (nula by tvrdila „lidé nic nestojí"). */
export function podilNakladu(naklad: number, trzba: number): number | null {
  if (!(trzba > 0)) return null;
  return Math.round((naklad / trzba) * 100);
}

// ---------------------------------------------------------------------------
// Teplotní mapa tržeb: den v týdnu × hodina (kolo 8, R8-4)
// ---------------------------------------------------------------------------
//
// Lightspeed „Hourly Performance": heat mapa nejrušnějších období k plánování obsluhy.
// Data z /api/pos/daily?heat=1: 7 řádků (pondělí první) × 24 hodin, v buňce tržba a účtenky
// za celé období, dny s prodejem toho dne v týdnu a průměrný počet lidí na směně.

export interface BunkaHeat { trzba: number; ucty: number; dni: number; lidi: number | null }

/** `heat` z /api/pos/daily; null, když ho odpověď nenese (starší server nebo bez heat=1). */
export function vyberHeat(raw: any): BunkaHeat[][] | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.heat) || raw.heat.length !== 7) return null;
  return raw.heat.map((radek: any) => Array.from({ length: 24 }, (_, h) => {
    const c = Array.isArray(radek) ? radek[h] : null;
    return { trzba: cis(c?.trzba), ucty: cis(c?.ucty), dni: cis(c?.dni), lidi: nebo(c?.lidi) };
  }));
}

export type MetrikaHeat = 'trzba' | 'ucty';

export interface BunkaMapy {
  /** 0 = pondělí … 6 = neděle. */
  den: number;
  hodina: number;
  /** Průměr na den s prodejem (tržba, nebo účtenky) — null, když ten den v týdnu v období neprodával. */
  prumer: number | null;
  /** Celkem za období. */
  celkem: number;
  ucty: number;
  trzba: number;
  dni: number;
  lidi: number | null;
  /** 0–1 podíl na nejsilnější buňce (podbarvení). */
  intenzita: number;
}

export interface MapaTrzeb {
  /** Hodiny otevírací doby, které se kreslí (od první do poslední s prodejem, aspoň tři). */
  hodiny: number[];
  /** Sedm řádků po hodinách z `hodiny`. */
  radky: BunkaMapy[][];
  max: number;
  /** Nejsilnější buňka, nebo null bez prodeje. */
  spicka: BunkaMapy | null;
}

/**
 * Mřížka pro widget: průměr na den (ne součet — pondělků je v období jinak než sobot), podbarvení
 * podle nejsilnější buňky, hodiny jen v otevírací době (hodiny bez jediné účtenky na krajích se vynechají).
 */
export function mapaTrzeb(heat: readonly (readonly BunkaHeat[])[], metrika: MetrikaHeat): MapaTrzeb {
  const sProdejem = Array.from({ length: 24 }, (_, h) => heat.some(r => (r[h]?.ucty ?? 0) > 0));
  let prvni = sProdejem.indexOf(true), posledni = sProdejem.lastIndexOf(true);
  if (prvni < 0) { prvni = 8; posledni = 20; }
  if (posledni - prvni < 2) posledni = Math.min(23, prvni + 2);
  const hodiny = Array.from({ length: posledni - prvni + 1 }, (_, i) => prvni + i);
  const bunky: BunkaMapy[][] = heat.map((r, den) => hodiny.map(h => {
    const c = r[h] ?? { trzba: 0, ucty: 0, dni: 0, lidi: null };
    const celkem = metrika === 'trzba' ? c.trzba : c.ucty;
    return { den, hodina: h, prumer: c.dni > 0 ? Math.round((celkem / c.dni) * 10) / 10 : null, celkem, ucty: c.ucty, trzba: c.trzba, dni: c.dni, lidi: c.lidi, intenzita: 0 };
  }));
  const max = Math.max(0, ...bunky.flat().map(b => b.prumer ?? 0));
  let spicka: BunkaMapy | null = null;
  for (const b of bunky.flat()) {
    b.intenzita = max > 0 && b.prumer != null ? Math.min(1, b.prumer / max) : 0;
    if (b.prumer != null && b.prumer > 0 && (!spicka || b.prumer > spicka.prumer!)) spicka = b;
  }
  return { hodiny, radky: bunky, max, spicka };
}

// ---------------------------------------------------------------------------
// Matice menu: oblíbenost × marže (kolo 8, R8-4)
// ---------------------------------------------------------------------------
//
// Menu engineering (Kasavana & Smith, dnes Toast a meez): položky nad průměrem v prodaných kusech
// i v marži jsou hvězdy (držet), oblíbené s nízkou marží tahouni (zvážit cenu), málo prodávané
// s vysokou marží hádanky (propagovat), obojí pod průměrem psi (zvážit vyřazení). Položky bez
// receptury (bez nákladu) do matice nepatří — jen se přiznají počtem.

export type Kvadrant = 'hvezdy' | 'tahouni' | 'hadanky' | 'psi';
export const KVADRANTY: Kvadrant[] = ['hvezdy', 'tahouni', 'hadanky', 'psi'];

export interface PolozkaMatice { id: string; name: string; qty: number; revenue: number | null; marginPct: number; kvadrant: Kvadrant }

export interface MaticeMenu {
  /** Průměrné prodané kusy a průměrná marže položek s recepturou — hranice kvadrantů. */
  prumerKusy: number;
  prumerMarze: number;
  polozky: PolozkaMatice[];
  pocty: Record<Kvadrant, number>;
  /** Položky bez receptury (bez nákladu) — mimo matici. */
  bezReceptury: number;
}

/** Matice z položek /api/pos/margins; bez položky s marží je prázdná (průměry 0, nic se nekreslí). */
export function maticeMenu(polozky: readonly { id: string; name: string; qty: number; revenue: number | null; marginPct: number | null }[]): MaticeMenu {
  const sMarzi = polozky.filter(p => p.marginPct != null && p.qty > 0);
  const bezReceptury = polozky.filter(p => p.marginPct == null).length;
  const pocty: Record<Kvadrant, number> = { hvezdy: 0, tahouni: 0, hadanky: 0, psi: 0 };
  if (sMarzi.length === 0) return { prumerKusy: 0, prumerMarze: 0, polozky: [], pocty, bezReceptury };
  const prumerKusy = sMarzi.reduce((a, p) => a + p.qty, 0) / sMarzi.length;
  const prumerMarze = sMarzi.reduce((a, p) => a + (p.marginPct as number), 0) / sMarzi.length;
  const out = sMarzi.map((p): PolozkaMatice => {
    const oblibena = p.qty >= prumerKusy, zisková = (p.marginPct as number) >= prumerMarze;
    const kvadrant: Kvadrant = oblibena && zisková ? 'hvezdy' : oblibena ? 'tahouni' : zisková ? 'hadanky' : 'psi';
    pocty[kvadrant] += 1;
    return { id: p.id, name: p.name, qty: p.qty, revenue: p.revenue, marginPct: p.marginPct as number, kvadrant };
  });
  // V každém kvadrantu nejdřív nejprodávanější — na telefonu je seznam to hlavní.
  out.sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name, 'cs'));
  return { prumerKusy: Math.round(prumerKusy * 10) / 10, prumerMarze: Math.round(prumerMarze * 10) / 10, polozky: out, pocty, bezReceptury };
}
