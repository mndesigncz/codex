// Ostatní části, které se objevují na přehledech (odměny, objednávky od stolu):
// jen tolik dat, aby widgety ukázaly obsah místo prázdného stavu.

import { ok, type Obsluha } from '../typy';
import { KDO_JSEM, LIDE, clen } from '../data/lide';
import { posunDen } from '../cas';
import { mojeRole } from './zaklad';

const UROVNE = [
  { name: 'Nováček', minPoints: 0, perks: '' },
  { name: 'Barista', minPoints: 150, perks: 'Sleva 10 % na vlastní nákup' },
  { name: 'Mistr', minPoints: 500, perks: 'Sleva 20 % a přednostní výběr směn' },
  { name: 'Legenda', minPoints: 1200, perks: 'Sleva 30 % a bonus k výplatě' },
];
const BODY = { task: 5, procedure: 10, closing: 15, ratingStar: 4, taskMissed: -5, procedureSkipped: -2, procedureMissed: -4, closingMissing: -10, closingBalanced: 3 };

/** Body lidí v ukázce (stabilní; tabulka ukazuje pořadí i postup do další úrovně). */
const BODY_LIDI: Record<number, number> = { 2: 640, 3: 236, 4: 122, 5: 410, 6: 74 };

function uroven(body: number) {
  let i = 0;
  UROVNE.forEach((u, idx) => { if (body >= u.minPoints) i = idx; });
  const dalsi = UROVNE[i + 1] ?? null;
  const od = UROVNE[i].minPoints;
  return {
    levelName: UROVNE[i].name, levelIndex: i, perks: UROVNE[i].perks,
    next: dalsi ? { name: dalsi.name, minPoints: dalsi.minPoints, perks: '' } : null,
    pctToNext: dalsi ? Math.round(((body - od) / (dalsi.minPoints - od)) * 100) : 100,
    pointsIntoLevel: body - od, pointsForNext: dalsi ? dalsi.minPoints - od : 0,
  };
}

const rozpis = (b: number) => ({ tasks: Math.round(b / 30), procedures: Math.round(b / 60), closings: Math.round(b / 80), reviewPoints: Math.round(b * 0.4), ratedShifts: Math.round(b / 35), autoPoints: 0, itemPoints: 0, flagged: 0 });

export const ostatni: Obsluha = (p, k) => {
  const s = k.stav;
  const { cesta, metoda } = p;
  const meId = KDO_JSEM[s.role];
  const opr = new Set(mojeRole(s).opravneni);

  if (cesta === '/api/rewards' && metoda === 'GET') {
    const moje = BODY_LIDI[meId] ?? 0;
    const ja = { points: moje, breakdown: rozpis(moje), ...uroven(moje) };
    const reviews = [
      { work_date: posunDen(s.dnes, -1), rating: 5, note: 'Skvěle zvládnutý páteční nával, díky!', points: 20, autoPoints: 0, flagged: false, scope: 'shift', seen_at: null, created_at: `${posunDen(s.dnes, -1)}T21:00:00Z` },
      { work_date: posunDen(s.dnes, -4), rating: 4, note: null, points: 16, autoPoints: 0, flagged: false, scope: 'individual', seen_at: `${posunDen(s.dnes, -3)}T08:00:00Z`, created_at: `${posunDen(s.dnes, -4)}T21:00:00Z` },
    ];
    const telo: Record<string, unknown> = { role: s.role === 'vedeni' ? 'employer' : 'employee', levels: UROVNE, points: BODY, me: ja, reviews, items: [], unseenFlagged: 0 };
    if (opr.has('odmeny.zebricek') || s.role === 'vedeni') {
      telo.standings = LIDE.filter(l => l.role === 'employee').map(l => {
        const b = BODY_LIDI[l.id] ?? 0;
        return { id: l.id, name: l.name, avatar: l.avatar, points: b, breakdown: rozpis(b), flagged: 0, flaggedUnseen: 0, pending: l.id === 6 ? 2 : 0, oldestPending: l.id === 6 ? posunDen(s.dnes, -3) : null, ...uroven(b) };
      }).sort((a, b) => b.points - a.points);
    }
    return ok(telo);
  }
  if (cesta === '/api/rewards/catalog') {
    return ok({
      catalog: [
        { id: 1, team_id: 1, title: 'Káva zdarma na směně', icon: '☕', cost: 50, active: true, zOrganizace: false, sdileno: false, spravuje: null },
        { id: 2, team_id: 1, title: 'Volný pátek', icon: null, cost: 300, active: true, zOrganizace: false, sdileno: false, spravuje: null },
        { id: 3, team_id: 1, title: 'Oběd na účet podniku', icon: '🍝', cost: 120, active: true, zOrganizace: false, sdileno: false, spravuje: null },
      ],
      redemptions: [],
    });
  }

  if (cesta === '/api/client/staff/inbox') {
    // Dvě objednávky od stolu, ať widget na tabletu a v přehledu ukáže, jak vypadá provoz.
    const cas = new Date(Date.now() - 4 * 60000).toISOString().replace('T', ' ').slice(0, 19);
    return ok({
      orders: [
        { id: 71, status: 'new', items: [{ name: 'Flat white', count: 2, price: 79 }, { name: 'Croissant máslový', count: 1, price: 49 }], total: 207, created_at: cas, customer_name: 'Jana D.', table_name: 'U okna', via_qr: true, geo_status: 'ok', geo_distance_m: 9, storyous_order_id: null },
      ],
      reservations: [],
      newCount: 1, stuck: 0,
      pos: { connected: true, autoPos: true, tables: 8, tablesPaired: 8, items: 24, itemsLinked: 24 },
    });
  }
  return undefined;
};
