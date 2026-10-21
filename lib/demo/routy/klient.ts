// Managero client (věrnost, rezervace, stoly, hosté, kampaně) ze strany podniku a ankety
// v chatu. Hosté jsou vymyšlení, jen s křestním jménem a iniciálou příjmení; data jsou
// v lib/demo/data/klient.ts. Seznam hostů se filtruje a řadí stejnými funkcemi jako server
// (lib/clenoveFiltr.ts), takže čipy segmentů, hledání i řazení v ukázce opravdu fungují.

import { ok, type Obsluha } from '../typy';
import { posunDen } from '../cas';
import { formatMoney } from '@/lib/money';
import { normalizujFiltr, normalizujRazeni, seradCleny, splnujeFiltr, strankuj, maNarozeninyVMesici } from '@/lib/clenoveFiltr';
import { poctySegmentu } from '@/lib/klientSprava/segmentyHostu';
import {
  HOSTE, SKUPINY, STOLY, UROVNE, SLUG, NAZEV, KAMPANE_RAZITEK, STATISTIKA_RAZITEK, KUPONY, PROMO_KODY,
  automatizace, hodnoceni, kampane, menuDesky, plastoveKarty, poukazy, profil, rezervaceDne,
} from '../data/klient';

/** Dny posunu → časové razítko „YYYY-MM-DD HH:MM:SS" (ukázka nepotřebuje zónu). */
const kdy = (dnes: string, dni: number | null, hodina = '10:30') => (dni == null ? null : `${posunDen(dnes, dni)} ${hodina}:00`);

function clenove(dnes: string) {
  return HOSTE.map(h => ({
    id: h.id, name: h.name, email: h.email, points: h.points, stamps: h.stamps, visits: h.visits, spend: h.visits * h.avg, credit: 0,
    joined_at: kdy(dnes, h.joined, '09:00'), last_visit_at: kdy(dnes, h.last), reservations: h.reservations, open_coupons: h.coupons,
    level: h.level, level_label: UROVNE[h.level], level_reduced: false, discount: h.level === 'platinum' ? 10 : h.level === 'gold' ? 5 : 0,
    discount_source: h.level === 'gold' || h.level === 'platinum' ? 'uroven' : null, discount_name: null, blocked: false, birthday: h.birthday,
    skupiny: SKUPINY.filter(g => h.groups.includes(g.id)).map(g => ({ id: g.id, name: g.name, color: g.color })),
  }));
}

/** Řada věrnosti po dnech (31 dní) — tvar radaPoDnech: aktivní, rozdané a utracené body, noví, uplatněné. */
function radaPoDnech(dnes: string) {
  return Array.from({ length: 31 }, (_, i) => {
    const den = posunDen(dnes, i - 30);
    const dt = new Date(den + 'T12:00:00Z').getUTCDay();
    const vikend = dt === 0 || dt === 6;
    const vlna = 1 + 0.25 * Math.sin(i / 3);
    const aktivni = Math.round((vikend ? 46 : 34) * vlna);
    return {
      day: den, active: i === 30 ? 19 : aktivni, points_given: Math.round(aktivni * 21), points_spent: Math.round(aktivni * 8 + (i % 4) * 12),
      new_members: (i * 7) % 5 === 0 ? 2 : i % 3 === 0 ? 1 : 0, redeemed: i % 2 === 0 ? 2 : 1, stamps: Math.round(aktivni * 0.9),
    };
  });
}

