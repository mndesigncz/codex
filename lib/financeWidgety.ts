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

import { dayPlus, pragueToday } from './pragueTime.ts';
import { dnesJesteChybi } from './uzaverkyOrganizace.ts';

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

export interface RadekKnihy {
  date: string; kind: string; label: string; amount: number;
  receiptId?: number; photoUrl?: string | null; note?: string | null;
}

export interface FinanceMesice {
  mesic: string;
  souhrn: {
    revenue: number; prevRevenue: number; cash: number; card: number; tips: number;
    purchases: number; wagesCash: number; wagesWorked: number; gross: number; diffSum: number;
    stockValue: number; stockTop: { name: string; value: number }[];
    laborTargetPct: number | null; closingsCount: number; mzdySkryte: boolean;
  };
  hoste: { orders: number; total: number; offPos: number; offPosTotal: number; members: number; newMembers: number; couponsRedeemed: number };
  kniha: RadekKnihy[];
  postrehy: RadaSIkonou[];
}

export function vyberFinance(raw: any): FinanceMesice {
  if (!raw || typeof raw !== 'object' || !raw.summary || typeof raw.summary !== 'object') throw new Error('Finance přišly v nečekaném tvaru.');
  const s = raw.summary; const g = raw.guest ?? {};
  return {
    mesic: text(raw.month),
    souhrn: {
      revenue: cis(s.revenue), prevRevenue: cis(s.prevRevenue), cash: cis(s.cash), card: cis(s.card), tips: cis(s.tips),
      purchases: cis(s.purchases), wagesCash: cis(s.wagesCash), wagesWorked: cis(s.wagesWorked), gross: cis(s.gross), diffSum: cis(s.diffSum),
      stockValue: cis(s.stockValue),
      stockTop: Array.isArray(s.stockTop) ? s.stockTop.map((i: any) => ({ name: text(i?.name), value: cis(i?.value) })) : [],
      laborTargetPct: nebo(s.laborTargetPct),
      closingsCount: cis(s.closingsCount),
      mzdySkryte: s.mzdySkryte === true,
    },
    hoste: {
      orders: cis(g.orders), total: cis(g.total), offPos: cis(g.offPos), offPosTotal: cis(g.offPosTotal),
      members: cis(g.members), newMembers: cis(g.newMembers), couponsRedeemed: cis(g.couponsRedeemed),
    },
    kniha: Array.isArray(raw.ledger) ? raw.ledger.map((r: any) => ({
      date: text(r?.date), kind: text(r?.kind), label: text(r?.label), amount: cis(r?.amount),
      receiptId: r?.receiptId != null ? Number(r.receiptId) : undefined, photoUrl: r?.photoUrl ?? null, note: r?.note ?? null,
    })) : [],
    postrehy: rady(raw.insights),
  };
}

export const urlFinanci = (mesic: string) => `/api/finance?month=${mesic}`;

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
