// Peníze a doplňky: tržby z pokladny po dnech, finance měsíce, marže,
// účtenky, nápady, plánovací tabule. Čísla se skládají z uzávěrek ve stavu
// (routy/uzaverky.ts), takže odeslaná uzávěrka změní i přehledy financí.

import { ok, type Obsluha } from '../typy';
import { NAZEV_PODNIKU, clen } from '../data/lide';
import { posunDen } from '../cas';
import type { DemoStav } from '../stav';
import { posSouhrn } from './zaklad';
import { formatMoney } from '@/lib/money';

// Prodávané položky a jejich podíl na tržbě (součet 1). Ceny jsou ukázkové.
const MENU: { productId: string; name: string; category: string; price: number; podil: number; naklad: number }[] = [
  { productId: 'p1', name: 'Flat white', category: 'Káva', price: 79, podil: 0.22, naklad: 14 },
  { productId: 'p2', name: 'Cappuccino', category: 'Káva', price: 69, podil: 0.17, naklad: 12 },
  { productId: 'p3', name: 'Espresso', category: 'Káva', price: 55, podil: 0.09, naklad: 8 },
  { productId: 'p4', name: 'Latte s příchutí', category: 'Káva', price: 85, podil: 0.12, naklad: 19 },
  { productId: 'p5', name: 'Croissant máslový', category: 'Pečivo', price: 49, podil: 0.13, naklad: 18 },
  { productId: 'p6', name: 'Domácí koláč', category: 'Pečivo', price: 59, podil: 0.11, naklad: 22 },
  { productId: 'p7', name: 'Domácí limonáda', category: 'Nápoje', price: 59, podil: 0.09, naklad: 13 },
  { productId: 'p8', name: 'Bagel se šunkou', category: 'Jídlo', price: 95, podil: 0.07, naklad: 38 },
];

const HODINY_PODIL = [0, 0, 0, 0, 0, 0, 0, 0.04, 0.1, 0.13, 0.11, 0.09, 0.1, 0.09, 0.07, 0.06, 0.07, 0.06, 0.05, 0.03, 0, 0, 0, 0];

function trzbaDne(s: DemoStav, den: string): { total: number; cash: number; card: number; bills: number; tips: number } {
  if (den === s.dnes) { const p = posSouhrn(); return { total: p.total, cash: p.cash, card: p.card, bills: p.bills, tips: p.tips }; }
  const u = s.uzaverky.filter(x => x.shift_date === den);
  const cash = u.reduce((a, x) => a + x.cash_revenue, 0);
  const card = u.reduce((a, x) => a + x.card_revenue, 0);
  return { total: cash + card, cash, card, bills: u.reduce((a, x) => a + x.customers, 0), tips: u.reduce((a, x) => a + x.tips, 0) };
}

function dnyRozsahu(od: string, doo: string): string[] {
  const out: string[] = [];
  for (let d = od, n = 0; d <= doo && n < 400; d = posunDen(d, 1), n++) out.push(d);
  return out;
}

