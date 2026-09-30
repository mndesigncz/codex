// Managero client (věrnost, rezervace, stoly) ze strany podniku a ankety
// v chatu. Hosté jsou vymyšlení, jen s křestním jménem a iniciálou příjmení.

import { ok, type Obsluha } from '../typy';
import { posunDen } from '../cas';
import { formatMoney } from '@/lib/money';

const HOSTE = [
  { id: 101, name: 'Jana D.', email: 'jana@ukazka.example', points: 320, stamps: 6, visits: 18, joined_at: '2026-02-11', last_visit_at: -2, reservations: 7, open_coupons: 1 },
  { id: 102, name: 'Petr N.', email: 'petr@ukazka.example', points: 140, stamps: 2, visits: 9, joined_at: '2026-04-02', last_visit_at: -5, reservations: 3, open_coupons: 0 },
  { id: 103, name: 'Tereza M.', email: 'tereza@ukazka.example', points: 880, stamps: 7, visits: 41, joined_at: '2025-11-20', last_visit_at: -1, reservations: 12, open_coupons: 2 },
  { id: 104, name: 'Ondřej B.', email: 'ondrej@ukazka.example', points: 60, stamps: 1, visits: 4, joined_at: '2026-08-29', last_visit_at: -20, reservations: 1, open_coupons: 0 },
];

const STOLY = [
  { id: 1, name: 'U okna', seats: 4, storyous_desk_id: null, active: true },
  { id: 2, name: 'Velký stůl', seats: 8, storyous_desk_id: null, active: true },
  { id: 3, name: 'Zahrádka 1', seats: 2, storyous_desk_id: null, active: true },
  { id: 4, name: 'Bar', seats: 3, storyous_desk_id: null, active: true },
];

export const klient: Obsluha = (p, k) => {
  const s = k.stav;
  const { cesta, q } = p;

  if (cesta === '/api/polls') return ok({ polls: [] });

  if (cesta === '/api/client/admin/summary') {
    return ok({
      enabled: true, slug: 'kavarna-u-lipy', reservations: { requested: 1, today: 2 }, orders: { new: 1, today: 9 },
      members: 148, newMembers30: 23, attention: 2, reviews: { count: 61, avg: 4.7, new7: 5, low7: 0 },
      setup: { enabled: true, menu: true, tables: 4, tablesPaired: 4, pos: true, location: true, reservationsOn: true, orderingOn: true, loyaltyOn: true, pointsPer100: 10, stampTarget: 8 },
    });
  }
  if (cesta === '/api/client/admin/reservations') {
    return ok({
      reservations: [
        { id: 11, date: s.dnes, time: '17:30', party: 4, status: 'requested', note: 'Oslava narozenin, prosíme o klidnější stůl.', customer_name: 'Jana D.', customer_email: 'jana@ukazka.example', table_id: 1, table_name: 'U okna', phone: null },
        { id: 12, date: s.dnes, time: '18:30', party: 2, status: 'confirmed', note: null, customer_name: 'Petr N.', customer_email: 'petr@ukazka.example', table_id: 3, table_name: 'Zahrádka 1', phone: null },
        { id: 13, date: posunDen(s.dnes, 1), time: '19:00', party: 8, status: 'confirmed', note: 'Malá degustace pro kolegy z práce.', customer_name: 'Tereza M.', customer_email: 'tereza@ukazka.example', table_id: 2, table_name: 'Velký stůl', phone: null },
      ],
      tables: STOLY, range: q.get('range') ?? null,
    });
  }
  if (cesta === '/api/client/admin/tables') return ok({ tables: STOLY, posConnected: true });
  if (cesta === '/api/client/admin/reviews') {
    return ok({
      reviews: [
        { id: 1, ref: 'ord:12', rating: 5, note: 'Nejlepší flat white v okolí a milá obsluha.', created_at: `${posunDen(s.dnes, -1)} 17:10:00`, customer_name: 'Jana D.', crew: [{ name: 'Eliška Nováková', avatar: '👱‍♀️' }] },
        { id: 2, ref: 'res:14', rating: 4, note: null, created_at: `${posunDen(s.dnes, -3)} 12:00:00`, customer_name: 'Tereza M.', crew: [] },
      ],
      count: 61, avg: 4.7, dist: [1, 1, 4, 16, 39],
    });
  }
  if (cesta === '/api/client/admin/loyalty') {
    return ok({
      summary: { members: 148, newMembers30: 23, points: 18420, credit: 3150, stamps: 612, visits: 1840, couponsOpen: 9, couponsRedeemed: 47, pointsGiven30: 2310, pointsSpent30: 1180 },
      recent: [
        { id: 1, customer_name: 'Jana D.', delta: 40, note: `Útrata ${formatMoney(400)}`, created_at: new Date(Date.now() - 3 * 3600000).toISOString() },
        { id: 2, customer_name: 'Tereza M.', delta: -120, note: 'Kupon: káva zdarma', created_at: new Date(Date.now() - 26 * 3600000).toISOString() },
      ],
      series: Array.from({ length: 14 }, (_, i) => ({ day: posunDen(s.dnes, i - 13), points_given: 60 + (i * 7) % 40, points_spent: 20 + (i * 5) % 25, new_members: i % 3, redeemed: i % 2 })),
    });
  }
  if (cesta === '/api/client/admin/customers') {
    return ok({ customers: HOSTE.map(h => ({ ...h, last_visit_at: posunDen(s.dnes, h.last_visit_at) })), total: 148 });
  }
  if (cesta === '/api/client/admin/profile') {
    return ok({
      profile: {
        enabled: true, slug: 'kavarna-u-lipy', loyalty_on: true, points_per_100: 10, cashback_pct: 0, cashback_mode: 'credit', stamp_target: 8, stamp_reward: 'Káva zdarma',
        silver_at: 10, gold_at: 25, platinum_at: 0, member_discount: 0, silver_discount: 5, gold_discount: 10, platinum_discount: 0, reservations_on: true, ordering_on: true,
        max_party: 8, lead_days: 30, slot_minutes: 30, description: 'Malá ukázková kavárna s vymyšlenými daty.', tagline: 'Káva, snídaně a klid na práci',
        address: 'Ukázková 1, Brno', logo_url: '', cover_url: '', gallery: [], accent: '', order_qr_required: false, order_geo: 'off', lat: null, lng: null,
      },
      url: '',
    });
  }
  return undefined;
};