function detailHosta(dnes: string, id: number) {
  const h = HOSTE.find(x => x.id === id);
  if (!h) return null;
  const ledger = [
    { id: 1, kind: 'visit', note: 'Razítko za návštěvu · Kávová karta', delta: 0, credit_delta: 0, created_at: kdy(dnes, h.last ?? h.joined, '08:12') },
    { id: 2, kind: 'order', note: `Útrata ${formatMoney(h.avg)}`, delta: Math.round(h.avg / 10), credit_delta: 0, created_at: kdy(dnes, h.last ?? h.joined, '08:13') },
    { id: 3, kind: 'coupon', note: 'Kupon za body: Koláč k flat white', delta: -120, credit_delta: 0, created_at: kdy(dnes, (h.last ?? h.joined) - 9, '15:40') },
    { id: 4, kind: 'visit', note: 'Razítko za návštěvu · Kávová karta', delta: 0, credit_delta: 0, created_at: kdy(dnes, (h.last ?? h.joined) - 9, '15:38') },
    { id: 5, kind: 'welcome', note: 'Uvítací body', delta: 20, credit_delta: 0, created_at: kdy(dnes, h.joined, '09:00') },
  ];
  const claims = h.coupons ? [{ claimed_at: kdy(dnes, (h.last ?? h.joined) - 2, '09:10'), redeemed_at: null, title: 'Káva podle výběru' }] : [];
  return {
    ledger, claims, vouchers: [], orders: h.visits > 10 ? [{ id: 1, total: 186, status: 'done', created_at: kdy(dnes, (h.last ?? h.joined) - 4, '12:20') }] : [],
    kampane: [{ name: 'Kávová karta', required_stamps: 10, reward_title: 'Káva podle výběru', stamps: h.stamps }],
    uroven: { id: h.level, label: UROVNE[h.level], unit: 'visits', nextAt: h.level === 'platinum' ? null : h.level === 'gold' ? 40 : h.level === 'silver' ? 25 : 10, nextLabel: h.level === 'gold' ? 'Platinový host' : h.level === 'silver' ? 'Zlatý host' : h.level === 'bronze' ? 'Stříbrný host' : null },
    clen: { points: h.points, stamps: h.stamps, visits: h.visits, spend: h.visits * h.avg, credit: 0, joined_at: kdy(dnes, h.joined, '09:00'), last_visit_at: kdy(dnes, h.last) },
  };
}