export const finance: Obsluha = (p, k) => {
  const s = k.stav;
  const { cesta, q } = p;

  if (cesta === '/api/pos/daily') {
    const od = q.get('from') ?? s.dnes;
    const doo = q.get('to') ?? od;
    const dny = dnyRozsahu(od, doo);
    const rady = dny.map(d => ({ d, ...trzbaDne(s, d) }));
    const total = rady.reduce((a, x) => a + x.total, 0);
    const cash = rady.reduce((a, x) => a + x.cash, 0);
    const card = rady.reduce((a, x) => a + x.card, 0);
    const bills = rady.reduce((a, x) => a + x.bills, 0);
    const tips = rady.reduce((a, x) => a + x.tips, 0);
    const other = s.dnes >= od && s.dnes <= doo ? posSouhrn().other : 0;
    const items = MENU.map(m => {
      const revenue = Math.round(total * m.podil / 10) * 10;
      return { productId: m.productId, name: m.name, category: m.category, qty: Math.round(revenue / m.price), price: m.price, revenue };
    });
    return ok({
      connected: true, from: od, to: doo, today: s.dnes, placeName: NAZEV_PODNIKU, menuError: null, lastSyncAt: new Date().toISOString(),
      totals: {
        bills, total, cash, card, other, tips, tipsCash: Math.round(tips * 0.4), tipsCard: Math.round(tips * 0.6), discounts: 0, refundCount: 0, refundTotal: 0,
        methods: other ? [{ id: 'meal', label: 'stravenky', amount: other }] : [], avgBill: bills ? Math.round(total / bills) : 0,
        soldQty: items.reduce((a, x) => a + x.qty, 0), productRevenue: items.reduce((a, x) => a + (x.revenue ?? 0), 0),
      },
      days: rady.map(x => ({ day: x.d, bills: x.bills, cash: x.cash, card: x.card, other: 0, total: x.total, tips: x.tips, tipsCash: Math.round(x.tips * 0.4), tipsCard: Math.round(x.tips * 0.6), discounts: 0, refundCount: 0, refundTotal: 0, persons: 0, closings: x.d === s.dnes ? 0 : 1, declared: null, diff: null })),
      hours: HODINY_PODIL.map(h => Math.round(total * h / 10) * 10),
      byPerson: [{ name: clen(2).name, total: Math.round(total * 0.55), bills: Math.round(bills * 0.55) }, { name: clen(3).name, total: Math.round(total * 0.45), bills: Math.round(bills * 0.45) }],
      items, notes: [], note: 'Účtenky vystavené do 6:00 patří k předchozímu dni.',
    });
  }
  if (cesta === '/api/pos/margins') {
    const mesic = q.get('month') ?? s.dnes.slice(0, 7);
    const tr = s.uzaverky.filter(u => u.shift_date.startsWith(mesic + '-')).reduce((a, u) => a + u.cash_revenue + u.card_revenue, 0) || 180000;
    const items = MENU.map(m => { const revenue = Math.round(tr * m.podil / 10) * 10; return { productId: m.productId, name: m.name, category: m.category, qty: Math.round(revenue / m.price), revenue, cost: m.naklad, marginPct: Math.round((1 - m.naklad / m.price) * 100) }; });
    const cogs = items.reduce((a, x) => a + x.qty * (x.cost ?? 0), 0);
    return ok({
      connected: true, ready: true, month: mesic, menuError: null,
      totals: { revenue: tr, revenueKnown: tr, cogs, margin: tr - cogs, marginPct: Math.round((1 - cogs / tr) * 100), products: items.length, noRecipe: 0, noRecipeShare: 0 },
      items, insights: [{ icon: 'trend', tone: 'good', title: 'Káva drží marži', text: 'Nápoje z kávy mají přes 80 % marže, pečivo kolem 60 %.' }],
    });
  }
  if (cesta === '/api/pos/products') {
    return ok({
      connected: true,
      products: MENU.map(m => ({ productId: m.productId, name: m.name, category: m.category, price: m.price })),
      recipes: [],
      unmapped: MENU.slice(0, 3).map(m => ({ productId: m.productId, productName: m.name, soldCount: Math.round(m.podil * 400) })),
    });
  }
  if (cesta === '/api/pos/insights') return ok({ hours: HODINY_PODIL.map(h => Math.round(180000 * h / 10) * 10), byWeekday: [] });
  if (cesta === '/api/pos/margins/status' || cesta === '/api/pos/places') return ok({ connected: true });

  if (cesta === '/api/finance') {
    const mesic = q.get('month') ?? s.dnes.slice(0, 7);
    const predchozi = posunDen(`${mesic}-01`, -1).slice(0, 7);
    const uz = s.uzaverky.filter(u => u.shift_date.startsWith(mesic + '-'));
    const cash = uz.reduce((a, u) => a + u.cash_revenue, 0);
    const card = uz.reduce((a, u) => a + u.card_revenue, 0);
    const tips = uz.reduce((a, u) => a + u.tips, 0);
    const revenue = cash + card;
    const mzdy = Math.round(revenue * 0.27);
    const nakupy = Math.round(revenue * 0.31);
    const stockValue = Math.round(s.zasoby.reduce((a, z) => a + z.quantity * z.unitCost, 0));
    return ok({
      month: mesic, prevMonth: predchozi,
      summary: {
        revenue, cash, card, tips, purchases: nakupy, wagesCash: 0, wagesWorked: mzdy, totalOut: nakupy + mzdy, gross: revenue - nakupy - mzdy,
        stockValue, prevRevenue: Math.round(revenue * 0.93), closingsCount: uz.length, diffSum: -60, diffAbs: 180, eventsRevenue: 0,
        stockTop: s.zasoby.slice().sort((a, b) => b.quantity * b.unitCost - a.quantity * a.unitCost).slice(0, 3).map(z => ({ name: z.name, value: Math.round(z.quantity * z.unitCost) })),
        laborTargetPct: 30, mzdySkryte: false,
      },
      guest: { orders: 0, total: 0, offPos: 0, offPosTotal: 0, members: 0, newMembers: 0, couponsRedeemed: 0 },
      ledger: [
        { date: posunDen(s.dnes, -2), kind: 'receipt', label: 'Pražírna Pod Věží', amount: 6200, receiptId: 1, photoUrl: null, note: 'Káva na dva týdny' },
        { date: posunDen(s.dnes, -5), kind: 'receipt', label: 'Makro', amount: 3480, receiptId: 2, photoUrl: null, note: 'Mléko, sirupy, ubrousky' },
      ],
      insights: [
        { icon: 'trend', title: 'Tržba roste', text: 'Proti minulému měsíci o 7 %, hlavně díky víkendům.', tone: 'good' },
        { icon: 'coins', title: 'Kasa sedí', text: `Za měsíc rozdíl −${formatMoney(60)} celkem.`, tone: 'info' },
      ],
    });
  }
  if (cesta === '/api/finance/advice') {
    return ok({
      month: q.get('month') ?? s.dnes.slice(0, 7), prevMonth: '',
      advice: [
        { group: 'revenue', tone: 'info', icon: 'calendar', title: 'Pondělí je nejslabší den', text: `Průměr ${formatMoney(14600)} proti ${formatMoney(26100)} v sobotu.`, action: 'Zkus pondělní nabídku na snídani.' },
        { group: 'stock', tone: 'warn', icon: 'box', title: 'Ovesný nápoj se spotřebovává rychleji', text: 'Za týden o třetinu víc než dřív.' },
      ],
      blind: ['Marže u položek bez receptury se nedá spočítat.'], counts: { revenue: 1, products: 0, people: 0, stock: 1, guests: 0 },
    });
  }
  if (cesta === '/api/receipts') return ok({ receipts: [
    { id: 2, photoUrl: null, supplier: 'Makro', amount: 3480, note: 'Mléko, sirupy, ubrousky', createdAt: new Date(Date.now() - 5 * 86400000).toISOString(), authorName: clen(1).name },
    { id: 1, photoUrl: null, supplier: 'Pražírna Pod Věží', amount: 6200, note: 'Káva na dva týdny', createdAt: new Date(Date.now() - 2 * 86400000).toISOString(), authorName: clen(1).name },
  ] });

  if (cesta === '/api/shift-reviews') return ok(q.get('month') ? { days: [] } : { date: q.get('date'), reviews: [], shifts: [] });
  if (cesta === '/api/suggestions') {
    return ok({
      isEmployer: s.role === 'vedeni', meId: s.role === 'vedeni' ? 1 : 3,
      suggestions: [
        { id: 11, title: 'Druhý mlýnek na kávu', content: 'Ráno se na jediný mlýnek čeká, druhý by ušetřil fronty.', status: 'new', authorId: 3, authorName: clen(3).name, authorAvatar: clen(3).avatar, createdAt: new Date(Date.now() - 6 * 86400000).toISOString(), votes: 4, hasVoted: false },
        { id: 12, title: 'Ovesný nápoj v akci', content: null, status: 'planned', authorId: 6, authorName: clen(6).name, authorAvatar: clen(6).avatar, createdAt: new Date(Date.now() - 16 * 86400000).toISOString(), votes: 9, hasVoted: true },
      ],
    });
  }
  if (cesta === '/api/planning') {
    return ok([
      { id: 1, title: 'Sezónní káva: dýňové latte', description: 'Ochutnávka pro tým v pondělí.', column: 'ideas', position: 0 },
      { id: 2, title: 'Servis mlýnku', description: 'Technik přijede ve čtvrtek.', column: 'in_progress', position: 0 },
      { id: 3, title: 'Podzimní ceník', description: null, column: 'review', position: 0 },
      { id: 4, title: 'Nový sklad kelímků', description: null, column: 'done', position: 0 },
    ]);
  }
  if (cesta === '/api/noisium') return ok({ connected: false, projectId: null, teamName: NAZEV_PODNIKU });
  return undefined;
};
