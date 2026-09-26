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
  poznamky: { tone: TonRady; title: string; text: string }[];
  poznamka: string;
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
}
export interface SouhrnApi {
  currency: string | null; revenue: number | null; wages: number | null; laborPct: number | null;
  missingClosings: number; pendingApproval: number; onShiftNow: number; stockAlerts: number;
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
    })) : [],
    celkem: {
      currency: typeof t.currency === 'string' ? t.currency : null,
      revenue: nebo(t.revenue), wages: nebo(t.wages), laborPct: nebo(t.laborPct),
      missingClosings: cis(t.missingClosings), pendingApproval: cis(t.pendingApproval),
      onShiftNow: cis(t.onShiftNow), stockAlerts: cis(t.stockAlerts),
    },
  };
}

export const urlPrehledu = (mesic: string) => `/api/organization/overview?month=${mesic}`;

/** Podnik „potřebuje pozornost": chybí uzávěrka, čeká schválení nebo dochází sklad. */
export const potrebujePozornost = (r: RadekPodnikuApi) => r.missingClosings > 0 || r.pendingApproval > 0 || r.stockAlerts > 0;