export const klient: Obsluha = (p, k) => {
  const s = k.stav;
  const { cesta, q } = p;
  const dnes = s.dnes;

  if (cesta === '/api/polls') return ok({ polls: [] });

  if (cesta === '/api/client/admin/summary') {
    const dnesni = rezervaceDne(dnes, 0);
    return ok({
      enabled: true, slug: SLUG, reservations: { requested: dnesni.filter(r => r.status === 'requested').length + 1, today: dnesni.filter(r => r.status !== 'requested').length },
      orders: { new: 1, today: 9 }, members: HOSTE.length, newMembers30: HOSTE.filter(h => h.joined > -30).length, attention: 3,
      reviews: { count: 61, avg: 4.7, new7: 5, low7: 1 },
      setup: { enabled: true, menu: true, tables: STOLY.length, tablesPaired: STOLY.filter(t => t.storyous_desk_id).length, pos: true, location: true, reservationsOn: true, orderingOn: true, loyaltyOn: true, pointsPer100: 10, stampTarget: 10, stampReward: 'Káva podle výběru', brand: true, qrPult: false },
    });
  }
  if (cesta === '/api/client/admin/zdravi') {
    const rada = radaPoDnech(dnes);
    return ok({
      noviClenove: { n30: HOSTE.filter(h => h.joined > -30).length, predtim30: 6 },
      odmeny: { uplatneno30: 41, vydano30: 58 },
      navrat: { vratilo: 38, z: 100 },
      dny: rada.slice(-14).map(d => ({ den: d.day, razitek: d.stamps, body: d.points_given, uplatneno: d.redeemed })),
    });
  }
  if (cesta === '/api/client/admin/reservations') {
    if (q.get('month')) {
      const m = q.get('month')!;
      const dny: Record<string, number> = {};
      for (let d = -5; d <= 10; d++) { const den = posunDen(dnes, d); if (den.startsWith(m)) { const n = rezervaceDne(dnes, d).length; if (n) dny[den] = n; } }
      return ok({ dny });
    }
    if (q.get('customer')) return ok({ souhrn: { celkem: 6, nedorazeni: 0, probehlo: 5, posledni: posunDen(dnes, -9) } });
    const range = q.get('range') ?? 'upcoming';
    const den = q.get('date');
    let reservations: any[] = [];
    if (den) { for (let d = -3; d <= 10; d++) if (posunDen(dnes, d) === den) reservations = rezervaceDne(dnes, d); }
    else if (range === 'today') reservations = rezervaceDne(dnes, 0);
    else if (range === 'past') reservations = [-1, -2, -3].flatMap(d => rezervaceDne(dnes, d).map(r => ({ ...r, status: 'done' })));
    else reservations = [0, 1, 2, 3, 4, 5, 6].flatMap(d => rezervaceDne(dnes, d));
    return ok({
      reservations, tables: STOLY, range,
      zapis: { opening_hours: profil().opening_hours, max_party: 8, lead_days: 30, slot_minutes: 30 },
      celkem: reservations.length, pocty: range === 'past' ? { celkem: reservations.length, nedorazeni: 0 } : undefined,
    });
  }
  if (cesta === '/api/client/admin/tables') return ok({ tables: STOLY, posConnected: true });
  if (cesta === '/api/client/admin/floorplan') return ok({ plan: null, tables: STOLY });
  if (cesta === '/api/client/admin/reviews') {
    const reviews = hodnoceni(dnes);
    return ok({ reviews, count: 61, avg: 4.7, dist: [1, 2, 4, 15, 39] });
  }
  if (cesta === '/api/client/admin/loyalty') {
    const id = Number(q.get('customerId'));
    if (id) { const d = detailHosta(dnes, id); return d ? ok(q.get('detail') ? d : { ledger: d.ledger }) : ok({ error: 'Host nenalezen' }, 404); }
    const series = radaPoDnech(dnes);
    return ok({
      summary: { members: HOSTE.length, newMembers30: HOSTE.filter(h => h.joined > -30).length, points: HOSTE.reduce((a, h) => a + h.points, 0), credit: 0, stamps: HOSTE.reduce((a, h) => a + h.stamps, 0), visits: HOSTE.reduce((a, h) => a + h.visits, 0), couponsOpen: 36, couponsRedeemed: 131, pointsGiven30: series.reduce((a, d) => a + d.points_given, 0), pointsSpent30: series.reduce((a, d) => a + d.points_spent, 0) },
      recent: [
        { id: 1, customer_name: 'Jana N.', delta: 21, kind: 'order', note: `Útrata ${formatMoney(212)}`, created_at: new Date(Date.now() - 2 * 3600000).toISOString() },
        { id: 2, customer_name: 'Tereza M.', delta: -120, kind: 'coupon', note: 'Kupon za body: Koláč k flat white', created_at: new Date(Date.now() - 26 * 3600000).toISOString() },
        { id: 3, customer_name: 'Kristýna P.', delta: 20, kind: 'welcome', note: 'Uvítací body', created_at: new Date(Date.now() - 40 * 3600000).toISOString() },
      ],
      series,
    });
  }
  if (cesta === '/api/client/admin/customers') {
    if (q.get('duplicity')) return ok({ skupiny: [], celkem: 0 });
    const vsichni = clenove(dnes);
    const now = new Date(dnes + 'T15:00:00');
    const mesic = Number(dnes.slice(5, 7));
    const filtr = normalizujFiltr(q);
    const kont = { now, mesic, hledatEmail: true, skupinyHosta: (id: number) => new Set(HOSTE.find(h => h.id === id)?.groups ?? []) };
    const vybrani = seradCleny(vsichni.filter(c => splnujeFiltr(c, filtr, kont)), normalizujRazeni(q.get('sort')));
    const strana = strankuj(vybrani, q.get('offset'), q.get('limit'));
    return ok({
      customers: strana.rows.map(({ birthday, ...c }) => ({ ...c, has_birthday_month: maNarozeninyVMesici(birthday, mesic) })),
      total: strana.total, hasMore: strana.hasMore, nextOffset: strana.nextOffset, all: vsichni.length,
      segmenty: poctySegmentu(vsichni.map(c => ({ ...c, narozeninyTentoMesic: maNarozeninyVMesici(c.birthday, mesic) })), now),
    });
  }
  if (cesta === '/api/client/admin/customers/historie') return ok({ clen: detailHosta(dnes, Number(q.get('id')))?.clen ?? null, pocty: { navstevy: 0, body: 0, utraty: 0, kupony: 0, uplatnene: 0, objednavky: 0, poukazy: 0 }, kampane: [], polozky: [], dalsi: false });
  if (cesta === '/api/client/admin/groups') {
    const cid = Number(q.get('customerId'));
    const groups = SKUPINY.map(g => ({ ...g, members: HOSTE.filter(h => h.groups.includes(g.id)).length, discount_pct: 0, rules: null }));
    return ok(cid ? { groups, customerGroupIds: HOSTE.find(h => h.id === cid)?.groups ?? [] } : { groups });
  }
  if (cesta === '/api/client/admin/notes') {
    const h = HOSTE.find(x => x.id === Number(q.get('customerId')));
    return ok({ notes: h?.poznamka ? [{ id: h.id, body: h.poznamka, created_at: kdy(dnes, -40, '11:00'), autor: 'Marta' }] : [] });
  }
  if (cesta === '/api/client/admin/profile') return ok({ profile: profil(), url: `https://www.managero.app/client/${SLUG}`, boards: [{ slug: 'denni', name: 'Denní menu', items: 8, linked: 8 }] });
  if (cesta === '/api/client/admin/broadcast') {
    const dosah = q.get('dosah');
    if (dosah) {
      const pocet = dosah === 'all' ? HOSTE.length : dosah === 'quiet' ? 9 : dosah.startsWith('group:') ? HOSTE.filter(h => h.groups.includes(Number(dosah.slice(6)))).length : dosah === 'tier:silver' ? 24 : dosah === 'tier:gold' ? 9 : 5;
      const push = Math.round(pocet * 0.86);
      return ok({ pocet, souhlas: push, dosah: { push, email: Math.round(pocet * 0.7), bezSouhlasu: pocet - push, bezEmailu: 2, blokovanych: 0, celkem: pocet } });
    }
    return ok(kampane(dnes));
  }
  if (cesta === '/api/client/admin/automatizace') return ok(automatizace());
  if (cesta === '/api/client/admin/stamps') return ok({ campaigns: KAMPANE_RAZITEK });
  if (cesta === '/api/client/admin/stamps/member' && p.metoda === 'GET') {
    const h = HOSTE.find(x => x.id === Number(q.get('customerId')));
    return ok({
      karty: [{ campaignId: 1, nazev: 'Kávová karta', potrebnych: 10, razitek: h?.stamps ?? 0, dokonceno: h ? Math.floor(h.visits / 10) : 0, stav: 'active',
        posledniUdalost: h?.last != null ? { id: 1, kind: 'stamp', delta: 1, completions: 0, kdy: kdy(dnes, h.last, '08:12'), duvod: null } : null }],
      udalosti: [],
    });
  }
  if (cesta === '/api/client/admin/stamps/stats') return ok({ ...STATISTIKA_RAZITEK, poDnech: radaPoDnech(dnes).map(d => ({ den: d.day, razitek: d.stamps, karet: d.redeemed > 1 ? 1 : 0 })) });
  if (cesta === '/api/client/admin/coupons') return ok({ coupons: KUPONY, groups: SKUPINY });
  if (cesta === '/api/client/admin/promos') return ok({ promos: PROMO_KODY });
  if (cesta === '/api/client/admin/vouchers') return ok({ ...poukazy(dnes), dnes, nastaveni: { prodej: false }, poukazBezBodu: true });
  if (cesta === '/api/client/cards') return ok(plastoveKarty(dnes));
  if (cesta === '/api/client/admin/bonus-rules') {
    return ok({ rules: [
      { id: 1, name: 'Dvojitá razítka v úterý', multiplier: 1, stamp_bonus: 1, days: [2], hour_from: 14, hour_till: 17, valid_since: null, valid_till: null, active: false },
      { id: 2, name: 'Šťastná hodina', multiplier: 2, stamp_bonus: 0, days: [1, 2, 3, 4, 5], hour_from: 14, hour_till: 16, valid_since: null, valid_till: null, active: false },
    ], bezi: [] });
  }
  if (cesta === '/api/menu' && p.metoda === 'GET') return ok({ boards: menuDesky() });
  if (cesta === '/api/client/admin/redeem' && p.metoda === 'POST') return ok({ ok: true, title: 'Káva podle výběru', benefit: 'káva zdarma', badges: [] });
  if (cesta === '/api/client/admin/loyalty/prehled') return ok({ dny: radaPoDnech(dnes).map(d => ({ den: d.day, rozdano: d.points_given, utraceno: d.points_spent })), souhrn: {} });
  if (cesta === '/api/client/admin/orders') return ok({ orders: [], souhrn: { pocet: 9, soucet: 2140, hotovych: 8, prumer: 238, neprijato: 0 }, celkem: 0 });
  if (cesta === '/api/client/admin/banners') return ok({ banners: [] });
  void NAZEV;
  return undefined;
};
